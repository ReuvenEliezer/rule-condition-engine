package com.eliezer.ruleengine.domain;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The person&harr;case link. Hard-deleted — an unlink — never soft-deleted (research R1).
 *
 * <p>Inherits the audit columns into its own table even though it is keyed by an {@code @EmbeddedId}:
 * {@link AuditableEntity} is a {@code @MappedSuperclass}, not a hierarchy root, so the composite key
 * is no obstacle. The creation timestamp is the inherited {@code createdAt}, mapped to the
 * pre-existing {@code linked_at} column by {@link AttributeOverride}; its response record exposes it
 * as {@code linkedAt}.
 */
@Entity
@Table(name = "person_case")
@AttributeOverride(name = "createdAt", column = @Column(name = "linked_at", nullable = false, updatable = false))
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class PersonCase extends AuditableEntity {

    @EmbeddedId
    private PersonCaseId id;

    /**
     * EAGER, not LAZY: Hibernate forbids a lazy to-one whose target is {@code @SoftDelete}
     * ({@code Person} is) — a proxy cannot know whether the referent is soft-deleted without
     * hitting the row. {@code PersonCrudService.innerDelete} hard-deletes these links before the
     * person is soft-deleted, so a link pointing at an invisible person should never exist.
     */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @MapsId("personId")
    @JoinColumn(name = "person_id")
    private Person person;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("caseId")
    @JoinColumn(name = "case_id")
    private CaseFile caseFile;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private PersonRole role;

    @Override
    public Object auditId() {
        return id;
    }
}
