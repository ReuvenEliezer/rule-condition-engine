package com.eliezer.ruleengine.audit;

import java.time.Instant;
import java.util.Map;

/**
 * Read-only projection of an {@link AuditEntry}. Audit history is derived, not a managed record
 * type, so there is no bidirectional VM and no {@code ResourceVm} contract (FR-029).
 */
public record AuditEntryVm(
        String recordType,
        String recordId,
        AuditOperation operation,
        String actor,
        Instant occurredAt,
        Integer entityVersion,
        Map<String, Object> changes
) {

    static AuditEntryVm from(AuditEntry e) {
        return new AuditEntryVm(e.getRecordType(), e.getRecordId(), e.getOperation(),
                e.getActor(), e.getOccurredAt(), e.getEntityVersion(), e.getChanges());
    }
}
