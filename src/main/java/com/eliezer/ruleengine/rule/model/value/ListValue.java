package com.eliezer.ruleengine.rule.model.value;

import com.eliezer.ruleengine.exception.RuleValidationException;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/**
 * Operand for IN / NOT_IN. Deduplicated at construction: an IN list with repeats bloats the
 * bind-parameter count and defeats statement-cache reuse for no semantic gain.
 */
public record ListValue(List<String> values) implements ConditionValue {

    public ListValue {
        Objects.requireNonNull(values, "LIST values are required");
        if (values.isEmpty()) {
            throw new RuleValidationException("LIST value must contain at least one element");
        }
        if (values.stream().anyMatch(Objects::isNull)) {
            throw new RuleValidationException("LIST value must not contain nulls — use IS_NULL instead");
        }
        values = List.copyOf(new LinkedHashSet<>(values));
    }

    public static ListValue of(String... values) {
        return new ListValue(List.of(values));
    }

    @Override
    public String kind() {
        return "LIST";
    }
}
