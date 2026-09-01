package com.eliezer.ruleengine.domain;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * {@code case} is a reserved SQL keyword, hence the table name {@code case_file}.
 *
 * <p>Retired via {@code status = CLOSED}, never deleted (research R1): {@code DELETE /api/v1/cases/{id}}
 * returns 405 naming that alternative. No {@code @SoftDelete}.
 *
 * <p>The creation timestamp is the inherited {@link AuditableEntity#getCreatedAt()}, mapped to the
 * pre-existing {@code opened_at} column by {@link AttributeOverride} so no data moves; its response
 * record exposes it as {@code openedAt}, the domain-meaningful name.
 *
 * <p>There is deliberately no {@code personLinks} collection here. A case accumulates an unbounded
 * number of linked persons, and a mapped {@code @OneToMany} has no paginated form: every read of it
 * loads the whole {@code person_case} set for the case, and because Lombok generates a public
 * getter that read is one accidental call away inside any transaction. Page the relation from the
 * owning side instead — {@code PersonCaseRepository.findByCaseFileId(UUID, Pageable)} pushes
 * LIMIT/OFFSET to the database and is served by {@code idx_person_case_case_id}.
 *
 * <p>{@link Person#getCaseLinks()} is the mirror image of the same hazard, but it stays: the rule
 * compiler resolves {@code case.*} fields by joining that association by name, and a Criteria join
 * never materialises the collection.
 */
@Entity
@Table(name = "case_file")
@AttributeOverride(name = "createdAt", column = @Column(name = "opened_at", nullable = false, updatable = false))
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class CaseFile extends AuditableEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "title", nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private CaseStatus status;

    /** Inverse side — the FK and its UNIQUE constraint live on {@code rule.case_id}. */
    @OneToOne(mappedBy = "caseFile", fetch = FetchType.LAZY)
    private Rule rule;

    @Override
    public Object auditId() {
        return id;
    }
}
