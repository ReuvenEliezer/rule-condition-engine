package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.RiskLevel;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import com.eliezer.ruleengine.support.TestData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * US1 / FR-001, FR-002 — the same paths, parameters, envelope and status codes across every
 * managed record type. Parameterised so a divergence in one resource fails loudly.
 */
class CrudContractIntegrationTest extends PostgresIntegrationTest {

    @Autowired WebApplicationContext wac;
    MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PersonRepository persons;
    @Autowired CaseRepository cases;
    @Autowired RuleRepository rules;
    @Autowired PersonCaseRepository personCases;

    @BeforeEach
    void clean() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).build();
        personCases.deleteAllInBatch();
        rules.deleteAllInBatch();
        cases.deleteAllInBatch();
        persons.deleteAllInBatch();
    }

    /** One record type's contract surface: its path and a factory for a valid create body. */
    interface Fixture {
        String path();
        String validBody(CrudContractIntegrationTest t);
        /** A field mutation that produces a distinguishable second version. */
        String mutate(String body, CrudContractIntegrationTest t);
        /** Persons and person-case links are deletable; cases and rules are retired by state. */
        default boolean deletable() { return true; }
    }

    static Stream<org.junit.jupiter.params.provider.Arguments> resources() {
        return Stream.of(
                org.junit.jupiter.params.provider.Arguments.of("persons", (Fixture) new PersonFixture()),
                org.junit.jupiter.params.provider.Arguments.of("cases", (Fixture) new CaseFixture()),
                org.junit.jupiter.params.provider.Arguments.of("rules", (Fixture) new RuleFixture()),
                org.junit.jupiter.params.provider.Arguments.of("person-cases", (Fixture) new PersonCaseFixture()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void emptyListIs200WithEmptyContent(String name, Fixture f) throws Exception {
        mvc.perform(get("/api/v1/" + f.path()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void createWithoutIdReturns201AndLocation(String name, Fixture f) throws Exception {
        String created = mvc.perform(post("/api/v1/" + f.path())
                        .contentType(MediaType.APPLICATION_JSON).content(f.validBody(this)))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.type").exists())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(created).get("id").asString()).isNotBlank();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void saveWithIdUpdatesRatherThanDuplicates(String name, Fixture f) throws Exception {
        JsonNode v0 = json.readTree(create(f));
        String update = f.mutate(v0.toString(), this);
        mvc.perform(post("/api/v1/" + f.path())
                        .contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(v0.get("id").asString()))
                .andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/v1/" + f.path()))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void unknownIdReturns404(String name, Fixture f) throws Exception {
        mvc.perform(get("/api/v1/" + f.path() + "/" + missingId(f)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECORD_NOT_FOUND"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void unknownSortFieldReturns400(String name, Fixture f) throws Exception {
        mvc.perform(get("/api/v1/" + f.path()).param("sort", "nosuchfield"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SORT_FIELD"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void staleVersionReturns409(String name, Fixture f) throws Exception {
        JsonNode v0 = json.readTree(create(f));
        String update = f.mutate(v0.toString(), this);
        mvc.perform(post("/api/v1/" + f.path()).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isOk());
        // same body again: version 0 is now stale
        mvc.perform(post("/api/v1/" + f.path()).contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONCURRENT_MODIFICATION"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void saveReferencingVanishedRecordReturns404(String name, Fixture f) throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(f.deletable());
        JsonNode v0 = json.readTree(create(f));
        mvc.perform(delete("/api/v1/" + f.path() + "/" + pathId(f, v0))).andExpect(status().isNoContent());
        String resurrect = withVersion(v0.toString(), 0);
        mvc.perform(post("/api/v1/" + f.path()).contentType(MediaType.APPLICATION_JSON).content(resurrect))
                .andExpect(status().isNotFound());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("resources")
    void deleteReturns405WhereTheTypeIsRetiredByState(String name, Fixture f) throws Exception {
        org.junit.jupiter.api.Assumptions.assumeFalse(f.deletable());
        JsonNode v0 = json.readTree(create(f));
        mvc.perform(delete("/api/v1/" + f.path() + "/" + pathId(f, v0)))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("DELETION_NOT_SUPPORTED"));
    }

    @Test
    void sizeIsClampedAndEffectiveSizeEchoed() throws Exception {
        seedPersons(10);
        mvc.perform(get("/api/v1/persons").param("size", "9999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(500));
    }

    @Test
    void pageBeyondTheEndIsEmptyNotAnError() throws Exception {
        seedPersons(10);
        mvc.perform(get("/api/v1/persons").param("page", "99999").param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(10));
    }

    @Test
    void deepPaginationReturnsTheRightWindowWithStableTotals() throws Exception {
        seedPersons(250);
        String body = mvc.perform(get("/api/v1/persons").param("page", "2").param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(250))
                .andExpect(jsonPath("$.totalPages").value(5))
                .andExpect(jsonPath("$.content.length()").value(50))
                .andReturn().getResponse().getContentAsString();
        // consecutive pages must not repeat an id
        List<String> page1 = ids(mvc.perform(get("/api/v1/persons").param("page", "1").param("size", "50"))
                .andReturn().getResponse().getContentAsString());
        List<String> page2 = ids(body);
        assertThat(page1).doesNotContainAnyElementsOf(page2);
    }

    @Test
    void aClosedCaseCanBeReopenedThroughAPlainSave() throws Exception {
        JsonNode open = json.readTree(create(new CaseFixture()));
        String closed = withField(open.toString(), "status", "CLOSED", 0);
        JsonNode afterClose = json.readTree(mvc.perform(post("/api/v1/cases")
                        .contentType(MediaType.APPLICATION_JSON).content(closed))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String reopened = withField(afterClose.toString(), "status", "OPEN", afterClose.get("version").asInt());
        mvc.perform(post("/api/v1/cases").contentType(MediaType.APPLICATION_JSON).content(reopened))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"));
    }

    // ---- helpers ----------------------------------------------------------

    private String create(Fixture f) throws Exception {
        return mvc.perform(post("/api/v1/" + f.path())
                        .contentType(MediaType.APPLICATION_JSON).content(f.validBody(this)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private String pathId(Fixture f, JsonNode vm) {
        return vm.get("id").asString();
    }

    private String missingId(Fixture f) {
        if (f instanceof PersonCaseFixture) {
            return UUID.randomUUID() + ":" + UUID.randomUUID();
        }
        return UUID.randomUUID().toString();
    }

    private String withVersion(String body, int version) {
        return withField(body, "version", version, null);
    }

    private String withField(String body, String field, Object value, Integer version) {
        var node = json.readTree(body).deepCopy();
        var obj = (tools.jackson.databind.node.ObjectNode) node;
        if (value instanceof Integer i) obj.put(field, i);
        else obj.put(field, value.toString());
        if (version != null) obj.put("version", version);
        return obj.toString();
    }

    private List<String> ids(String pageBody) {
        return json.readTree(pageBody).get("content").valueStream()
                .map(n -> n.get("id").asString()).toList();
    }

    void seedPersons(int n) {
        var list = IntStream.range(0, n)
                .mapToObj(i -> TestData.person("P" + i, 30 + (i % 40), RiskLevel.LOW))
                .toList();
        persons.saveAll(list);
    }

    UUID freshCaseId() {
        CaseFile c = cases.save(TestData.caseFile("Case " + UUID.randomUUID()));
        return c.getId();
    }

    UUID freshPersonId() {
        Person p = persons.save(TestData.person("Linked " + UUID.randomUUID(), 33, RiskLevel.MEDIUM));
        return p.getId();
    }

    // ---- fixtures --------------------------------------------------------

    static final class PersonFixture implements Fixture {
        public String path() { return "persons"; }
        public String validBody(CrudContractIntegrationTest t) {
            return """
                {"name":"Ada Lovelace","nationalId":"NID-%s","age":36,"city":"London","risk":"LOW"}
                """.formatted(UUID.randomUUID());
        }
        public String mutate(String body, CrudContractIntegrationTest t) {
            return body.replace("\"name\":\"Ada Lovelace\"", "\"name\":\"Ada King\"")
                       .replace("Ada Lovelace", "Ada King");
        }
    }

    static final class CaseFixture implements Fixture {
        public String path() { return "cases"; }
        public boolean deletable() { return false; }
        public String validBody(CrudContractIntegrationTest t) {
            return """
                {"title":"Operation %s","status":"OPEN"}
                """.formatted(UUID.randomUUID());
        }
        public String mutate(String body, CrudContractIntegrationTest t) {
            return body.replace("\"status\":\"OPEN\"", "\"status\":\"UNDER_REVIEW\"");
        }
    }

    static final class RuleFixture implements Fixture {
        public String path() { return "rules"; }
        public boolean deletable() { return false; }
        public String validBody(CrudContractIntegrationTest t) {
            return """
                {"caseId":"%s","name":"Rule %s","enabled":true,
                 "condition":{"type":"CONDITION","field":"risk","operator":"EQUALS",
                              "value":{"type":"STRING","value":"HIGH"}}}
                """.formatted(t.freshCaseId(), UUID.randomUUID());
        }
        public String mutate(String body, CrudContractIntegrationTest t) {
            return body.replace("\"enabled\":true", "\"enabled\":false");
        }
    }

    static final class PersonCaseFixture implements Fixture {
        public String path() { return "person-cases"; }
        public String validBody(CrudContractIntegrationTest t) {
            return """
                {"personId":"%s","caseId":"%s","role":"SUBJECT"}
                """.formatted(t.freshPersonId(), t.freshCaseId());
        }
        public String mutate(String body, CrudContractIntegrationTest t) {
            return body.replace("\"role\":\"SUBJECT\"", "\"role\":\"WITNESS\"");
        }
    }
}
