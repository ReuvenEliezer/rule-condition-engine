package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.domain.Rule;
import org.hibernate.Hibernate;

import java.util.Map;

/**
 * Entity class &rarr; the {@code recordType} discriminator, kept identical to each VM's
 * {@code TYPE} constant so the audit trail and the API name records the same way.
 */
final class RecordTypes {

    private static final Map<Class<?>, String> BY_CLASS = Map.of(
            Person.class, "person",
            CaseFile.class, "case",
            Rule.class, "rule",
            PersonCase.class, "person-case");

    private RecordTypes() {
    }

    static String of(Object entity) {
        return BY_CLASS.get(Hibernate.getClass(entity));
    }

    static boolean isManaged(Object entity) {
        return BY_CLASS.containsKey(Hibernate.getClass(entity));
    }
}
