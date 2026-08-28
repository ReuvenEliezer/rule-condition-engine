package com.eliezer.ruleengine.rule.validation;

import com.eliezer.ruleengine.exception.RuleTreeTooComplexException;
import com.eliezer.ruleengine.rule.model.ConditionNode;
import com.eliezer.ruleengine.rule.model.GroupNode;
import com.eliezer.ruleengine.rule.model.RuleNode;
import com.eliezer.ruleengine.rule.model.UnaryConditionNode;
import com.eliezer.ruleengine.rule.model.value.ListValue;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Structural budget check, run before compilation and before persistence.
 *
 * <p>Individual node records already validate themselves at construction. What they cannot see is
 * the whole tree: a rule that is locally valid at every node can still be 4,000 nodes deep. Two
 * concrete failure modes this closes — a recursive compiler overflowing the stack on a deliberately
 * nested tree, and Postgres' planner degrading badly on a predicate with thousands of terms.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RuleTreeValidator {

    private final RuleEngineProperties properties;

    public void validate(RuleNode root) {
        Budget budget = new Budget();
        walk(root, 1, budget);
        log.debug("Rule tree accepted: {} nodes, depth {}", budget.nodes, budget.maxDepth);
    }

    private void walk(RuleNode node, int depth, Budget budget) {
        budget.nodes++;
        budget.maxDepth = Math.max(budget.maxDepth, depth);

        if (depth > properties.maxTreeDepth()) {
            throw new RuleTreeTooComplexException(
                    "Rule tree exceeds maximum nesting depth of %d".formatted(properties.maxTreeDepth()));
        }
        if (budget.nodes > properties.maxNodeCount()) {
            throw new RuleTreeTooComplexException(
                    "Rule tree exceeds maximum node count of %d".formatted(properties.maxNodeCount()));
        }

        switch (node) {
            case GroupNode group -> {
                for (RuleNode child : group.children()) {
                    walk(child, depth + 1, budget);
                }
            }
            case ConditionNode condition -> {
                if (condition.value() instanceof ListValue list
                        && list.values().size() > properties.maxInListSize()) {
                    throw new RuleTreeTooComplexException(
                            "IN list on field '%s' has %d entries, maximum is %d"
                                    .formatted(condition.field(), list.values().size(),
                                            properties.maxInListSize()));
                }
            }
            case UnaryConditionNode ignored -> {
                // leaf, nothing to descend into
            }
        }
    }

    private static final class Budget {
        private int nodes;
        private int maxDepth;
    }
}
