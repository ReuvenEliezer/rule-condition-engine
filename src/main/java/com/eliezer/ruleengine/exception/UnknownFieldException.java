package com.eliezer.ruleengine.exception;

import java.util.Set;
import java.util.TreeSet;

/**
 * A rule referenced a field that is not in the registry. This is the injection guardrail:
 * an unregistered logical name never reaches the Criteria builder as a path.
 */
public class UnknownFieldException extends RuleEngineException {

    private final String field;

    public UnknownFieldException(String field, Set<String> known) {
        super("Unknown or non-queryable field '%s'. Queryable fields: %s"
                .formatted(field, new TreeSet<>(known)));
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
