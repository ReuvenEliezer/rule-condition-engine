package com.eliezer.ruleengine.exception;

/**
 * The audit entry for a change could not be persisted. Because the entry is written in the same
 * transaction as the change (FR-027 as amended), this rolls the business change back with it —
 * there is no state in which a record changed and no audit entry exists. Mapped to
 * {@code 500 AUDIT_RECORDING_FAILED} so the failure is identified as audit-recording, not a generic
 * error.
 */
public class AuditRecordingException extends RuntimeException {

    public AuditRecordingException(String message, Throwable cause) {
        super(message, cause);
    }
}
