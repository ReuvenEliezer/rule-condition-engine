package com.eliezer.ruleengine.exception;

/** jsonb <-> AST conversion failed. Maps to 500 — a stored tree that will not parse is a data bug. */
public class RuleSerializationException extends RuleEngineException {

    public RuleSerializationException(String message, Throwable cause) {
        super(message, cause);
    }
}
