package com.eliezer.ruleengine.rule.model;

import com.eliezer.ruleengine.exception.RuleValidationException;

import java.util.Objects;

/**
 * Leaf for operators that take no operand ({@code IS_NULL}, {@code IS_NOT_NULL}).
 * Modelled as its own node type so {@link ConditionNode#value()} can stay non-null.
 */
public record UnaryConditionNode(String field, UnaryOperator operator) implements RuleNode {

    public UnaryConditionNode {
        Objects.requireNonNull(field, "field is required");
        Objects.requireNonNull(operator, "operator is required");
        if (field.isBlank()) {
            throw new RuleValidationException("field must not be blank");
        }
    }
}
