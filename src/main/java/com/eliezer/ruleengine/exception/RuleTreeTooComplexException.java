package com.eliezer.ruleengine.exception;

/**
 * Guardrail against pathological trees. Unbounded nesting is both a stack-overflow vector in
 * the recursive compiler and a planner-blowup vector once it reaches Postgres.
 */
public class RuleTreeTooComplexException extends RuleEngineException {

    public RuleTreeTooComplexException(String message) {
        super(message);
    }
}
