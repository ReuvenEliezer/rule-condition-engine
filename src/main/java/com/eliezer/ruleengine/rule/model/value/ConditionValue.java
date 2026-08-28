package com.eliezer.ruleengine.rule.model.value;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * Typed operand of a {@code CONDITION} leaf. The discriminator lives on the value object
 * itself ({@code value.type}) rather than as a sibling field on the node, so the node record
 * carries no redundant type string that could drift out of sync with the actual payload.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = StringValue.class, name = "STRING"),
        @JsonSubTypes.Type(value = NumberValue.class, name = "NUMBER"),
        @JsonSubTypes.Type(value = RangeValue.class, name = "RANGE"),
        @JsonSubTypes.Type(value = ListValue.class, name = "LIST")
})
public sealed interface ConditionValue permits StringValue, NumberValue, RangeValue, ListValue {

    /** Human-readable shape name, used in validation messages. */
    String kind();
}
