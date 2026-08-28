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
 * <p>The {@code case.*} names traverse the join entity. They only resolve once the compiler has
 * joined {@code caseLinks}; see {@link RuleCompiler}.
 */
@Component
public class PersonFieldRegistry implements FieldRegistry<Person> {

    private static final Map<String, FieldDescriptor> DESCRIPTORS = FieldRegistry.index(
            FieldDescriptor.of("name", "name", String.class),
            FieldDescriptor.of("age", "age", Integer.class),
            FieldDescriptor.of("city", "city", String.class),
            FieldDescriptor.of("risk", "risk", RiskLevel.class),
            FieldDescriptor.of("createdAt", "createdAt", Instant.class),
            FieldDescriptor.joined("case.role", "caseLinks", "role", PersonRole.class),
            FieldDescriptor.joined("case.status", "caseLinks.caseFile", "status", CaseStatus.class),
            FieldDescriptor.joined("case.title", "caseLinks.caseFile", "title", String.class)
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
