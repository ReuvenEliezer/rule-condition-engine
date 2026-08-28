package com.eliezer.ruleengine.rule;

import com.eliezer.ruleengine.rule.model.ConditionNode;
import com.eliezer.ruleengine.rule.model.GroupNode;
import com.eliezer.ruleengine.rule.model.RuleNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;

import static org.assertj.core.api.Assertions.assertThat;

class RuleSerializationTest {

    private final ObjectMapper mapper = JsonMapper.builder().findAndAddModules().build();

    /**
     * The canonical example: name CONTAINS "AVI" AND age BETWEEN 30-40 AND risk = HIGH.
     * Asserting on the exact wire shape matters because a rule-builder UI and any already-stored
     * jsonb both depend on it — changing a discriminator name is a data migration, not a refactor.
     */
    @Test
    @DisplayName("The canonical rule round-trips through its exact wire format")
    void canonicalRuleRoundTrips() throws Exception {
        RuleNode tree = GroupNode.and(
                ConditionNode.contains("name", "AVI"),
                ConditionNode.between("age", 30, 40),
                ConditionNode.equalTo("risk", "HIGH"));

        String json = mapper.writeValueAsString(tree);

        JSONAssert.assertEquals("""
                {
                  "type": "GROUP",
                  "operator": "AND",
                  "children": [
                    { "type": "CONDITION", "field": "name", "operator": "CONTAINS",
                      "value": { "type": "STRING", "value": "AVI" } },
                    { "type": "CONDITION", "field": "age", "operator": "BETWEEN",
                      "value": { "type": "RANGE", "from": 30, "to": 40 } },
                    { "type": "CONDITION", "field": "risk", "operator": "EQUALS",
                      "value": { "type": "STRING", "value": "HIGH" } }
                  ]
                }
                """, json, JSONCompareMode.STRICT);

        assertThat(mapper.readValue(json, RuleNode.class)).isEqualTo(tree);
    }

    @Test
    @DisplayName("Nested groups survive a round-trip")
    void nestedGroupRoundTrips() throws Exception {
        RuleNode tree = GroupNode.and(
                ConditionNode.equalTo("risk", "HIGH"),
                GroupNode.or(
                        ConditionNode.equalTo("city", "Tel Aviv"),
                        ConditionNode.equalTo("city", "Haifa")),
                GroupNode.not(ConditionNode.greaterThan("age", 65)));

        String json = mapper.writeValueAsString(tree);
        assertThat(mapper.readValue(json, RuleNode.class)).isEqualTo(tree);
    }
}
