package com.eliezer.ruleengine.domain;

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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * R1 — soft delete on {@code Person} only: national-id reuse after delete, link cleanup, exclusion
 * from rule evaluation with no compiler change, and 405 on case/rule delete.
 */
class PersonSoftDeleteIntegrationTest extends PostgresIntegrationTest {

    @Autowired WebApplicationContext wac;
    MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PersonRepository persons;
    @Autowired CaseRepository cases;
    @Autowired RuleRepository rules;
    @Autowired PersonCaseRepository personCases;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).build();
        personCases.deleteAllInBatch();
        rules.deleteAllInBatch();
        cases.deleteAllInBatch();
        persons.deleteAllInBatch();
    }

    private String createPerson(String nationalId) throws Exception {
        return mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Mona","nationalId":"%s","age":41,"city":"Haifa","risk":"HIGH"}
                """.formatted(nationalId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void deleteHidesThePersonAndASecondDeleteIs404NotAnError() throws Exception {
        String id = json.readTree(createPerson("NID-SD-1")).get("id").asString();

        mvc.perform(delete("/api/v1/persons/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/persons/" + id)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/persons/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void nationalIdIsReusableAfterDelete() throws Exception {
        String id = json.readTree(createPerson("NID-SD-2")).get("id").asString();
        mvc.perform(delete("/api/v1/persons/" + id)).andExpect(status().isNoContent());

        mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Re-registered","nationalId":"NID-SD-2","age":40,"risk":"LOW"}
                """))
                .andExpect(status().isCreated());
    }

    @Test
    void linksAreHardDeletedWithThePerson() throws Exception {
        String personId = json.readTree(createPerson("NID-SD-3")).get("id").asString();
        CaseFile c = cases.save(TestData.caseFile("Linked case"));
        mvc.perform(post("/api/v1/person-cases").contentType(MediaType.APPLICATION_JSON).content("""
                {"personId":"%s","caseId":"%s","role":"SUBJECT"}
                """.formatted(personId, c.getId())))
                .andExpect(status().isCreated());

        mvc.perform(delete("/api/v1/persons/" + personId)).andExpect(status().isNoContent());

        Long dangling = jdbc.queryForObject(
                "SELECT count(*) FROM person_case pc JOIN person p ON p.id = pc.person_id WHERE p.deleted",
                Long.class);
        assertThat(dangling).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM person_case", Long.class)).isZero();
    }

    @Test
    void deletedPersonDropsOutOfRuleMatchesWithNoCompilerChange() throws Exception {
        String matchId = json.readTree(createPerson("NID-SD-4")).get("id").asString();
        persons.save(TestData.person("Other high", 50, RiskLevel.HIGH));
        CaseFile c = cases.save(TestData.caseFile("Rule case"));

        String ruleBody = """
                {"caseId":"%s","name":"high risk","enabled":true,
                 "condition":%s}
                """.formatted(c.getId(),
                json.writeValueAsString(ConditionNode.equalTo("risk", "HIGH")));
        String ruleId = json.readTree(mvc.perform(post("/api/v1/rules")
                        .contentType(MediaType.APPLICATION_JSON).content(ruleBody))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asString();

        long before = totalMatches(ruleId);
        mvc.perform(delete("/api/v1/persons/" + matchId)).andExpect(status().isNoContent());
        assertThat(totalMatches(ruleId)).isEqualTo(before - 1);
    }

    @Test
    void caseAndRuleDeleteReturn405NamingTheAlternative() throws Exception {
        CaseFile c = cases.save(TestData.caseFile("Undeletable"));
        mvc.perform(delete("/api/v1/cases/" + c.getId()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("status=CLOSED")));

        String ruleId = json.readTree(mvc.perform(post("/api/v1/rules").contentType(MediaType.APPLICATION_JSON).content("""
                {"caseId":"%s","name":"r","enabled":true,
                 "condition":{"type":"CONDITION","field":"risk","operator":"EQUALS",
                              "value":{"type":"STRING","value":"LOW"}}}
                """.formatted(cases.save(TestData.caseFile("rc")).getId())))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asString();
        mvc.perform(delete("/api/v1/rules/" + ruleId))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("enabled=false")));
    }

    private long totalMatches(String ruleId) throws Exception {
        String body = mvc.perform(get("/api/v1/rules/" + ruleId + "/matches").param("scope", "GLOBAL"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("totalElements").asLong();
    }
}
