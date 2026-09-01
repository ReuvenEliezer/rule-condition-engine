package com.eliezer.ruleengine.service.convert;

import com.eliezer.ruleengine.api.dto.ResourceVm;
import com.eliezer.ruleengine.domain.AuditableEntity;

import java.util.Set;

/**
 * Bidirectional entity&harr;VM mapping for one record type.
 *
 * <p>{@code toVm} populates every scalar field; the Jackson view on the endpoint decides what is
 * actually serialised. Child collections are the one exception — they must not be <em>loaded</em>
 * for a list — so the detail path calls {@code toVmWithChildren} instead (added in US2).
 *
 * @param <E> the JPA entity
 * @param <V> the view model
 */
public interface VmMapper<E extends AuditableEntity, V extends ResourceVm> {

    /** Create a new entity, or load the existing one and apply the VM's writable fields to it. */
    E toEntity(V vm);

    /** Map an entity to its VM without touching any child collection (the list path). */
    V toVm(E entity);

    /**
     * Map an entity to its VM including the first page of each child relation plus its total (the
     * single-record path). A {@code @JsonView} hides a collection from output but does not stop it
     * being fetched, so the list path must call {@link #toVm} and never this. Default: no children.
     */
    default V toVmWithChildren(E entity) {
        return toVm(entity);
    }

    /** Field names this record type accepts in a {@code sort} parameter. */
    Set<String> allowedSortFields();
}
