package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.RiskLevel;

import java.util.UUID;

/**
 * Match projection. Deliberately omits {@code nationalId}: rule evaluation is a screening
 * operation and returning a direct identifier on every hit widens exposure far beyond what the
 * operation needs. Fetch it through the person-detail endpoint, where it can be audited.
 */
public record PersonMatch(UUID id, String name, Integer age, String city, RiskLevel risk) {

    public static PersonMatch from(Person person) {
        return new PersonMatch(
                person.getId(),
                person.getName(),
                person.getAge(),
                person.getCity(),
                person.getRisk());
    }
}
