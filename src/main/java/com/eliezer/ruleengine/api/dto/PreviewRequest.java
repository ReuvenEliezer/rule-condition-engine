package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.rule.model.RuleNode;
import jakarta.validation.constraints.NotNull;

/**
 * Dry-run a tree that has not been saved. This is what makes a rule-builder UI usable: authors
 * iterate against real match counts before committing a rule to a case.
 */
public record PreviewRequest(@NotNull RuleNode condition) {
}
