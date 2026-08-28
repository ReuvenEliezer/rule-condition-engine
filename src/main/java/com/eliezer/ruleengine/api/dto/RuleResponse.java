package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.domain.Rule;
import com.eliezer.ruleengine.rule.model.RuleNode;

import java.time.Instant;
import java.util.UUID;

public record RuleResponse(
        UUID id,
        UUID caseId,
        String name,
        boolean enabled,
        RuleNode condition,
        Instant updatedAt
) {

    public static RuleResponse from(Rule rule) {
        return new RuleResponse(
                rule.getId(),
                rule.getCaseFile().getId(),
                rule.getName(),
                rule.isEnabled(),
                rule.getConditionTree(),
                rule.getUpdatedAt());
    }
}
