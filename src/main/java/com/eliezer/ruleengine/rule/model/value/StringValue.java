package com.eliezer.ruleengine.rule.model.value;

import com.eliezer.ruleengine.exception.RuleValidationException;

import java.util.Objects;

public record StringValue(String value) implements ConditionValue {

    public StringValue {
        Objects.requireNonNull(value, "STRING value is required");
        if (value.isEmpty()) {
            throw new RuleValidationException("STRING value must not be empty");
        }
    }

    @Override
    public String kind() {
        return "STRING";
    }
}
