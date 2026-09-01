package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.exception.AuditRecordingException;
import org.springframework.data.domain.AuditorAware;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Persists one {@link AuditEntry} per {@link AuditChangeEvent}, in the <strong>same transaction</strong>
 * as the change it records.
 *
 * <p>{@code BEFORE_COMMIT} runs after the business flush and before the commit, so
 * {@code entityVersion} is already correct and the change and its audit row are atomic (FR-027 as
 * amended). No {@code REQUIRES_NEW}, and deliberately no catch-and-swallow: if the audit insert
 * fails, the business change rolls back with it — there is no state in which a record changed and
 * no entry exists.
 */
@Component
public class AuditEntryRecorder {

    private final AuditEntryRepository repository;
    private final AuditorAware<String> auditorAware;

    public AuditEntryRecorder(AuditEntryRepository repository, AuditorAware<String> auditorAware) {
        this.repository = repository;
        this.auditorAware = auditorAware;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void record(AuditChangeEvent event) {
        try {
            repository.save(AuditEntry.builder()
                    .id(UUID.randomUUID())
                    .recordType(event.recordType())
                    .recordId(event.recordId())
                    .operation(event.operation())
                    .actor(auditorAware.getCurrentAuditor().orElse("system"))
                    .entityVersion(event.entityVersion())
                    .changes(event.changes())
                    .build());
        } catch (RuntimeException e) {
            // Not swallowed — rethrown so the business transaction rolls back with the failed
            // audit write. Wrapped only so the failure is identifiable as audit-recording.
            throw new AuditRecordingException(
                    "Could not record %s audit entry for %s %s"
                            .formatted(event.operation(), event.recordType(), event.recordId()), e);
        }
    }
}
