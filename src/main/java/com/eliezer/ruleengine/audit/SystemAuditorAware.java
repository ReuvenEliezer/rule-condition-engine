package com.eliezer.ruleengine.audit;

import org.springframework.data.domain.AuditorAware;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Resolves the actor recorded in {@code created_by} / {@code updated_by} and in every
 * {@link AuditEntry}.
 *
 * <p>This service has no authentication layer, so the actor is the literal {@code "system"} — an
 * explicit value, never an empty {@link Optional} (FR-026, and the constitution's "Known absences":
 * "an actor resolves to an explicit {@code system} value, never to an empty one"). When
 * authentication arrives, this is the one bean that changes.
 */
@Component
public class SystemAuditorAware implements AuditorAware<String> {

    static final String SYSTEM = "system";

    @Override
    public Optional<String> getCurrentAuditor() {
        return Optional.of(SYSTEM);
    }
}
