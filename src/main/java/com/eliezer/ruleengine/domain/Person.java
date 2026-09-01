package com.eliezer.ruleengine.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.SoftDelete;
import org.hibernate.annotations.SoftDeleteType;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * The only soft-deleted record type (research R1). {@code @SoftDelete} injects
 * {@code deleted = false} into the generated SQL of every query form — {@code findById}, derived
 * queries, HQL and Criteria — so a deleted person drops out of rule evaluation with no change to
 * {@code RuleCompiler} or {@code RuleEvaluationService}, and {@code DELETE} is rewritten to
 * {@code UPDATE deleted = true}.
 *
 * <p>{@code national_id} uniqueness is a <em>partial</em> unique index
 * ({@code ux_person_national_id_active ... WHERE deleted = false}), not a column {@code UNIQUE}: a
 * retained soft-deleted row must not permanently consume the national id. Hence no
 * {@code unique = true} here.
 */
@Entity
@Table(name = "person")
@SoftDelete(columnName = "deleted", strategy = SoftDeleteType.DELETED)
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Person extends AuditableEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    @Sensitive
    @Column(name = "national_id", nullable = false)
    private String nationalId;

    @Column(name = "age", nullable = false)
    private Integer age;

    @Column(name = "city")
    private String city;

    @Enumerated(EnumType.STRING)
    @Column(name = "risk", nullable = false)
    private RiskLevel risk;

    /**
     * Mapped explicitly through the join entity rather than {@code @ManyToMany}: the link row
     * carries its own attributes (role, linkedAt), which a plain {@code @ManyToMany} cannot hold.
     *
     * <p>Kept despite the unbounded-collection hazard {@code CaseFile} avoids: the rule compiler
     * resolves {@code case.*} fields by joining this association by name, and a Criteria join never
     * materialises the collection. Read it a page at a time from {@code PersonCaseRepository}, never
     * through this getter.
     */
    @OneToMany(mappedBy = "person")
    @Builder.Default
    private Set<PersonCase> caseLinks = new HashSet<>();

    @Override
    public Object auditId() {
        return id;
    }
}
