package com.eliezer.ruleengine.rule;

import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.rule.model.ComparisonOperator;
import com.eliezer.ruleengine.rule.model.ConditionNode;
import com.eliezer.ruleengine.rule.model.GroupNode;
import com.eliezer.ruleengine.rule.model.LogicalOperator;
import com.eliezer.ruleengine.rule.model.value.ListValue;
import com.eliezer.ruleengine.rule.model.value.NumberValue;
import com.eliezer.ruleengine.rule.model.value.RangeValue;
import com.eliezer.ruleengine.rule.model.value.StringValue;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * These assertions are the contract that lets the compiler skip defensive checks: if an invalid
 * pairing cannot be constructed, the compiler never has to handle one.
 */
class RuleModelValidationTest {

    @Test
    @DisplayName("BETWEEN rejects a scalar operand at construction, not at query time")
    void betweenRejectsScalar() {
        assertThatThrownBy(() ->
                new ConditionNode("age", ComparisonOperator.BETWEEN, NumberValue.of(30)))
                .isInstanceOf(RuleValidationException.class)
                .hasMessageContaining("BETWEEN");
    }

    @Test
    @DisplayName("CONTAINS rejects a numeric operand")
    void containsRejectsNumber() {
        assertThatThrownBy(() ->
                new ConditionNode("name", ComparisonOperator.CONTAINS, NumberValue.of(42)))
                .isInstanceOf(RuleValidationException.class);
    }

    @Test
    @DisplayName("NOT with more than one child is rejected as ambiguous")
    void notIsStrictlyUnary() {
        List<com.eliezer.ruleengine.rule.model.RuleNode> two = List.of(
                ConditionNode.equalTo("risk", "HIGH"),
                ConditionNode.equalTo("city", "Haifa"));

        assertThatThrownBy(() -> new GroupNode(LogicalOperator.NOT, two))
                .isInstanceOf(RuleValidationException.class)
                .hasMessageContaining("exactly one child");
    }

    @Test
    @DisplayName("An inverted range is rejected rather than silently matching nothing")
    void invertedRangeRejected() {
        assertThatThrownBy(() -> RangeValue.of(40, 30))
                .isInstanceOf(RuleValidationException.class)
                .hasMessageContaining("must be <=");
    }

    @Test
    @DisplayName("An empty group is rejected")
    void emptyGroupRejected() {
        assertThatThrownBy(() -> new GroupNode(LogicalOperator.AND, List.of()))
                .isInstanceOf(RuleValidationException.class);
    }

    @Test
    @DisplayName("IN lists are deduplicated to keep the bind-parameter count stable")
    void inListIsDeduplicated() {
        ListValue value = ListValue.of("HIGH", "LOW", "HIGH");
        assertThat(value.values()).containsExactly("HIGH", "LOW");
    }

    @Test
    @DisplayName("An empty STRING operand is rejected — it would make CONTAINS match everything")
    void emptyStringRejected() {
        assertThatThrownBy(() -> new StringValue(""))
                .isInstanceOf(RuleValidationException.class);
    }
}
