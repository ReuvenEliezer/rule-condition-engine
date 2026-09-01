package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * FR-027 as amended: an audit-write failure rolls the business change back with it, and the error
 * identifies audit recording rather than surfacing as a generic 500. The invariant under test is
 * that no state exists in which a record changed and no audit entry exists.
 */
class AuditFailureRollbackIntegrationTest extends PostgresIntegrationTest {

    @Autowired WebApplicationContext wac;
    MockMvc mvc;
    @Autowired PersonRepository persons;

    @MockitoBean AuditEntryRepository auditEntryRepository;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(wac).build();
        persons.deleteAllInBatch();
        Mockito.when(auditEntryRepository.save(any()))
                .thenThrow(new RuntimeException("audit store unavailable"));
    }

    @Test
    void failedAuditWriteRollsBackTheChange() throws Exception {
        mvc.perform(post("/api/v1/persons").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Rollback","nationalId":"NID-RB-1","age":22,"risk":"LOW"}
                """))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("AUDIT_RECORDING_FAILED"));

        assertThat(persons.count()).isZero();
    }
}
