package com.eliezer.ruleengine.rule.model.value;

import com.eliezer.ruleengine.exception.RuleValidationException;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Inclusive range for BETWEEN. Ordering is enforced up front: an inverted range silently
 * matches zero rows in SQL, which is indistinguishable from a correct rule that happens
 * to have no matches — an expensive thing to debug in an investigation workflow.
 */
public record RangeValue(BigDecimal from, BigDecimal to) implements ConditionValue {

    public RangeValue {
        Objects.requireNonNull(from, "RANGE.from is required");
        Objects.requireNonNull(to, "RANGE.to is required");
        if (from.compareTo(to) > 0) {
            throw new RuleValidationException(
                    "RANGE.from (%s) must be <= RANGE.to (%s)".formatted(from, to));
        }
    }

    public static RangeValue of(Number from, Number to) {
        return new RangeValue(new BigDecimal(from.toString()), new BigDecimal(to.toString()));
    }

    @Override
    public String kind() {
        return "RANGE";
    }
}
