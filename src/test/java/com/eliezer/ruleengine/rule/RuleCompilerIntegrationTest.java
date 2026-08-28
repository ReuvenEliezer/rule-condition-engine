package com.eliezer.ruleengine.rule;

import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.RiskLevel;
import com.eliezer.ruleengine.exception.IncompatibleOperatorException;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.exception.UnknownFieldException;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.compiler.RuleCompiler;
import com.eliezer.ruleengine.rule.model.ComparisonOperator;
import com.eliezer.ruleengine.rule.model.ConditionNode;
import com.eliezer.ruleengine.rule.model.GroupNode;
import com.eliezer.ruleengine.rule.model.RuleNode;
import com.eliezer.ruleengine.rule.model.value.StringValue;
import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import com.eliezer.ruleengine.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Exercises the AST all the way down to Postgres. The point is not that the API returns a list —
 * it is that the emitted SQL means what the rule said.
 */
class RuleCompilerIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    private PersonRepository personRepository;

    @Autowired
    private RuleCompiler ruleCompiler;

    @Autowired
    private PersonFieldRegistry registry;

    @BeforeEach
    void resetPopulation() {
        personRepository.deleteAll();
    }

    private List<Person> matching(RuleNode tree) {
        Specification<Person> spec = ruleCompiler.compile(registry, tree);
        return personRepository.findAll(spec);
    }

    @Test
    @DisplayName("The canonical rule selects only the person satisfying all three conditions")
    void canonicalRuleMatches() {
        personRepository.saveAll(List.of(
                TestData.person("Avi Cohen", 35, RiskLevel.HIGH),        // matches
                TestData.person("Avi Levi", 55, RiskLevel.HIGH),         // age out of range
                TestData.person("Avi Mizrahi", 33, RiskLevel.LOW),       // wrong risk
                TestData.person("Dana Katz", 35, RiskLevel.HIGH)));      // name mismatch

        List<Person> matches = matching(GroupNode.and(
                ConditionNode.contains("name", "AVI"),
                ConditionNode.between("age", 30, 40),
                ConditionNode.equalTo("risk", "HIGH")));

        assertThat(matches).extracting(Person::getName).containsExactly("Avi Cohen");
    }

    @Test
    @DisplayName("CONTAINS is case-insensitive in both directions")
    void containsIsCaseInsensitive() {
        personRepository.saveAll(List.of(
                TestData.person("avi cohen", 30, RiskLevel.LOW),
                TestData.person("AVIVA SHARON", 30, RiskLevel.LOW),
                TestData.person("Dan", 30, RiskLevel.LOW)));

        assertThat(matching(ConditionNode.contains("name", "Avi")))
                .extracting(Person::getName)
                .containsExactlyInAnyOrder("avi cohen", "AVIVA SHARON");
    }

    @Test
    @DisplayName("LIKE metacharacters in the needle are escaped, not interpreted")
    void likeMetacharactersAreEscaped() {
        personRepository.saveAll(List.of(
                TestData.person("Discount 100% Ltd", 40, RiskLevel.LOW),
                TestData.person("Totally unrelated", 40, RiskLevel.LOW)));

        // Unescaped, a "%" needle is a wildcard and matches every row. Escaped, it matches only
        // names that literally contain a percent sign.
        assertThat(matching(ConditionNode.contains("name", "%")))
                .extracting(Person::getName)
                .containsExactly("Discount 100% Ltd");

        // "_" is the single-character wildcard; escaped it must match nothing here.
        assertThat(matching(ConditionNode.contains("name", "_")))
                .isEmpty();
    }

    @Test
    @DisplayName("BETWEEN is inclusive on both bounds")
    void betweenIsInclusive() {
        personRepository.saveAll(List.of(
                TestData.person("Lower", 30, RiskLevel.LOW),
                TestData.person("Middle", 35, RiskLevel.LOW),
                TestData.person("Upper", 40, RiskLevel.LOW),
                TestData.person("Outside", 41, RiskLevel.LOW)));

        assertThat(matching(ConditionNode.between("age", 30, 40)))
                .extracting(Person::getName)
                .containsExactlyInAnyOrder("Lower", "Middle", "Upper");
    }

    @Test
    @DisplayName("NOT_EQUALS includes rows where the column is NULL")
    void notEqualsIncludesNulls() {
        personRepository.saveAll(List.of(
                TestData.person("Has city", 30, RiskLevel.LOW, "Haifa"),
                TestData.person("Other city", 30, RiskLevel.LOW, "Eilat"),
                TestData.person("No city", 30, RiskLevel.LOW, null)));

        assertThat(matching(new ConditionNode("city", ComparisonOperator.NOT_EQUALS,
                new StringValue("Haifa"))))
                .extracting(Person::getName)
                .containsExactlyInAnyOrder("Other city", "No city");
    }

    @Test
    @DisplayName("An unregistered field is rejected before it can reach the query")
    void unregisteredFieldIsRejected() {
        assertThatThrownBy(() -> matching(ConditionNode.contains("nationalId", "ID-1")))
                .isInstanceOf(UnknownFieldException.class);

        assertThatThrownBy(() -> matching(ConditionNode.contains("name) OR 1=1 --", "x")))
                .isInstanceOf(UnknownFieldException.class);
    }

    @Test
    @DisplayName("CONTAINS against a numeric column is rejected as an operator/type mismatch")
    void textualOperatorOnNumericFieldRejected() {
        assertThatThrownBy(() -> matching(ConditionNode.contains("age", "3")))
                .isInstanceOf(IncompatibleOperatorException.class);
    }

    @Test
    @DisplayName("An invalid enum literal fails loudly instead of matching nothing")
    void invalidEnumLiteralRejected() {
        assertThatThrownBy(() -> matching(ConditionNode.equalTo("risk", "SEVERE")))
                .isInstanceOf(RuleValidationException.class)
                .hasMessageContaining("SEVERE");
    }

    @Test
    @DisplayName("Nested OR inside AND compiles with correct precedence")
    void nestedGroupPrecedence() {
        personRepository.saveAll(List.of(
                TestData.person("A", 30, RiskLevel.HIGH, "Haifa"),
                TestData.person("B", 30, RiskLevel.HIGH, "Eilat"),
                TestData.person("C", 30, RiskLevel.LOW, "Haifa")));

        assertThat(matching(GroupNode.and(
                ConditionNode.equalTo("risk", "HIGH"),
                GroupNode.or(
                        ConditionNode.equalTo("city", "Haifa"),
                        ConditionNode.equalTo("city", "Tel Aviv")))))
                .extracting(Person::getName)
                .containsExactly("A");
    }
}
