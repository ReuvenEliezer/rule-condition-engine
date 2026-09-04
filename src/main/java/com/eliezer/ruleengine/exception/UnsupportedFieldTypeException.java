package com.eliezer.ruleengine.exception;

/**
 * A registered field's Java type maps to no published {@code FieldValueKind}.
 *
 * <p>Thrown while the metadata is derived, which happens in {@code FieldMetadataService}'s
 * constructor — so this fails the application context at start-up rather than surfacing later as a
 * builder offering a control that cannot produce a valid value. Registering a type the value model
 * has no shape for (a boolean, say) is a backend change first, and this says so loudly.
 */
public class UnsupportedFieldTypeException extends RuleEngineException {

    public UnsupportedFieldTypeException(String field, Class<?> javaType) {
        super(("Field '%s' has type %s, which maps to no publishable value kind. "
                + "Add a value shape to the rule model before registering it.")
                .formatted(field, javaType.getName()));
    }
}
