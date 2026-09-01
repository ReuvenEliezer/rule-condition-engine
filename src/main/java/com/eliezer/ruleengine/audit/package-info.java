/**
 * The audit trail and request log.
 *
 * <p>Two mechanisms, deliberately separate. {@link com.eliezer.ruleengine.audit.AuditTrailListener}
 * is a Hibernate event-SPI listener (not a JPA {@code @PostUpdate} callback, which cannot see
 * before/after values) that publishes a Spring event per lifecycle change;
 * {@link com.eliezer.ruleengine.audit.AuditEntryRecorder} consumes it {@code BEFORE_COMMIT} in the
 * same transaction and persists one immutable {@link com.eliezer.ruleengine.audit.AuditEntry}, so a
 * change and its audit row are atomic. {@link com.eliezer.ruleengine.audit.RequestAuditFilter}
 * writes one line per inbound HTTP call to the structured log stream — a different volume and
 * retention concern from one row per business change.
 *
 * <p>Until an authentication layer exists the actor resolves to the literal {@code "system"}
 * (see {@link com.eliezer.ruleengine.audit.SystemAuditorAware}).
 */
package com.eliezer.ruleengine.audit;
