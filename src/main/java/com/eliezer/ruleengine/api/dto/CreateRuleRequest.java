package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.rule.model.RuleNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateRuleRequest(
        @NotNull UUID caseId,
        @NotBlank @Size(max = 200) String name,
        boolean enabled,
        @NotNull RuleNode condition
) {
}
