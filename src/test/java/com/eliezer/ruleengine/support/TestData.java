package com.eliezer.ruleengine.support;

import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.CaseStatus;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.domain.PersonCaseId;
import com.eliezer.ruleengine.domain.PersonRole;
import com.eliezer.ruleengine.domain.RiskLevel;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Factory helpers, not shared fixtures. Each test builds exactly the rows it asserts on, so a
 * change to one test's data cannot silently alter another's expectations.
 */
public final class TestData {

    private static final AtomicLong SEQ = new AtomicLong();

    private TestData() {
    }

    public static Person person(String name, int age, RiskLevel risk) {
        return person(name, age, risk, "Tel Aviv");
    }

    public static Person person(String name, int age, RiskLevel risk, String city) {
        return Person.builder()
                .id(UUID.randomUUID())
                .name(name)
                .nationalId("ID-" + SEQ.incrementAndGet())
                .age(age)
                .city(city)
                .risk(risk)
                .build();
    }

    public static CaseFile caseFile(String title) {
        return CaseFile.builder()
                .id(UUID.randomUUID())
                .title(title)
                .status(CaseStatus.OPEN)
                .build();
    }

    public static PersonCase link(Person person, CaseFile caseFile, PersonRole role) {
        return PersonCase.builder()
                .id(new PersonCaseId(person.getId(), caseFile.getId()))
                .person(person)
                .caseFile(caseFile)
                .role(role)
                .build();
    }
}
