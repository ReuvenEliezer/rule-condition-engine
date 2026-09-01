package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.exception.AuditRecordingException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.AuditorAware;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The mapping and failure semantics of {@link AuditEntryRecorder} in isolation: the event becomes
 * an {@link AuditEntry} with the right fields, the actor is resolved (with the {@code system}
 * fallback), and a repository failure is rethrown as {@link AuditRecordingException} — never
 * swallowed — so the enclosing business transaction rolls back with it.
 *
 * <p>That the rollback actually happens, and that the listener runs {@code BEFORE_COMMIT}, is
 * {@code AuditEntryRecorderIntegrationTest}'s to prove — it needs a real transaction.
 */
class AuditEntryRecorderTest {

    private final AuditEntryRepository repository = mock(AuditEntryRepository.class);

    @Test
    @DisplayName("the event is persisted as one AuditEntry with its fields mapped across")
    void persistsOneEntryMappedFromTheEvent() {
        recorder(Optional.of("system")).record(event());

        AuditEntry entry = savedEntry();
        assertThat(entry.getId()).isNotNull();
        assertThat(entry.getRecordType()).isEqualTo("person");
        assertThat(entry.getRecordId()).isEqualTo("id-1");
        assertThat(entry.getOperation()).isEqualTo(AuditOperation.UPDATE);
        assertThat(entry.getEntityVersion()).isEqualTo(3);
        assertThat(entry.getActor()).isEqualTo("system");
        assertThat(entry.getChanges()).containsOnlyKeys("name");
    }

    @Test
    @DisplayName("actor falls back to 'system' when the auditor resolves to empty")
    void actorFallsBackToSystemWhenAuditorIsEmpty() {
        recorder(Optional.empty()).record(event());

        assertThat(savedEntry().getActor()).isEqualTo("system");
    }

    @Test
    @DisplayName("a resolved auditor is recorded verbatim as the actor")
    void resolvedAuditorIsRecordedAsActor() {
        recorder(Optional.of("alice")).record(event());

        assertThat(savedEntry().getActor()).isEqualTo("alice");
    }

    @Test
    @DisplayName("a failed insert is rethrown as AuditRecordingException naming the change, cause chained")
    void failedInsertIsRethrownAsAuditRecordingException() {
        when(repository.save(any())).thenThrow(new DataIntegrityViolationException("record_type is null"));

        assertThatThrownBy(() -> recorder(Optional.of("system")).record(event()))
                .isInstanceOf(AuditRecordingException.class)
                .hasMessageContaining("UPDATE")
                .hasMessageContaining("person")
                .hasMessageContaining("id-1")
                .hasCauseInstanceOf(DataIntegrityViolationException.class);
    }

    // --- helpers ---------------------------------------------------------

    private AuditEntryRecorder recorder(Optional<String> auditor) {
        AuditorAware<String> auditorAware = () -> auditor;
        return new AuditEntryRecorder(repository, auditorAware);
    }

    private static AuditChangeEvent event() {
        return new AuditChangeEvent("person", "id-1", AuditOperation.UPDATE, 3,
                Map.of("name", Map.of("from", "a", "to", "b")));
    }

    private AuditEntry savedEntry() {
        ArgumentCaptor<AuditEntry> saved = ArgumentCaptor.forClass(AuditEntry.class);
        verify(repository).save(saved.capture());
        return saved.getValue();
    }
}
