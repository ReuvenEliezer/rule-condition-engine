package com.eliezer.ruleengine.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Version;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * Cross-cutting persistence concern shared by every managed record type: creation and modification
 * timestamps, the actor behind each, and an optimistic-lock version.
 *
 * <p>A {@code @MappedSuperclass}, not an inheritance root (see research R3): the columns are mapped
 * directly into each concrete table, so every read stays a single-table {@code SELECT} and there is
 * no polymorphic query to fire by accident. {@code @GeneratedValue} is untouched — identifiers are
 * application-assigned UUIDs — so JDBC insert batching keeps working.
 *
 * <h2>Two auditing mechanisms, only one wired here</h2>
 *
 * <ul>
 *   <li>{@code createdAt}/{@code updatedAt} come from Hibernate's
 *       {@link CreationTimestamp}/{@link UpdateTimestamp} — never a DDL default, never hand-set
 *       (constitution Principle V).</li>
 *   <li>{@code createdBy}/{@code updatedBy} come from Spring Data's {@link AuditingEntityListener},
 *       registered via {@link EntityListeners} below, resolving through the {@code AuditorAware}
 *       bean. {@code V1__init.sql} makes both columns {@code NOT NULL} with no default, so this
 *       listener is foundational: without it every insert fails.</li>
 * </ul>
 *
 * <p>{@code AuditTrailListener} — the field-level change recorder — is <strong>not</strong> in
 * {@link EntityListeners}. A JPA callback receives the entity already in its new state and cannot
 * see before/after values, so it is a Hibernate event-SPI listener registered separately on the
 * {@code EventListenerRegistry} (see {@code AuditingConfig} and research R10).
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
@Getter
public abstract class AuditableEntity {

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @CreatedBy
    @Column(name = "created_by", nullable = false, updatable = false)
    private String createdBy;

    @LastModifiedBy
    @Column(name = "updated_by", nullable = false)
    private String updatedBy;

    /**
     * Primitive, not a wrapper: a null version reads as "transient" and risks an INSERT on the
     * update path. A VM that omits {@code version} deserialises to {@code 0} — correct on create,
     * safely stale on update. The boxed form lives on {@code ResourceVm}, where null is the
     * "client did not send a token" signal the stale-check needs.
     */
    @Version
    @Column(name = "version", nullable = false)
    private int version;

    /**
     * Identifier the audit listener records as {@code record_id}. {@code PersonCase} returns its
     * composite {@link PersonCaseId}; UUID-keyed entities return the UUID.
     */
    public abstract Object auditId();
}
