package com.eliezer.ruleengine.exception;

import java.util.UUID;

/** Maps to 404. */
public class RuleNotFoundException extends RuleEngineException {

    public RuleNotFoundException(UUID ruleId) {
        super("Rule not found: %s".formatted(ruleId));
    }
}
