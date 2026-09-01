package com.eliezer.ruleengine.exception;

import java.util.Set;

/**
 * A {@code sort} parameter named a field the resource does not expose for ordering. Rejected with
 * {@code 400 INVALID_SORT_FIELD} rather than silently falling back to an arbitrary order
 * (constitution Principle III).
 */
public class SortFieldNotAllowedException extends RuntimeException {

    private final String field;
    private final transient Set<String> allowed;

    public SortFieldNotAllowedException(String field, Set<String> allowed) {
        super("Sort field '%s' is not allowed; permitted: %s".formatted(field, allowed));
        this.field = field;
        this.allowed = allowed;
    }

    public String getField() {
        return field;
    }

    public Set<String> getAllowed() {
        return allowed;
    }
}
