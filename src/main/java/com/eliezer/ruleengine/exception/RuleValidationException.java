package com.eliezer.ruleengine.exception;

/** The rule tree is structurally or semantically invalid. Maps to 400. */
public class RuleValidationException extends RuleEngineException {

    public RuleValidationException(String message) {
        super(message);
    }

    public RuleValidationException(String message, Throwable cause) {
        super(message, cause);
    }
}
