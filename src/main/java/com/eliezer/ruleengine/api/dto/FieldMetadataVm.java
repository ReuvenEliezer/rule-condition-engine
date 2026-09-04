package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.rule.model.ComparisonOperator;

import java.util.List;

/**
 * One queryable field, as published to rule authors. Derived at start-up from the field registry
 * by {@code FieldMetadataService} — never hand-maintained, which is the whole point: a client that
 * keeps its own copy of this data drifts the moment a field is added, retyped or withdrawn.
 *
 * <p><strong>What is deliberately absent:</strong> {@code joinPath}, {@code attributePath} and
 * {@code javaType}. Those describe the entity graph and the persistence mapping — publishing
 * {@code caseLinks.caseFile} hands a caller a map of the schema and gives a builder nothing it
 * needs, since it already sends the logical name. A test asserts their absence, not merely the
 * presence of everything else.
 *
 * @param operators        the <em>effective</em> set: operators that survive both
 *                         {@code requireCompatible} and {@code coerce}, so no published operator
 *                         can be offered and then rejected on save
 * @param presenceTestable whether {@code IS_NULL} / {@code IS_NOT_NULL} may be offered. Always
 *                         true today; published rather than assumed so a client holds no rule of
 *                         its own about it
 * @param enumValues       permitted values, non-null exactly when {@code valueKind} is
 *                         {@code ENUM}, in enum declaration order
 */
public record FieldMetadataVm(
        String logicalName,
        String label,
        FieldValueKind valueKind,
        List<ComparisonOperator> operators,
        boolean presenceTestable,
        List<String> enumValues
) {

    public FieldMetadataVm {
        if (logicalName == null || logicalName.isBlank()) {
            throw new RuleValidationException("logicalName is required");
        }
        if (label == null || label.isBlank()) {
            throw new RuleValidationException("label is required for field '%s'".formatted(logicalName));
        }
        if (valueKind == null) {
            throw new RuleValidationException("valueKind is required for field '%s'".formatted(logicalName));
        }
        if (operators == null) {
            throw new RuleValidationException("operators are required for field '%s'".formatted(logicalName));
        }
        boolean enumerated = valueKind == FieldValueKind.ENUM;
        if (enumerated && (enumValues == null || enumValues.isEmpty())) {
            throw new RuleValidationException(
                    "field '%s' is ENUM and must publish its permitted values".formatted(logicalName));
        }
        if (!enumerated && enumValues != null) {
            throw new RuleValidationException(
                    "field '%s' is %s and must not publish enum values".formatted(logicalName, valueKind));
        }
        operators = List.copyOf(operators);
        enumValues = enumValues == null ? null : List.copyOf(enumValues);
    }
}
