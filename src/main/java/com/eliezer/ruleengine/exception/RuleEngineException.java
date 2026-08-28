package com.eliezer.ruleengine.exception;

/** Base for every domain exception in this service, so advice can map a family at once. */
public abstract class RuleEngineException extends RuntimeException {

    protected RuleEngineException(String message) {
        super(message);
    }

    protected RuleEngineException(String message, Throwable cause) {
        super(message, cause);
    }
}
