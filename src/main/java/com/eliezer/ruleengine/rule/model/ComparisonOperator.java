package com.eliezer.ruleengine.rule.model;

import com.eliezer.ruleengine.rule.model.value.ConditionValue;
import com.eliezer.ruleengine.rule.model.value.ListValue;
import com.eliezer.ruleengine.rule.model.value.NumberValue;
import com.eliezer.ruleengine.rule.model.value.RangeValue;
import com.eliezer.ruleengine.rule.model.value.StringValue;

import java.util.Set;

/**
 * Binary operators, each declaring which {@link ConditionValue} shapes it accepts.
 * The declaration is the single source of truth for validation — adding an operator
 * without listing its accepted shapes makes it reject everything, which fails loudly.
 */
public enum ComparisonOperator {

    EQUALS(StringValue.class, NumberValue.class),
    NOT_EQUALS(StringValue.class, NumberValue.class),

    CONTAINS(StringValue.class),
    STARTS_WITH(StringValue.class),
    ENDS_WITH(StringValue.class),

    BETWEEN(RangeValue.class),

    GT(NumberValue.class),
    GTE(NumberValue.class),
    LT(NumberValue.class),
    LTE(NumberValue.class),

    IN(ListValue.class),
    NOT_IN(ListValue.class);

    private final Set<Class<? extends ConditionValue>> acceptedShapes;

    @SafeVarargs
    ComparisonOperator(Class<? extends ConditionValue>... acceptedShapes) {
        this.acceptedShapes = Set.of(acceptedShapes);
    }

    public boolean accepts(ConditionValue value) {
        return acceptedShapes.contains(value.getClass());
    }

    /** True for operators that only make sense against a textual column. */
    public boolean isTextual() {
        return this == CONTAINS || this == STARTS_WITH || this == ENDS_WITH;
    }

    /** True for operators requiring an ordered (comparable) column. */
    public boolean isOrdered() {
        return this == GT || this == GTE || this == LT || this == LTE || this == BETWEEN;
    }
}
