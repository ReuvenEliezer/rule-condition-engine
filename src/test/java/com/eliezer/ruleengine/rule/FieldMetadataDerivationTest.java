package com.eliezer.ruleengine.rule;

import com.eliezer.ruleengine.api.dto.FieldMetadataVm;
import com.eliezer.ruleengine.api.dto.FieldValueKind;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.exception.UnsupportedFieldTypeException;
import com.eliezer.ruleengine.rule.compiler.FieldDescriptor;
import com.eliezer.ruleengine.rule.compiler.FieldRegistry;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.model.ComparisonOperator;
import com.eliezer.ruleengine.service.FieldMetadataService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The published metadata, derived without Spring and without Postgres — the derivation needs
 * neither, so it gets a test that runs on every {@code mvn test}.
 *
 * <p>The load-bearing assertion is {@link #orderedOperatorsAreAbsentFromNonNumericFields()}: those
 * operators pass {@code requireCompatible} and die in {@code coerce}, so a metadata surface built
 * from the first gate alone would offer them and have every save rejected.
 */
class FieldMetadataDerivationTest {

    private static final List<ComparisonOperator> ORDERED =
            List.of(ComparisonOperator.GT, ComparisonOperator.GTE,
                    ComparisonOperator.LT, ComparisonOperator.LTE, ComparisonOperator.BETWEEN);

    private final Map<String, FieldMetadataVm> published =
            new FieldMetadataService(new PersonFieldRegistry()).publishedFields().stream()
                    .collect(java.util.stream.Collectors.toMap(FieldMetadataVm::logicalName, vm -> vm));

    @Test
    void everyRegisteredFieldIsPublishedSortedByLogicalName() {
        List<String> names = new FieldMetadataService(new PersonFieldRegistry()).publishedFields().stream()
                .map(FieldMetadataVm::logicalName)
                .toList();

        assertThat(names).containsExactly(
                "age", "case.role", "case.status", "case.title", "city", "createdAt", "name", "risk");
    }

    @ParameterizedTest
    @ValueSource(strings = {"name", "city", "case.title"})
    void textFieldsPublishEqualityTextAndMembershipOperators(String field) {
        assertThat(published.get(field).valueKind()).isEqualTo(FieldValueKind.TEXT);
        assertThat(published.get(field).operators()).containsExactly(
                ComparisonOperator.EQUALS, ComparisonOperator.NOT_EQUALS,
                ComparisonOperator.CONTAINS, ComparisonOperator.STARTS_WITH, ComparisonOperator.ENDS_WITH,
                ComparisonOperator.IN, ComparisonOperator.NOT_IN);
    }

    @Test
    void numericFieldPublishesOrderedAndRangeOperators() {
        assertThat(published.get("age").valueKind()).isEqualTo(FieldValueKind.NUMBER);
        assertThat(published.get("age").operators()).containsExactly(
                ComparisonOperator.EQUALS, ComparisonOperator.NOT_EQUALS,
                ComparisonOperator.BETWEEN,
                ComparisonOperator.GT, ComparisonOperator.GTE,
                ComparisonOperator.LT, ComparisonOperator.LTE,
                ComparisonOperator.IN, ComparisonOperator.NOT_IN);
    }

    @ParameterizedTest
    @ValueSource(strings = {"risk", "case.role", "case.status"})
    void enumFieldsPublishEqualityAndMembershipOnly(String field) {
        assertThat(published.get(field).valueKind()).isEqualTo(FieldValueKind.ENUM);
        assertThat(published.get(field).operators()).containsExactly(
                ComparisonOperator.EQUALS, ComparisonOperator.NOT_EQUALS,
                ComparisonOperator.IN, ComparisonOperator.NOT_IN);
    }

    @Test
    void instantFieldPublishesEqualityAndMembershipOnly() {
        assertThat(published.get("createdAt").valueKind()).isEqualTo(FieldValueKind.INSTANT);
        assertThat(published.get("createdAt").operators()).containsExactly(
                ComparisonOperator.EQUALS, ComparisonOperator.NOT_EQUALS,
                ComparisonOperator.IN, ComparisonOperator.NOT_IN);
    }

    /**
     * {@code isOrdered()} is true for String and Instant — both are Comparable — so all five of
     * these pass the compatibility gate. Only coercion rejects them, which is exactly why the
     * derivation executes both gates rather than restating the first.
     */
    @ParameterizedTest
    @ValueSource(strings = {"name", "city", "case.title", "createdAt"})
    void orderedOperatorsAreAbsentFromNonNumericFields(String field) {
        assertThat(published.get(field).operators()).doesNotContainAnyElementsOf(ORDERED);
    }

    @Test
    void enumeratedFieldsPublishTheirPermittedValuesInDeclarationOrder() {
        assertThat(published.get("risk").enumValues()).containsExactly("LOW", "MEDIUM", "HIGH", "CRITICAL");
        assertThat(published.get("case.role").enumValues()).containsExactly("SUBJECT", "ASSOCIATE", "WITNESS");
        assertThat(published.get("case.status").enumValues()).containsExactly("OPEN", "UNDER_REVIEW", "CLOSED");
    }

    @Test
    void nonEnumeratedFieldsPublishNoPermittedValues() {
        assertThat(published.get("name").enumValues()).isNull();
        assertThat(published.get("age").enumValues()).isNull();
        assertThat(published.get("createdAt").enumValues()).isNull();
    }

    @Test
    void everyFieldAcceptsAPresenceTest() {
        assertThat(published.values()).allMatch(FieldMetadataVm::presenceTestable);
    }

    @Test
    void labelsComeFromTheRegistry() {
        assertThat(published.get("risk").label()).isEqualTo("Risk level");
        assertThat(published.get("case.role").label()).isEqualTo("Linked case — role");
        assertThat(published.get("createdAt").label()).isEqualTo("Created at");
    }

    @Test
    void anUnlabelledFieldFallsBackToAHumanisedLogicalName() {
        FieldMetadataVm vm = describeOnly(FieldDescriptor.of("createdAt", "createdAt", java.time.Instant.class));

        assertThat(vm.label()).isEqualTo("Created at");
    }

    @Test
    void aTypeWithNoPublishableValueKindFailsAtConstruction() {
        FieldRegistry<Person> registry = registryOf(
                FieldDescriptor.of("active", "active", Boolean.class));

        assertThatThrownBy(() -> new FieldMetadataService(registry))
                .isInstanceOf(UnsupportedFieldTypeException.class)
                .hasMessageContaining("active")
                .hasMessageContaining("Boolean");
    }

    private static FieldMetadataVm describeOnly(FieldDescriptor descriptor) {
        return new FieldMetadataService(registryOf(descriptor)).publishedFields().getFirst();
    }

    private static FieldRegistry<Person> registryOf(FieldDescriptor... descriptors) {
        Map<String, FieldDescriptor> indexed = FieldRegistry.index(descriptors);
        return new FieldRegistry<>() {
            @Override
            public Class<Person> rootType() {
                return Person.class;
            }

            @Override
            public Map<String, FieldDescriptor> descriptors() {
                return indexed;
            }
        };
    }
}
