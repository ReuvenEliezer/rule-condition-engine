package com.eliezer.ruleengine.api.dto;

/**
 * Contract every managed record's view model implements, so the generic CRUD stack can read the
 * three fields it needs without knowing the concrete type.
 */
public interface ResourceVm {

    /**
     * {@code null} &rArr; create, present &rArr; update (FR-003). {@code Object} rather than a type
     * parameter so {@code PersonCaseVm}'s {@code "<personUuid>:<caseUuid>"} string and the
     * UUID-keyed VMs both fit; UUID-keyed records narrow it covariantly.
     */
    Object id();

    /**
     * Optimistic-lock token echoed from the last read. Boxed {@link Integer} on the VM only: a
     * primitive would deserialise an omitted {@code version} to {@code 0}, which silently matches a
     * never-updated entity and loses the stale-client signal the concurrency check needs.
     * {@code AuditableEntity.version} stays a primitive {@code int} (research R9).
     */
    Integer version();

    /** Discriminator naming the record type (FR-014). Read-only — ignored on write. */
    String type();
}
