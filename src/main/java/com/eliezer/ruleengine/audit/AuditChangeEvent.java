package com.eliezer.ruleengine.audit;

import java.util.Map;

/**
 * Published by {@link AuditTrailListener} from inside a Hibernate flush and consumed by
 * {@link AuditEntryRecorder} at {@code BEFORE_COMMIT}. The indirection is required: persisting from
 * inside the Hibernate listener would re-enter the {@code EntityManager} mid-flush and collide with
 * the in-progress action queue.
 *
 * @param recordType    the VM {@code type()} discriminator for the changed entity
 * @param recordId      the entity identifier, stringified
 * @param operation     CREATE / UPDATE / DELETE
 * @param entityVersion the {@code @Version} value at change time, or {@code null}
 * @param changes       field-level delta, already redacted; {@code null} for a delete
 */
public record AuditChangeEvent(
        String recordType,
        String recordId,
        AuditOperation operation,
        Integer entityVersion,
        Map<String, Object> changes
) {
}
