package com.eliezer.ruleengine.audit;

import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Wires both halves of auditing.
 *
 * <ul>
 *   <li>{@code @EnableJpaAuditing} activates Spring Data's {@code AuditingEntityListener}, which
 *       populates {@code @CreatedBy}/{@code @LastModifiedBy} from {@link SystemAuditorAware}.
 *       Timestamps stay on Hibernate's annotations (research R6).</li>
 *   <li>{@link AuditTrailListener} is registered on Hibernate's {@code EventListenerRegistry} after
 *       the {@code EntityManagerFactory} is built. It is a Spring bean, so its
 *       {@link ApplicationEventPublisher} is injected — this works because Spring Boot sets
 *       {@code hibernate.resource.beans.container} to {@code SpringBeanContainer}; without it
 *       Hibernate would no-arg-construct the listener and the publisher would be null (research R10,
 *       T061).</li>
 * </ul>
 */
@Configuration
@EnableJpaAuditing(auditorAwareRef = "systemAuditorAware")
public class AuditingConfig {

    @Bean
    AuditTrailListener auditTrailListener(ApplicationEventPublisher publisher) {
        return new AuditTrailListener(publisher);
    }

    @Bean
    AuditListenerRegistration auditListenerRegistration(EntityManagerFactory emf, AuditTrailListener listener) {
        return new AuditListenerRegistration(emf, listener);
    }

    /** Appends {@link AuditTrailListener} to the post-insert/update/delete event pipelines. */
    static class AuditListenerRegistration {

        private final EntityManagerFactory emf;
        private final AuditTrailListener listener;

        AuditListenerRegistration(EntityManagerFactory emf, AuditTrailListener listener) {
            this.emf = emf;
            this.listener = listener;
        }

        @PostConstruct
        void register() {
            if (listener == null) {
                throw new IllegalStateException("AuditTrailListener not injected");
            }
            SessionFactoryImplementor sessionFactory = emf.unwrap(SessionFactoryImplementor.class);
            EventListenerRegistry registry =
                    sessionFactory.getServiceRegistry().requireService(EventListenerRegistry.class);
            registry.appendListeners(EventType.POST_INSERT, listener);
            registry.appendListeners(EventType.POST_UPDATE, listener);
            registry.appendListeners(EventType.POST_DELETE, listener);
        }
    }
}
