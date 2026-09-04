package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The published field metadata over HTTP: ordering, shape, and — the part that needs asserting
 * rather than assuming — what the response must never carry.
 */
class FieldMetadataEndpointTest extends PostgresIntegrationTest {

    @Autowired WebApplicationContext wac;
    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).build();
    }

    @Test
    void publishesEveryQueryableFieldSortedByLogicalName() throws Exception {
        mvc.perform(get("/api/v1/rules/fields/metadata"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(8))
                .andExpect(jsonPath("$[0].logicalName").value("age"))
                .andExpect(jsonPath("$[1].logicalName").value("case.role"))
                .andExpect(jsonPath("$[7].logicalName").value("risk"));
    }

    @Test
    void eachEntryCarriesLabelKindOperatorsAndPresenceFlag() throws Exception {
        mvc.perform(get("/api/v1/rules/fields/metadata"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.logicalName=='risk')].label").value("Risk level"))
                .andExpect(jsonPath("$[?(@.logicalName=='risk')].valueKind").value("ENUM"))
                .andExpect(jsonPath("$[?(@.logicalName=='risk')].presenceTestable").value(true))
                .andExpect(jsonPath("$[?(@.logicalName=='risk')].enumValues[0]").value("LOW"))
                .andExpect(jsonPath("$[?(@.logicalName=='risk')].enumValues[3]").value("CRITICAL"))
                // Addressed by index, not by filter: a filter yields a one-element array, so a
                // correctly-null enumValues comes back as [null] and reads as non-empty.
                .andExpect(jsonPath("$[0].logicalName").value("age"))
                .andExpect(jsonPath("$[0].valueKind").value("NUMBER"))
                .andExpect(jsonPath("$[0].enumValues").isEmpty());
    }

    /**
     * The effective-operator contract, over the wire: an ordered comparison on a timestamp passes
     * the compatibility gate and dies in coercion, so offering it would guarantee a rejected save.
     */
    @Test
    void timestampAndTextFieldsPublishNoOrderedOperator() throws Exception {
        String body = mvc.perform(get("/api/v1/rules/fields/metadata"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        for (String field : new String[]{"createdAt", "name", "city", "case.title"}) {
            String operators = operatorsOf(body, field);
            assertThat(operators)
                    .as("ordered operators must not be published for '%s'", field)
                    .doesNotContain("\"GT\"", "\"GTE\"", "\"LT\"", "\"LTE\"", "\"BETWEEN\"");
        }
    }

    /**
     * Asserting an absence, deliberately: {@code joinPath} and {@code attributePath} describe the
     * entity graph, and a refactor that started serialising the descriptor would leak the schema
     * silently. This test is the thing that would notice.
     */
    @Test
    void neverPublishesThePersistenceMapping() throws Exception {
        String body = mvc.perform(get("/api/v1/rules/fields/metadata"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body)
                .doesNotContain("joinPath")
                .doesNotContain("attributePath")
                .doesNotContain("javaType")
                .doesNotContain("caseLinks");
    }

    /** The metadata surface is additive: the pre-existing names-only route is untouched. */
    @Test
    void theExistingFieldsRouteStillReturnsSortedNamesOnly() throws Exception {
        mvc.perform(get("/api/v1/rules/fields"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(8))
                .andExpect(jsonPath("$[0]").value("age"))
                .andExpect(jsonPath("$[7]").value("risk"));
    }

    private static String operatorsOf(String body, String logicalName) {
        int start = body.indexOf("\"logicalName\":\"" + logicalName + "\"");
        assertThat(start).as("field '%s' present in the response", logicalName).isNotNegative();
        int end = body.indexOf('}', start);
        return body.substring(start, end < 0 ? body.length() : end);
    }
}
