package com.eliezer.ruleengine.rule.model.value;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * BigDecimal rather than long/double: the same node feeds integer columns (age),
 * bigint columns and monetary/decimal columns. Narrowing happens once, in the field
 * registry, against the column's declared Java type.
 */
public record NumberValue(BigDecimal value) implements ConditionValue {

    public NumberValue {
        Objects.requireNonNull(value, "NUMBER value is required");
    }

    public static NumberValue of(Number number) {
        return new NumberValue(new BigDecimal(number.toString()));
    }

    @Override
    public String kind() {
        return "NUMBER";
    }
}
