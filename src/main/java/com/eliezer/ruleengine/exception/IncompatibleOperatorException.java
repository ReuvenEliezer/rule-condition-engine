package com.eliezer.ruleengine.exception;

import com.eliezer.ruleengine.rule.model.ComparisonOperator;

/** The operator is valid but not applicable to that field's type. Maps to 400. */
public class IncompatibleOperatorException extends RuleEngineException {

    public IncompatibleOperatorException(String field, ComparisonOperator operator, String reason) {
        super("Operator %s cannot be applied to field '%s': %s".formatted(operator, field, reason));
    }
}
