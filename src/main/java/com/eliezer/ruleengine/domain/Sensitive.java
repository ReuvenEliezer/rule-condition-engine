package com.eliezer.ruleengine.domain;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks an entity field whose value must never reach the audit trail. {@link AuditTrailListener}
 * records the field as <em>changed</em> but replaces both the old and new value with {@code "***"}
 * (FR-025 against FR-020): a reviewer learns the field was edited, never what it held.
 *
 * <p>Marking is an explicit opt-out. {@code AuditTrailIntegrationTest} asserts the known sensitive
 * value never appears in {@code audit_entry.changes}, so an unmarked new column fails a test rather
 * than leaking quietly.
 */
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Sensitive {
}
