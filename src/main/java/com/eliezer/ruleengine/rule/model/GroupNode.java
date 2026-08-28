package com.eliezer.ruleengine.rule.model;

import com.eliezer.ruleengine.exception.RuleValidationException;

import java.util.List;
import java.util.Objects;

/**
 * Logical grouping. {@code NOT} is enforced to be strictly unary at construction time —
 * the alternative (implicitly NOT-ing an AND of the children) is ambiguous to readers
 * and to any UI that round-trips the tree.
 */
public record GroupNode(LogicalOperator operator, List<RuleNode> children) implements RuleNode {

    public GroupNode {
        Objects.requireNonNull(operator, "operator is required");
        Objects.requireNonNull(children, "children is required");
        if (children.isEmpty()) {
            throw new RuleValidationException("GROUP node '%s' must have at least one child".formatted(operator));
        }
        if (operator == LogicalOperator.NOT && children.size() != 1) {
            throw new RuleValidationException(
                    "NOT accepts exactly one child, got %d — wrap multiple children in an explicit AND/OR"
                            .formatted(children.size()));
        }
        children = List.copyOf(children);
    }

    public static GroupNode and(RuleNode... children) {
        return new GroupNode(LogicalOperator.AND, List.of(children));
    }

    public static GroupNode or(RuleNode... children) {
        return new GroupNode(LogicalOperator.OR, List.of(children));
    }

    public static GroupNode not(RuleNode child) {
        return new GroupNode(LogicalOperator.NOT, List.of(child));
    }
}
