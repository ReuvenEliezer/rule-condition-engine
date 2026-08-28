package com.eliezer.ruleengine.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * {@code case} is a reserved SQL keyword, hence the table name {@code case_file}.
 */
@Entity
@Table(name = "case_file")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class CaseFile {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "title", nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private CaseStatus status;

    @Column(name = "opened_at", nullable = false, insertable = false, updatable = false)
    private Instant openedAt;

    @OneToMany(mappedBy = "caseFile")
    @Builder.Default
    private Set<PersonCase> personLinks = new HashSet<>();

    /** Inverse side — the FK and its UNIQUE constraint live on {@code rule.case_id}. */
    @OneToOne(mappedBy = "caseFile", fetch = FetchType.LAZY)
    private Rule rule;
}
