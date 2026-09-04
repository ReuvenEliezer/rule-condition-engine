package com.eliezer.ruleengine.rule.compiler;

import com.eliezer.ruleengine.domain.CaseStatus;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.PersonRole;
import com.eliezer.ruleengine.domain.RiskLevel;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;

/**
 * Queryable surface of {@link Person}.
 *
 * <p>Deliberately narrower than the entity: {@code nationalId} is intentionally absent, since
 * exposing a direct-identifier lookup through a free-form rule builder turns the rule API into an
 * enumeration oracle. Add it only behind a separate, audited endpoint.
 *
 * <p>Labels are supplied here because this registry is the single source of truth for a field;
 * a parallel label map — in this service or in a client — is the duplication the published
 * metadata surface exists to remove.
 *
 * <p>The {@code case.*} names traverse the join entity. They only resolve once the compiler has
 * joined {@code caseLinks}; see {@link RuleCompiler}.
 */
@Component
public class PersonFieldRegistry implements FieldRegistry<Person> {

    private static final Map<String, FieldDescriptor> DESCRIPTORS = FieldRegistry.index(
            FieldDescriptor.of("name", "name", String.class).labelled("Name"),
            FieldDescriptor.of("age", "age", Integer.class).labelled("Age"),
            FieldDescriptor.of("city", "city", String.class).labelled("City"),
            FieldDescriptor.of("risk", "risk", RiskLevel.class).labelled("Risk level"),
            FieldDescriptor.of("createdAt", "createdAt", Instant.class).labelled("Created at"),
            FieldDescriptor.joined("case.role", "caseLinks", "role", PersonRole.class)
                    .labelled("Linked case — role"),
            FieldDescriptor.joined("case.status", "caseLinks.caseFile", "status", CaseStatus.class)
                    .labelled("Linked case — status"),
            FieldDescriptor.joined("case.title", "caseLinks.caseFile", "title", String.class)
                    .labelled("Linked case — title")
    );

    @Override
    public Class<Person> rootType() {
        return Person.class;
    }

    @Override
    public Map<String, FieldDescriptor> descriptors() {
        return DESCRIPTORS;
    }
}
