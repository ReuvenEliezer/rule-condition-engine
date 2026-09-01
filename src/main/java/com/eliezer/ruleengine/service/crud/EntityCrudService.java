package com.eliezer.ruleengine.service.crud;

import com.eliezer.ruleengine.api.dto.ResourceVm;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Set;

/**
 * The uniform record-management operations, seen by {@code CrudController}. One implementation per
 * record type, all extending {@link AbstractEntityCrudService}.
 *
 * @param <E>  the JPA entity
 * @param <V>  the view model
 * @param <ID> the entity identifier
 */
public interface EntityCrudService<E, V extends ResourceVm, ID> {

    /** Create ({@code vm.id() == null}) or update. A stale {@code version} on the update path is a 409. */
    V saveOrUpdate(V vm);

    /** Single-record read, detail depth. */
    V findById(ID id);

    /** One bounded page, summary depth, no child collections loaded. */
    Page<V> findAll(Pageable pageable);

    /** Delete, where the type supports it; otherwise throws {@code DeletionNotSupportedException}. */
    void delete(ID id);

    /** Field names accepted in a {@code sort} parameter. */
    Set<String> allowedSortFields();

    /** The record identifier as a sort, appended to every page request for a total ordering. */
    Sort identitySort();
}
