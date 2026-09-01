package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.domain.AuditableEntity;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.RiskLevel;
import org.hibernate.event.spi.PostDeleteEvent;
import org.hibernate.event.spi.PostInsertEvent;
import org.hibernate.event.spi.PostUpdateEvent;
import org.hibernate.persister.entity.EntityPersister;
import org.hibernate.type.Type;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The branching logic of {@link AuditTrailListener} in isolation — no context, no database. It
 * decides <em>what</em> a change delta contains: which properties count, how each value is
 * rendered, and when nothing should be recorded at all. A surviving mutant here is a field that
 * silently stops being audited or a secret that silently starts leaking, so every branch of
 * {@code skip(...)}, {@code value(...)} and {@code publish(...)} is pinned.
 *
 * <p>The same-transaction persistence of the resulting event is {@link AuditEntryRecorderTest}'s
 * and {@code AuditEntryRecorderIntegrationTest}'s to prove.
 */
class AuditTrailListenerTest {

    private final ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);
    private final AuditTrailListener listener = new AuditTrailListener(publisher);

    // --- insert -------------------------------------------------------------

    @Test
    @DisplayName("onPostInsert publishes CREATE with a {field: {to}} entry per non-null business property")
    void insertRecordsInitialValues() {
        Person p = person();
        String[] names = {"name", "age", "risk", "city"};
        Type[] types = {scalar(), scalar(), scalar(), scalar()};
        Object[] state = {"Dana", 34, RiskLevel.LOW, null};

        listener.onPostInsert(new PostInsertEvent(p, p.getId(), state, persister(names, types), null));

        AuditChangeEvent event = captured();
        assertThat(event.recordType()).isEqualTo("person");
        assertThat(event.recordId()).isEqualTo(p.getId().toString());
        assertThat(event.operation()).isEqualTo(AuditOperation.CREATE);
        assertThat(event.entityVersion()).isEqualTo(0);
        assertThat(event.changes()).containsOnlyKeys("name", "age", "risk"); // city was null → omitted
        assertThat(event.changes().get("risk")).isEqualTo(Map.of("to", "LOW"));
        assertThat(event.changes().get("age")).isEqualTo(Map.of("to", 34));
    }

    @Test
    @DisplayName("onPostInsert skips association, collection and the version property")
    void insertSkipsNonBusinessProperties() {
        Person p = person();
        String[] names = {"name", "caseLinks", "person", "version"};
        Type[] types = {scalar(), collection(), association(), scalar()};
        Object[] state = {"Dana", Set.of(), new Object(), 7};

        listener.onPostInsert(new PostInsertEvent(p, p.getId(), state, persister(names, types), null));

        assertThat(captured().changes()).containsOnlyKeys("name");
    }

    @Test
    void insertOfANonAuditableEntityPublishesNothing() {
        listener.onPostInsert(new PostInsertEvent(new Object(), 1L, new Object[0],
                persister(new String[0], new Type[0]), null));

        verifyNoInteractions(publisher);
    }

    @Test
    @DisplayName("an AuditableEntity with no record-type mapping is not audited")
    void unmanagedAuditableEntityIsSkipped() {
        listener.onPostInsert(new PostInsertEvent(new Unmanaged(), "u-1", new Object[0],
                persister(new String[0], new Type[0]), null));

        verify(publisher, never()).publishEvent(any());
    }

    // --- update -------------------------------------------------------------

    @Test
    @DisplayName("onPostUpdate records only the dirty properties, each as {from, to}")
    void updateRecordsDirtyDeltas() {
        Person p = person();
        String[] names = {"name", "age", "risk"};
        Type[] types = {scalar(), scalar(), scalar()};
        Object[] now = {"Dana", 35, RiskLevel.HIGH};
        Object[] old = {"Dana", 34, RiskLevel.LOW};
        int[] dirty = {1, 2};

        listener.onPostUpdate(new PostUpdateEvent(p, p.getId(), now, old, dirty, persister(names, types), null));

        AuditChangeEvent event = captured();
        assertThat(event.operation()).isEqualTo(AuditOperation.UPDATE);
        assertThat(event.changes()).containsOnlyKeys("age", "risk");
        assertThat(event.changes().get("age")).isEqualTo(Map.of("from", 34, "to", 35));
        assertThat(event.changes().get("risk")).isEqualTo(Map.of("from", "LOW", "to", "HIGH"));
    }

    @Test
    @DisplayName("onPostUpdate excludes a dirty association or version bump")
    void updateExcludesNonBusinessDirtyProperties() {
        Person p = person();
        String[] names = {"risk", "caseLinks", "version"};
        Type[] types = {scalar(), collection(), scalar()};
        Object[] now = {RiskLevel.HIGH, Set.of(new Object()), 2};
        Object[] old = {RiskLevel.LOW, Set.of(), 1};
        int[] dirty = {0, 1, 2};

        listener.onPostUpdate(new PostUpdateEvent(p, p.getId(), now, old, dirty, persister(names, types), null));

        assertThat(captured().changes()).containsOnlyKeys("risk");
    }

    @Test
    @DisplayName("onPostUpdate with no computed old state still publishes an UPDATE, carrying no deltas")
    void updateWithoutOldStatePublishesEmptyChange() {
        Person p = person();

        listener.onPostUpdate(new PostUpdateEvent(p, p.getId(), new Object[]{"Dana"}, null, null,
                persister(new String[]{"name"}, new Type[]{scalar()}), null));

        AuditChangeEvent event = captured();
        assertThat(event.operation()).isEqualTo(AuditOperation.UPDATE);
        assertThat(event.changes()).isEmpty();
    }

    @Test
    @DisplayName("a @Sensitive field is recorded as changed, but both values are '***'")
    void sensitiveFieldIsRedactedOnBothSides() {
        Person p = person();
        String[] names = {"nationalId", "name"};
        Type[] types = {scalar(), scalar()};
        Object[] now = {"NEW-SECRET", "Dana"};
        Object[] old = {"OLD-SECRET", "Dana"};
        int[] dirty = {0};

        listener.onPostUpdate(new PostUpdateEvent(p, p.getId(), now, old, dirty, persister(names, types), null));

        assertThat(captured().changes().get("nationalId")).isEqualTo(Map.of("from", "***", "to", "***"));
    }

    // --- delete -------------------------------------------------------------

    @Test
    @DisplayName("onPostDelete publishes DELETE with null changes")
    void deletePublishesNullChanges() {
        Person p = person();

        listener.onPostDelete(new PostDeleteEvent(p, p.getId(), new Object[0],
                persister(new String[0], new Type[0]), null));

        AuditChangeEvent event = captured();
        assertThat(event.operation()).isEqualTo(AuditOperation.DELETE);
        assertThat(event.changes()).isNull();
    }

    @Test
    void deleteOfANonAuditableEntityPublishesNothing() {
        listener.onPostDelete(new PostDeleteEvent(new Object(), 1L, new Object[0],
                persister(new String[0], new Type[0]), null));

        verifyNoInteractions(publisher);
    }

    // --- value rendering ---------------------------------------------------

    @Test
    @DisplayName("value conversion: enum→name, UUID→string, Temporal→ISO string, scalars pass through")
    void valueConversionCoversEachBranch() {
        Person p = person();
        UUID someId = UUID.randomUUID();
        Instant ts = Instant.parse("2026-01-15T10:00:00Z");
        String[] names = {"e", "u", "t", "n", "b", "s"};
        Type[] types = {scalar(), scalar(), scalar(), scalar(), scalar(), scalar()};
        Object[] state = {RiskLevel.HIGH, someId, ts, 42L, true, "plain"};

        listener.onPostInsert(new PostInsertEvent(p, p.getId(), state, persister(names, types), null));

        Map<String, Object> changes = captured().changes();
        assertThat(changes.get("e")).isEqualTo(Map.of("to", "HIGH"));
        assertThat(changes.get("u")).isEqualTo(Map.of("to", someId.toString()));
        assertThat(changes.get("t")).isEqualTo(Map.of("to", "2026-01-15T10:00:00Z"));
        assertThat(changes.get("n")).isEqualTo(Map.of("to", 42L));
        assertThat(changes.get("b")).isEqualTo(Map.of("to", true));
        assertThat(changes.get("s")).isEqualTo(Map.of("to", "plain"));
    }

    @Test
    void doesNotAskHibernateForPostCommitHandling() {
        assertThat(listener.requiresPostCommitHandling(mock(EntityPersister.class))).isFalse();
    }

    // --- helpers ---------------------------------------------------------

    private AuditChangeEvent captured() {
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(publisher).publishEvent(event.capture());
        assertThat(event.getValue()).isInstanceOf(AuditChangeEvent.class);
        return (AuditChangeEvent) event.getValue();
    }

    private static Person person() {
        return Person.builder()
                .id(UUID.randomUUID())
                .name("Dana")
                .nationalId("NID-1")
                .age(34)
                .city("Tel Aviv")
                .risk(RiskLevel.LOW)
                .build();
    }

    private static EntityPersister persister(String[] names, Type[] types) {
        EntityPersister persister = mock(EntityPersister.class);
        when(persister.getPropertyNames()).thenReturn(names);
        when(persister.getPropertyTypes()).thenReturn(types);
        return persister;
    }

    private static Type scalar() {
        return mock(Type.class);
    }

    private static Type association() {
        Type type = mock(Type.class);
        when(type.isAssociationType()).thenReturn(true);
        return type;
    }

    private static Type collection() {
        Type type = mock(Type.class);
        when(type.isCollectionType()).thenReturn(true);
        return type;
    }

    /** An {@link AuditableEntity} deliberately absent from {@code RecordTypes} — must not be audited. */
    private static final class Unmanaged extends AuditableEntity {
        @Override
        public Object auditId() {
            return "u-1";
        }
    }
}
