package com.eliezer.ruleengine.rule.model;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * Root of the condition AST. Two shapes of leaf exist on purpose:
 * {@link ConditionNode} always carries a value, {@link UnaryConditionNode} never does.
 * That split is what keeps {@code value} non-null across the whole hierarchy instead of
 * threading an {@code Optional} / null through every compiler branch.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = GroupNode.class, name = "GROUP"),
        @JsonSubTypes.Type(value = ConditionNode.class, name = "CONDITION"),
        @JsonSubTypes.Type(value = UnaryConditionNode.class, name = "UNARY")
})
public sealed interface RuleNode permits GroupNode, ConditionNode, UnaryConditionNode {
}
