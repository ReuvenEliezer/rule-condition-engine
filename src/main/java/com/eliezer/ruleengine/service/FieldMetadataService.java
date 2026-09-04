package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.FieldMetadataVm;
import com.eliezer.ruleengine.api.dto.FieldValueKind;
import com.eliezer.ruleengine.exception.UnsupportedFieldTypeException;
import com.eliezer.ruleengine.rule.compiler.FieldDescriptor;
import com.eliezer.ruleengine.rule.compiler.FieldRegistry;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.model.ComparisonOperator;
import com.eliezer.ruleengine.rule.model.value.ConditionValue;
import com.eliezer.ruleengine.rule.model.value.ListValue;
import com.eliezer.ruleengine.rule.model.value.NumberValue;
import com.eliezer.ruleengine.rule.model.value.RangeValue;
import com.eliezer.ruleengine.rule.model.value.StringValue;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * Publishes the field, type, operator and enumeration metadata a rule builder needs, derived from
 * the field registry rather than written down a second time.
 *
 * <p><strong>How the operator set is derived, and why it matters.</strong> An operator is published
 * only if some accepted operand shape survives <em>both</em> gates the service applies at save
 * time: {@link FieldDescriptor#requireCompatible} and then {@link FieldDescriptor#coerce}. Both are
 * <em>executed</em> here against a probe operand rather than restated as a table, so the published
 * set cannot disagree with the code that enforces it.
 *
 * <p>The second gate is not optional. {@code isOrdered()} is true for {@code String} and
 * {@code Instant} because both are {@code Comparable}, so {@code name > 30} and
 * {@code createdAt BETWEEN ...} pass compatibility checking and die inside {@code coerceNumber},
 * which has no branch for either type. Publishing the declared-compatibility set alone would offer
 * an author operators that are rejected the moment they save.
 *
 * <p>Derivation runs once, in the constructor: the registry is a compile-time constant, the result
 * never changes for the life of the JVM, and an unregisterable type fails the context at start-up
 * instead of at first request.
 */
@Service
public class FieldMetadataService {

    private static final BigDecimal PROBE_LOW = BigDecimal.ZERO;
    private static final BigDecimal PROBE_HIGH = BigDecimal.ONE;

    private final List<FieldMetadataVm> publishedFields;

    /**
     * Takes the registry interface rather than {@code PersonFieldRegistry} so the derivation can be
     * exercised against an ad-hoc registry in a unit test — including one carrying a type that must
     * fail. Spring resolves the single {@link PersonFieldRegistry} bean here.
     */
    public FieldMetadataService(FieldRegistry<?> registry) {
        this.publishedFields = derive(registry);
    }

    /** Sorted by logical name; each entry's operators in {@code ComparisonOperator} declaration order. */
    public List<FieldMetadataVm> publishedFields() {
        return publishedFields;
    }

    private static List<FieldMetadataVm> derive(FieldRegistry<?> registry) {
        return registry.descriptors().values().stream()
                .sorted(Comparator.comparing(FieldDescriptor::logicalName))
                .map(FieldMetadataService::describe)
                .toList();
    }

    private static FieldMetadataVm describe(FieldDescriptor descriptor) {
        FieldValueKind kind = kindOf(descriptor);
        return new FieldMetadataVm(
                descriptor.logicalName(),
                descriptor.label(),
                kind,
                effectiveOperators(descriptor, kind),
                // Presence tests compile straight to isNull/isNotNull: no compatibility check, no
                // coercion, so there is nothing that can reject one. Published rather than assumed.
                true,
                kind == FieldValueKind.ENUM ? enumValues(descriptor) : null);
    }

    private static FieldValueKind kindOf(FieldDescriptor descriptor) {
        Class<?> javaType = descriptor.javaType();
        if (javaType.isEnum()) {
            return FieldValueKind.ENUM;
        }
        if (javaType == String.class) {
            return FieldValueKind.TEXT;
        }
        if (javaType == Instant.class) {
            return FieldValueKind.INSTANT;
        }
        if (descriptor.isNumeric()) {
            return FieldValueKind.NUMBER;
        }
        throw new UnsupportedFieldTypeException(descriptor.logicalName(), javaType);
    }

    private static List<ComparisonOperator> effectiveOperators(FieldDescriptor descriptor, FieldValueKind kind) {
        List<ConditionValue> probes = probes(descriptor, kind);
        return Arrays.stream(ComparisonOperator.values())
                .filter(operator -> probes.stream().anyMatch(probe -> survives(descriptor, operator, probe)))
                .toList();
    }

    /**
     * Both gates, run for real. The broad catch is deliberate: the question being asked is
     * literally "does this throw", and coercion signals rejection through several unrelated types
     * ({@code RuleValidationException}, {@code IncompatibleOperatorException},
     * {@code DateTimeParseException}, {@code ArithmeticException}). Narrowing the catch would make
     * the published set depend on which of them a future coercion branch happens to pick.
     */
    private static boolean survives(FieldDescriptor descriptor, ComparisonOperator operator, ConditionValue probe) {
        if (!operator.accepts(probe)) {
            return false;
        }
        try {
            descriptor.requireCompatible(operator);
            descriptor.coerce(probe);
            return true;
        } catch (RuntimeException rejected) {
            return false;
        }
    }

    /**
     * One probe per operand shape, each valid for this field's own type — an enum constant for an
     * enum column, an ISO-8601 instant for a timestamp column. A probe that was invalid for the
     * type would fail coercion for reasons that have nothing to do with the operator.
     */
    private static List<ConditionValue> probes(FieldDescriptor descriptor, FieldValueKind kind) {
        String scalar = switch (kind) {
            case TEXT -> "sample";
            case NUMBER -> PROBE_HIGH.toPlainString();
            case ENUM -> enumValues(descriptor).getFirst();
            case INSTANT -> Instant.EPOCH.toString();
        };
        return List.of(
                new StringValue(scalar),
                new NumberValue(PROBE_HIGH),
                new RangeValue(PROBE_LOW, PROBE_HIGH),
                new ListValue(List.of(scalar)));
    }

    private static List<String> enumValues(FieldDescriptor descriptor) {
        return Arrays.stream(descriptor.javaType().getEnumConstants())
                .map(constant -> ((Enum<?>) constant).name())
                .toList();
    }
}
