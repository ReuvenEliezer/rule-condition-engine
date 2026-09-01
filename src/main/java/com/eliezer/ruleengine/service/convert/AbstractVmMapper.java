package com.eliezer.ruleengine.service.convert;

import com.eliezer.ruleengine.api.dto.ResourceVm;
import com.eliezer.ruleengine.domain.AuditableEntity;

/**
 * Implements the one piece of logic every mapper shares: {@code toEntity} is a single operation
 * that <em>creates</em> when the VM carries no {@code id} and <em>loads and mutates</em> when it
 * does (FR-003). Concrete mappers fill in three hooks.
 *
 * @param <E>  the JPA entity
 * @param <V>  the view model
 * @param <ID> the entity identifier
 */
public abstract class AbstractVmMapper<E extends AuditableEntity, V extends ResourceVm, ID>
        implements VmMapper<E, V> {

    @Override
    public E toEntity(V vm) {
        E entity = vm.id() == null ? createInstance() : loadForUpdate(parseId(vm.id()));
        applyToEntity(entity, vm);
        return entity;
    }

    /** A new, unpersisted entity with its identifier assigned. */
    protected abstract E createInstance();

    /** Parse the raw {@code vm.id()} into the entity's identifier type. */
    protected abstract ID parseId(Object rawId);

    /** Load the managed entity to be mutated; throws if it no longer exists. */
    protected abstract E loadForUpdate(ID id);

    /** Copy the VM's writable fields onto the entity. Never touches audit fields or {@code version}. */
    protected abstract void applyToEntity(E entity, V vm);
}
