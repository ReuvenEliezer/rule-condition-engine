package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.domain.AuditableEntity;
import com.eliezer.ruleengine.domain.Sensitive;
import org.hibernate.event.spi.PostDeleteEvent;
import org.hibernate.event.spi.PostDeleteEventListener;
import org.hibernate.event.spi.PostInsertEvent;
import org.hibernate.event.spi.PostInsertEventListener;
import org.hibernate.event.spi.PostUpdateEvent;
import org.hibernate.event.spi.PostUpdateEventListener;
import org.hibernate.persister.entity.EntityPersister;
import org.hibernate.type.Type;
import org.springframework.context.ApplicationEventPublisher;

import java.lang.reflect.Field;
import java.time.temporal.Temporal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Records field-level change deltas for every {@link AuditableEntity} through Hibernate's event SPI
 * — <strong>not</strong> a JPA {@code @PostUpdate} callback, which receives the entity already in
 * its new state and cannot produce before/after values (research R10).
 *
 * <p>It only <em>publishes</em> a Spring event; {@link AuditEntryRecorder} persists it
 * {@code BEFORE_COMMIT}. Persisting from here would re-enter the {@code EntityManager} mid-flush.
 *
 * <p>Applies to every managed record type with no per-type opt-in (FR-028). A field marked
 * {@link Sensitive} is recorded as changed with both values replaced by {@code "***"} (FR-025).
 */
public class AuditTrailListener
        implements PostInsertEventListener, PostUpdateEventListener, PostDeleteEventListener {

    private static final String REDACTED = "***";
    /** The optimistic-lock counter is mechanical and already surfaced as {@code entityVersion}. */
    private static final Set<String> NON_BUSINESS_PROPERTIES = Set.of("version");

    private final ApplicationEventPublisher publisher;
    private final Map<Class<?>, Set<String>> sensitiveFieldsByClass = new ConcurrentHashMap<>();

    public AuditTrailListener(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public void onPostInsert(PostInsertEvent event) {
        if (!(event.getEntity() instanceof AuditableEntity entity)) {
            return;
        }
        String[] names = event.getPersister().getPropertyNames();
        Type[] types = event.getPersister().getPropertyTypes();
        Object[] state = event.getState();
        Set<String> sensitive = sensitiveFields(entity.getClass());

        Map<String, Object> changes = new LinkedHashMap<>();
        for (int i = 0; i < names.length; i++) {
            if (skip(types[i], names[i]) || state[i] == null) {
                continue;
            }
            changes.put(names[i], Map.of("to", value(names[i], state[i], sensitive)));
        }
        publish(entity, AuditOperation.CREATE, changes);
    }

    @Override
    public void onPostUpdate(PostUpdateEvent event) {
        if (!(event.getEntity() instanceof AuditableEntity entity)) {
            return;
        }
        String[] names = event.getPersister().getPropertyNames();
        Type[] types = event.getPersister().getPropertyTypes();
        Object[] now = event.getState();
        Object[] old = event.getOldState();
        int[] dirty = event.getDirtyProperties();
        Set<String> sensitive = sensitiveFields(entity.getClass());

        Map<String, Object> changes = new LinkedHashMap<>();
        if (old != null && dirty != null) {
            for (int i : dirty) {
                if (skip(types[i], names[i])) {
                    continue;
                }
                Map<String, Object> delta = new LinkedHashMap<>();
                delta.put("from", value(names[i], old[i], sensitive));
                delta.put("to", value(names[i], now[i], sensitive));
                changes.put(names[i], delta);
            }
        }
        publish(entity, AuditOperation.UPDATE, changes);
    }

    @Override
    public void onPostDelete(PostDeleteEvent event) {
        if (event.getEntity() instanceof AuditableEntity entity) {
            publish(entity, AuditOperation.DELETE, null);
        }
    }

    @Override
    public boolean requiresPostCommitHandling(EntityPersister persister) {
        return false;
    }

    private void publish(AuditableEntity entity, AuditOperation operation, Map<String, Object> changes) {
        String recordType = RecordTypes.of(entity);
        if (recordType == null) {
            return;
        }
        publisher.publishEvent(new AuditChangeEvent(
                recordType,
                String.valueOf(entity.auditId()),
                operation,
                entity.getVersion(),
                changes));
    }

    private static boolean skip(Type type, String property) {
        return type.isAssociationType() || type.isCollectionType()
                || NON_BUSINESS_PROPERTIES.contains(property);
    }

    private Object value(String property, Object raw, Set<String> sensitive) {
        if (sensitive.contains(property)) {
            return REDACTED;
        }
        return switch (raw) {
            case null -> null;
            case Enum<?> e -> e.name();
            case Number n -> n;
            case Boolean b -> b;
            case String s -> s;
            case Temporal t -> t.toString();
            case UUID u -> u.toString();
            default -> String.valueOf(raw);
        };
    }

    private Set<String> sensitiveFields(Class<?> type) {
        return sensitiveFieldsByClass.computeIfAbsent(type, AuditTrailListener::scanSensitive);
    }

    private static Set<String> scanSensitive(Class<?> type) {
        Set<String> names = new java.util.HashSet<>();
        for (Class<?> c = type; c != null && c != Object.class; c = c.getSuperclass()) {
            for (Field f : c.getDeclaredFields()) {
                if (f.isAnnotationPresent(Sensitive.class)) {
                    names.add(f.getName());
                }
            }
        }
        return names.stream().collect(Collectors.toUnmodifiableSet());
    }
}
