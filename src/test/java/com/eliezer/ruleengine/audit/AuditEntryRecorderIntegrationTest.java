package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.support.PostgresIntegrationTest;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The parts of the audit-recording path that a unit test cannot see:
 *
 * <ul>
 *   <li>{@link AuditEntryRecorder} really runs at {@code BEFORE_COMMIT}, inside the transaction
 *       that produced the change — so the row is committed atomically with it;</li>
 *   <li>a failing audit insert aborts that transaction, leaving no partial state (FR-027 as
 *       amended);</li>
 *   <li>{@link AuditTrailListener} is attached to Hibernate's post-insert/update/delete pipelines
 *       by {@code AuditingConfig} (the {@code T061} failure mode: a Spring-managed listener that
 *       Hibernate never actually calls).</li>
 * </ul>
 *
 * The field-level delta logic is {@link AuditTrailListenerTest}; the event→entity mapping is
 * {@link AuditEntryRecorderTest}.
 */
class AuditEntryRecorderIntegrationTest extends PostgresIntegrationTest {

    @Autowired ApplicationEventPublisher publisher;
    @Autowired AuditEntryRepository audit;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired EntityManagerFactory entityManagerFactory;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
        audit.deleteAllInBatch();
    }

    @Test
    @DisplayName("an event published inside a transaction is persisted exactly once, on commit")
    void eventPublishedInATransactionIsPersistedOnCommit() {
        String recordId = UUID.randomUUID().toString();

        tx.executeWithoutResult(status -> publisher.publishEvent(change("person", recordId)));

        assertThat(audit.findByRecordTypeAndRecordId("person", recordId, PageRequest.of(0, 10)).getContent())
                .singleElement()
                .satisfies(entry -> {
                    assertThat(entry.getActor()).isEqualTo("system");
                    assertThat(entry.getOccurredAt()).isNotNull();
                    assertThat(entry.getEntityVersion()).isEqualTo(1);
                    assertThat(entry.getOperation()).isEqualTo(AuditOperation.UPDATE);
                });
    }

    @Test
    @DisplayName("a failing audit insert rolls back the whole transaction — no entry survives")
    void aFailedAuditInsertAbortsTheEnclosingTransaction() {
        String recordId = UUID.randomUUID().toString();

        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
            publisher.publishEvent(change("person", recordId));  // valid — would be inserted on commit
            publisher.publishEvent(change(null, recordId));      // record_type is NOT NULL — insert fails
        })).isInstanceOf(RuntimeException.class);

        assertThat(audit.count()).isZero();
    }

    @Test
    @DisplayName("AuditTrailListener is registered on every post-* event pipeline")
    void listenerIsRegisteredOnEveryPostEventPipeline() {
        EventListenerRegistry registry = entityManagerFactory.unwrap(SessionFactoryImplementor.class)
                .getServiceRegistry().requireService(EventListenerRegistry.class);

        for (EventType<?> type : List.of(EventType.POST_INSERT, EventType.POST_UPDATE, EventType.POST_DELETE)) {
            assertThat(registry.getEventListenerGroup(type).listeners())
                    .as("AuditTrailListener registered for %s", type.eventName())
                    .anyMatch(AuditTrailListener.class::isInstance);
        }
    }

    private static AuditChangeEvent change(String recordType, String recordId) {
        return new AuditChangeEvent(recordType, recordId, AuditOperation.UPDATE, 1,
                Map.of("city", Map.of("from", "Tel Aviv", "to", "Haifa")));
    }
}
