package com.eliezer.ruleengine.rule.model;

import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.rule.model.value.ConditionValue;
import com.eliezer.ruleengine.rule.model.value.ListValue;
import com.eliezer.ruleengine.rule.model.value.NumberValue;
import com.eliezer.ruleengine.rule.model.value.RangeValue;
import com.eliezer.ruleengine.rule.model.value.StringValue;

import java.util.Objects;

/**
 * Binary comparison leaf: {@code field <operator> value}.
 * <p>
 * Operator/value-shape compatibility is rejected here, in the compact constructor, so an
 * incompatible pair (e.g. {@code BETWEEN} with a scalar) fails during deserialization of the
 * incoming rule rather than deep inside the Criteria compiler at query time.
 * <p>
 * Field/type compatibility (e.g. {@code CONTAINS} against an integer column) is a separate
 * concern and is enforced by the field registry at compile time, since this record has no
 * knowledge of the target schema.
 */
public record ConditionNode(String field, ComparisonOperator operator, ConditionValue value) implements RuleNode {

    public ConditionNode {
        Objects.requireNonNull(field, "field is required");
        Objects.requireNonNull(operator, "operator is required");
        Objects.requireNonNull(value, "value is required");
        if (field.isBlank()) {
            throw new RuleValidationException("field must not be blank");
        }
        if (!operator.accepts(value)) {
            throw new RuleValidationException(
                    "Operator %s does not accept a %s value".formatted(operator, value.kind()));
        }
    }

    public static ConditionNode contains(String field, String needle) {
        return new ConditionNode(field, ComparisonOperator.CONTAINS, new StringValue(needle));
    }

    public static ConditionNode equalTo(String field, String literal) {
        return new ConditionNode(field, ComparisonOperator.EQUALS, new StringValue(literal));
    }

    public static ConditionNode between(String field, Number from, Number to) {
        return new ConditionNode(field, ComparisonOperator.BETWEEN, RangeValue.of(from, to));
    }

    public static ConditionNode greaterThan(String field, Number bound) {
        return new ConditionNode(field, ComparisonOperator.GT, NumberValue.of(bound));
    }

    public static ConditionNode in(String field, String... literals) {
        return new ConditionNode(field, ComparisonOperator.IN, ListValue.of(literals));
    }
}
