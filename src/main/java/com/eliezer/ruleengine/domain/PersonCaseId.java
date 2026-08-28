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
}
