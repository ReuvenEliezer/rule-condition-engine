package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.RiskLevel;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.rule.model.ConditionNode;
import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import com.eliezer.ruleengine.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * US2 / FR-013, FR-015, FR-017, FR-023 — every response is a declared shape; {@code nationalId}
 * never leaves on a list path or a match result; system-owned fields are dropped on write.
 */
class ResponseExposureTest extends PostgresIntegrationTest {

    @Autowired WebApplicationContext wac;
    MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PersonRepository persons;
    @Autowired CaseRepository cases;
    @Autowired RuleRepository rules;
    @Autowired PersonCaseRepository personCases;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).build();
        personCases.deleteAllInBatch();
        rules.deleteAllInBatch();
        cases.deleteAllInBatch();
        persons.deleteAllInBatch();
    }

    private JsonNode createPerson() throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Dana Levi","nationalId":"NID-%s","age":34,"city":"Tel Aviv","risk":"HIGH"}
                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void personListIsSummaryShapedAndDetailAddsNationalIdAndAudit() throws Exception {
        createPerson();

        JsonNode listElem = json.readTree(mvc.perform(get("/api/v1/persons").param("size", "5"))
                .andReturn().getResponse().getContentAsString()).get("content").get(0);
        assertThat(fieldNames(listElem))
                .containsExactlyInAnyOrder("id", "version", "type", "name", "age", "city", "risk");
        assertThat(listElem.get("type").asString()).isEqualTo("person");

        String id = listElem.get("id").asString();
        JsonNode detail = json.readTree(mvc.perform(get("/api/v1/persons/" + id))
                .andReturn().getResponse().getContentAsString());
        assertThat(fieldNames(detail)).contains("nationalId", "caseLinks", "caseLinkCount",
                "createdAt", "createdBy", "updatedAt", "updatedBy");
    }

    @Test
    void nationalIdNeverAppearsOnAListOrMatchPath() throws Exception {
        JsonNode person = createPerson();
        CaseFile c = cases.save(TestData.caseFile("Exposure case"));
        String ruleBody = """
                {"caseId":"%s","name":"hi","enabled":true,"condition":%s}
                """.formatted(c.getId(), json.writeValueAsString(ConditionNode.equalTo("risk", "HIGH")));
        String ruleId = json.readTree(mvc.perform(post("/api/v1/rules")
                        .contentType(MediaType.APPLICATION_JSON).content(ruleBody))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();

        for (String body : new String[]{
                mvc.perform(get("/api/v1/persons")).andReturn().getResponse().getContentAsString(),
                mvc.perform(get("/api/v1/rules/" + ruleId + "/matches")).andReturn().getResponse().getContentAsString(),
                mvc.perform(post("/api/v1/rules/preview").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"condition\":" + json.writeValueAsString(ConditionNode.equalTo("risk", "HIGH")) + "}"))
                        .andReturn().getResponse().getContentAsString()}) {
            assertThat(body).doesNotContain("nationalId").doesNotContain(person.get("nationalId").asString());
        }
    }

    @Test
    void forgedAuditValuesAreDroppedNotStored() throws Exception {
        String created = mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Forged","nationalId":"NID-%s","age":30,"risk":"LOW",
                 "createdBy":"attacker","createdAt":"1999-01-01T00:00:00Z","updatedBy":"attacker"}
                """.formatted(UUID.randomUUID())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode vm = json.readTree(created);
        assertThat(vm.get("createdBy").asString()).isEqualTo("system");
        assertThat(vm.get("createdAt").asString()).doesNotContain("1999");
    }

    @Test
    void unknownRequestFieldIsRejectedNamingIt() throws Exception {
        mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"X","nationalId":"NID-x","age":30,"risk":"LOW","bogus":"nope"}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("bogus")));
    }

    private static java.util.List<String> fieldNames(JsonNode node) {
        var names = new java.util.ArrayList<String>();
        node.properties().forEach(e -> names.add(e.getKey()));
        return names;
    }
}
