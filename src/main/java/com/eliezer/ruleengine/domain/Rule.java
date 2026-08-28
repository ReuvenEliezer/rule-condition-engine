package com.eliezer.ruleengine.domain;

import com.eliezer.ruleengine.rule.model.RuleNode;
import com.eliezer.ruleengine.rule.persistence.RuleNodeConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "rule")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Rule {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** Owning side of the 1:1 — {@code case_id} is UNIQUE at the schema level. */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "case_id", nullable = false, unique = true)
    private CaseFile caseFile;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    /**
     * The AST is stored as jsonb. The converter handles polymorphic (de)serialization with the
     * application's own ObjectMapper; {@code @JdbcTypeCode(JSON)} makes Hibernate bind the
     * resulting String as jsonb instead of text, which Postgres will not implicitly cast.
     */
    @Convert(converter = RuleNodeConverter.class)
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "condition_tree", nullable = false, columnDefinition = "jsonb")
    private RuleNode conditionTree;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
