package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * US3 / FR-020–FR-028 — one {@code audit_entry} row per change with its field-level delta, the
 * national id redacted, and the actor {@code system}.
 */
@ExtendWith(OutputCaptureExtension.class)
class AuditTrailIntegrationTest extends PostgresIntegrationTest {

    private static final String SECRET_NID = "NID-SECRET-4242";

    @Autowired WebApplicationContext wac;
    MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AuditEntryRepository audit;
    @Autowired PersonRepository persons;
    @Autowired CaseRepository cases;
    @Autowired RuleRepository rules;
    @Autowired PersonCaseRepository personCases;
    @Autowired RequestAuditFilter requestAuditFilter;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).addFilters(requestAuditFilter).build();
        audit.deleteAllInBatch();
        personCases.deleteAllInBatch();
        rules.deleteAllInBatch();
        cases.deleteAllInBatch();
        persons.deleteAllInBatch();
    }

    private JsonNode createPerson() throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Dana","nationalId":"%s","age":34,"city":"Tel Aviv","risk":"LOW"}
                """.formatted(SECRET_NID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode update(JsonNode current, String field, String value) throws Exception {
        var obj = (tools.jackson.databind.node.ObjectNode) current.deepCopy();
        obj.put(field, value);
        return json.readTree(mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON)
                        .content(obj.toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void createUpdateDeleteEachWriteOneRowWithActorSystem() throws Exception {
        JsonNode v0 = createPerson();
        String id = v0.get("id").asString();

        JsonNode v1 = update(v0, "risk", "HIGH");
        mvc.perform(delete("/api/v1/persons/" + id)).andExpect(status().isNoContent());

        var entries = audit.findByRecordTypeAndRecordId("person", id,
                org.springframework.data.domain.PageRequest.of(0, 10,
                        org.springframework.data.domain.Sort.by("occurredAt", "id"))).getContent();
        assertThat(entries).hasSize(3);
        assertThat(entries).allSatisfy(e -> assertThat(e.getActor()).isEqualTo("system"));
        assertThat(entries.stream().map(AuditEntry::getOperation).toList())
                .containsExactly(AuditOperation.CREATE, AuditOperation.UPDATE, AuditOperation.DELETE);

        AuditEntry updateRow = entries.get(1);
        // Only the business field that actually moved (data-model §9), not the mechanical
        // updatedAt/updatedBy/version churn.
        assertThat(updateRow.getChanges()).containsOnlyKeys("risk");
        @SuppressWarnings("unchecked")
        var riskDelta = (java.util.Map<String, Object>) updateRow.getChanges().get("risk");
        assertThat(riskDelta).containsEntry("from", "LOW").containsEntry("to", "HIGH");

        // createdAt is unchanged by the update; updatedAt moves — visible on the update response.
        assertThat(v1.get("createdAt").asString()).isEqualTo(v0.get("createdAt").asString());
        assertThat(v1.get("updatedAt").asString()).isNotEqualTo(v0.get("updatedAt").asString());
    }

    @Test
    void softDeleteIsLabelledDelete() throws Exception {
        String id = createPerson().get("id").asString();
        mvc.perform(delete("/api/v1/persons/" + id)).andExpect(status().isNoContent());

        var entries = audit.findByRecordTypeAndRecordId("person", id,
                org.springframework.data.domain.PageRequest.of(0, 10)).getContent();
        assertThat(entries).anySatisfy(e -> assertThat(e.getOperation()).isEqualTo(AuditOperation.DELETE));
    }

    @Test
    void nationalIdValueNeverReachesTheAuditStoreOrTheLog(CapturedOutput output) throws Exception {
        JsonNode v0 = createPerson();
        update(v0, "name", "Dana Renamed");

        String allChanges = audit.findAll().stream()
                .map(e -> String.valueOf(e.getChanges())).reduce("", (a, b) -> a + b);
        assertThat(allChanges).doesNotContain(SECRET_NID);
        assertThat(output.getAll()).doesNotContain(SECRET_NID);
        assertThat(output.getAll().toLowerCase()).doesNotContain("authorization");
    }

    @Test
    void everyApiCallEmitsARequestLogLine(CapturedOutput output) throws Exception {
        createPerson();
        assertThat(output.getAll())
                .contains("request method=POST")
                .contains("path=/api/v1/persons")
                .contains("actor=system");
    }

}
