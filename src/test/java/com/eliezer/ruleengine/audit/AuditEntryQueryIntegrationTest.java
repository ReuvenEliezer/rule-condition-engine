package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SC-008 — a known sequence of changes replayed from {@code audit_entry} alone, without reading the
 * person row or the application log. Also: the listing is paged, clamped and totally ordered.
 */
class AuditEntryQueryIntegrationTest extends PostgresIntegrationTest {

    @Autowired WebApplicationContext wac;
    MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired AuditEntryRepository audit;
    @Autowired PersonRepository persons;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).build();
        audit.deleteAllInBatch();
        persons.deleteAllInBatch();
    }

    @Test
    void aPersonsHistoryIsReconstructibleFromAuditEntriesAlone() throws Exception {
        JsonNode v = json.readTree(createPerson("""
                {"name":"Rana","nationalId":"NID-Q-1","age":30,"city":"Acre","risk":"LOW"}
                """));
        String id = v.get("id").asString();
        v = save(v, "age", "31");
        v = save(v, "risk", "HIGH");
        v = save(v, "city", "Haifa");

        JsonNode page = json.readTree(mvc.perform(get("/api/v1/audit-entries")
                        .param("recordType", "person").param("recordId", id).param("sort", "occurredAt"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        List<JsonNode> entries = new ArrayList<>();
        page.get("content").forEach(entries::add);

        assertThat(entries).hasSize(4);
        assertThat(entries.get(0).get("operation").asString()).isEqualTo("CREATE");

        // Replay: start from the CREATE values, apply each UPDATE delta in order.
        assertThat(entries.get(0).get("changes").get("age").get("to").asInt()).isEqualTo(30);
        assertThat(entries.get(0).get("changes").get("risk").get("to").asString()).isEqualTo("LOW");
        assertThat(entries.get(1).get("changes").get("age").get("from").asInt()).isEqualTo(30);
        assertThat(entries.get(1).get("changes").get("age").get("to").asInt()).isEqualTo(31);
        assertThat(entries.get(2).get("changes").get("risk").get("to").asString()).isEqualTo("HIGH");
        assertThat(entries.get(3).get("changes").get("city").get("to").asString()).isEqualTo("Haifa");
        assertThat(entries.get(3).get("entityVersion").asInt()).isEqualTo(3);
    }

    @Test
    void theListingIsClampedAndTotallyOrderedAcrossPages() throws Exception {
        JsonNode v = json.readTree(createPerson("""
                {"name":"P","nationalId":"NID-Q-2","age":20,"risk":"LOW"}
                """));
        for (int i = 0; i < 25; i++) {
            v = save(v, "age", String.valueOf(21 + i));
        }

        JsonNode clamped = json.readTree(mvc.perform(get("/api/v1/audit-entries").param("size", "9999"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(clamped.get("size").asInt()).isEqualTo(500);

        List<String> p0 = rowKeys("/api/v1/audit-entries?page=0&size=10");
        List<String> p1 = rowKeys("/api/v1/audit-entries?page=1&size=10");
        assertThat(p0).doesNotContainAnyElementsOf(p1);

        mvc.perform(get("/api/v1/audit-entries").param("sort", "nosuchfield"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SORT_FIELD"));
    }

    private List<String> rowKeys(String url) throws Exception {
        JsonNode page = json.readTree(mvc.perform(get(url)).andReturn().getResponse().getContentAsString());
        List<String> out = new ArrayList<>();
        page.get("content").forEach(n -> out.add(n.get("occurredAt").asString() + "#" + n.get("changes")));
        return out;
    }

    private String createPerson(String body) throws Exception {
        return mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private JsonNode save(JsonNode current, String field, String value) throws Exception {
        ObjectNode obj = (ObjectNode) current.deepCopy();
        obj.put(field, value);
        return json.readTree(mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON)
                        .content(obj.toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
}
