package com.eliezer.ruleengine.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * One immutable, insert-only record of a single lifecycle change to a managed record.
 *
 * <p>Deliberately <strong>not</strong> an {@code AuditableEntity}: no {@code version}, no
 * {@code updatedBy}, nothing to update — and extending the audited base would make the audit table
 * audit its own inserts (FR-030). {@code @Immutable} tells Hibernate never to emit an UPDATE for it.
 */
@Entity
@Immutable
@Table(name = "audit_entry")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class AuditEntry {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** The VM {@code type()} discriminator, so audit and API agree on the record-type name. */
    @Column(name = "record_type", nullable = false, updatable = false)
    private String recordType;

    /** {@code TEXT}, so {@code PersonCase}'s {@code "<personUuid>:<caseUuid>"} fits the same column. */
    @Column(name = "record_id", nullable = false, updatable = false)
    private String recordId;

    @Enumerated(EnumType.STRING)
    @Column(name = "operation", nullable = false, updatable = false)
    private AuditOperation operation;

    @Column(name = "actor", nullable = false, updatable = false)
    private String actor;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    /** The {@code @Version} the change produced — disambiguates replay order when timestamps tie. */
    @Column(name = "entity_version", updatable = false)
    private Integer entityVersion;

    /**
     * Field-level delta. {@code {field: {from, to}}} for an update, {@code {field: {to}}} for a
     * create, {@code null} for a delete. A field marked {@code @Sensitive} appears with both values
     * replaced by {@code "***"}.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "changes", columnDefinition = "jsonb", updatable = false)
    private Map<String, Object> changes;
}
