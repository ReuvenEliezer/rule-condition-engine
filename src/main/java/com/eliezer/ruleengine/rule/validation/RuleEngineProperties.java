package com.eliezer.ruleengine.rule.validation;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@Validated
@ConfigurationProperties(prefix = "rule-engine")
public record RuleEngineProperties(
        @Min(1) @Max(32) int maxTreeDepth,
        @Min(1) @Max(4096) int maxNodeCount,
        @Min(1) @Max(10_000) int maxInListSize,
        @Min(1) @Max(1000) int defaultPageSize,
        @Min(1) @Max(5000) int maxPageSize
) {
}
