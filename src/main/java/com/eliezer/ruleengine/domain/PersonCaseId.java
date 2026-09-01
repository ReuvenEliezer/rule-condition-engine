package com.eliezer.ruleengine.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class PersonCaseId implements Serializable {

    @Column(name = "person_id", nullable = false)
    private UUID personId;

    @Column(name = "case_id", nullable = false)
    private UUID caseId;

    /** Renders as {@code "<personUuid>:<caseUuid>"} — the form the link resource uses on the wire. */
    @Override
    public String toString() {
        return personId + ":" + caseId;
    }

    /** Parses {@code "<personUuid>:<caseUuid>"}. */
    public static PersonCaseId parse(String value) {
        int colon = value == null ? -1 : value.indexOf(':');
        if (colon < 0) {
            throw new IllegalArgumentException(
                    "person-case id must be \"<personUuid>:<caseUuid>\", got: " + value);
        }
        return new PersonCaseId(
                UUID.fromString(value.substring(0, colon)),
                UUID.fromString(value.substring(colon + 1)));
    }
}
