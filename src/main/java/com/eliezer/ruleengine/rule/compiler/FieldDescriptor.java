package com.eliezer.ruleengine.rule.compiler;

import com.eliezer.ruleengine.exception.IncompatibleOperatorException;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.rule.model.ComparisonOperator;
import com.eliezer.ruleengine.rule.model.value.ConditionValue;
import com.eliezer.ruleengine.rule.model.value.ListValue;
import com.eliezer.ruleengine.rule.model.value.NumberValue;
import com.eliezer.ruleengine.rule.model.value.RangeValue;
import com.eliezer.ruleengine.rule.model.value.StringValue;
import jakarta.persistence.criteria.Path;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/**
 * One whitelisted, queryable field: the mapping from a logical name exposed to rule authors
 * onto a concrete JPA attribute path, plus the type information needed to coerce operands.
 *
 * <p>Nothing outside this registry can become a query path — that is the whole point. The
 * logical name is never concatenated into a query, only looked up.
 *
 * @param logicalName   name as it appears in rule JSON
 * @param label         human display label, published to rule authors. The registry is the single
 *                      source of truth for a field, so its label belongs here rather than in a
 *                      parallel map that would drift; a blank one is derived from the logical name
 * @param joinPath      dotted path of association attributes that must be JOINed before the
 *                      attribute is reachable, or {@code null} when the field sits on the root
 * @param attributePath attribute name relative to the root (or to the last join)
 * @param javaType      the attribute's Java type, used for operand coercion
 */
public record FieldDescriptor(String logicalName, String label, String joinPath, String attributePath,
                              Class<?> javaType) {

    public FieldDescriptor {
        if (logicalName == null || logicalName.isBlank()) {
            throw new RuleValidationException("logicalName is required");
        }
        if (attributePath == null || attributePath.isBlank()) {
            throw new RuleValidationException("attributePath is required");
        }
        if (label == null || label.isBlank()) {
            label = humanise(logicalName);
        }
    }

    /** Field directly on the query root. */
    public static FieldDescriptor of(String logicalName, String attributePath, Class<?> javaType) {
        return new FieldDescriptor(logicalName, null, null, attributePath, javaType);
    }

    /** Field reachable only through one or more associations. */
    public static FieldDescriptor joined(String logicalName, String joinPath, String attributePath, Class<?> javaType) {
        return new FieldDescriptor(logicalName, null, joinPath, attributePath, javaType);
    }

    /**
     * Registry-supplied display label. Written as a wither rather than a fifth factory argument so
     * every existing call site keeps compiling and a label stays visibly optional.
     */
    public FieldDescriptor labelled(String displayLabel) {
        return new FieldDescriptor(logicalName, displayLabel, joinPath, attributePath, javaType);
    }

    /** "createdAt" -> "Created at"; "case.role" -> "Case role". */
    private static String humanise(String logicalName) {
        String spaced = logicalName.replace('.', ' ')
                .replaceAll("(?<=[a-z0-9])(?=[A-Z])", " ")
                .toLowerCase(Locale.ROOT);
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    public boolean requiresJoin() {
        return joinPath != null && !joinPath.isBlank();
    }

    public List<String> joinSegments() {
        return requiresJoin() ? List.of(joinPath.split("\\.")) : List.of();
    }

    /** Resolves the leaf attribute against an already-positioned base path. */
    public Path<?> resolveFrom(Path<?> base) {
        return base.get(attributePath);
    }

    public boolean isTextual() {
        return javaType == String.class;
    }

    public boolean isNumeric() {
        return Number.class.isAssignableFrom(boxed());
    }

    public boolean isOrdered() {
        return isNumeric() || (Comparable.class.isAssignableFrom(javaType) && !javaType.isEnum());
    }

    /** Rejects operator/field-type pairs the AST alone cannot catch (e.g. CONTAINS on an int). */
    public void requireCompatible(ComparisonOperator operator) {
        if (operator.isTextual() && !isTextual()) {
            throw new IncompatibleOperatorException(logicalName, operator,
                    "field is %s, not textual".formatted(javaType.getSimpleName()));
        }
        if (operator.isOrdered() && !isOrdered()) {
            throw new IncompatibleOperatorException(logicalName, operator,
                    "field %s is not an ordered type".formatted(javaType.getSimpleName()));
        }
    }

    /**
     * Narrows a wire-level operand onto the column's actual Java type. {@code intValueExact}
     * and {@code Enum.valueOf} both throw on a bad value, which is what we want: a rule saying
     * {@code risk = "SEVERE"} should fail fast rather than silently match nothing.
     */
    public Object coerce(ConditionValue value) {
        return switch (value) {
            case StringValue s -> coerceScalar(s.value());
            case NumberValue n -> coerceNumber(n.value());
            case RangeValue r -> List.of(coerceNumber(r.from()), coerceNumber(r.to()));
            case ListValue l -> l.values().stream().map(this::coerceScalar).toList();
        };
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Object coerceScalar(String raw) {
        if (javaType.isEnum()) {
            try {
                return Enum.valueOf((Class<? extends Enum>) javaType, raw);
            } catch (IllegalArgumentException e) {
                throw new RuleValidationException(
                        "'%s' is not a valid value for field '%s'. Allowed: %s"
                                .formatted(raw, logicalName, List.of(javaType.getEnumConstants())), e);
            }
        }
        if (javaType == String.class) {
            return raw;
        }
        if (javaType == Instant.class) {
            return Instant.parse(raw);
        }
        if (isNumeric()) {
            return coerceNumber(new BigDecimal(raw));
        }
        throw new RuleValidationException(
                "Cannot coerce a STRING operand onto field '%s' of type %s"
                        .formatted(logicalName, javaType.getSimpleName()));
    }

    private Object coerceNumber(BigDecimal raw) {
        Class<?> target = boxed();
        if (target == Integer.class) {
            return raw.intValueExact();
        }
        if (target == Long.class) {
            return raw.longValueExact();
        }
        if (target == Short.class) {
            return raw.shortValueExact();
        }
        if (target == Double.class) {
            return raw.doubleValue();
        }
        if (target == BigDecimal.class) {
            return raw;
        }
        throw new RuleValidationException(
                "Cannot coerce a NUMBER operand onto field '%s' of type %s"
                        .formatted(logicalName, javaType.getSimpleName()));
    }

    private Class<?> boxed() {
        if (javaType == int.class) return Integer.class;
        if (javaType == long.class) return Long.class;
        if (javaType == short.class) return Short.class;
        if (javaType == double.class) return Double.class;
        return javaType;
    }
}
