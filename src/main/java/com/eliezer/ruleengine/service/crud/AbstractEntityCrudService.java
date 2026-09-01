package com.eliezer.ruleengine.service.crud;

import com.eliezer.ruleengine.api.dto.ResourceVm;
import com.eliezer.ruleengine.domain.AuditableEntity;
import com.eliezer.ruleengine.exception.DeletionNotSupportedException;
import com.eliezer.ruleengine.exception.MissingVersionException;
import com.eliezer.ruleengine.exception.RecordNotFoundException;
import com.eliezer.ruleengine.service.convert.VmMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * The four uniform operations, implemented once.
 *
 * <p>Every public method is a transaction boundary. Entity&nbsp;&rarr;&nbsp;VM mapping runs
 * <em>inside</em> it: {@code spring.jpa.open-in-view} is false, so a mapper invoked from the
 * controller would throw on any lazy field (research R4).
 *
 * <h2>The override hooks (FR-010)</h2>
 *
 * {@code beforeSave}, {@code innerSave}, {@code innerFindAll}, {@code innerDelete} and
 * {@code findEntityById} are how a concrete service contributes behaviour without touching this
 * class.
 *
 * <p><strong>They are invoked by {@code this}, not through the Spring proxy.</strong> An
 * {@code @Transactional} annotation on an override is therefore silently ignored — no warning, no
 * error — and a hook annotated {@code REQUIRES_NEW} runs in the caller's transaction anyway. That
 * is deliberate: the hooks must inherit the entry point's transaction (it is what makes
 * {@code PersonCrudService}'s link-cleanup-then-soft-delete atomic). A hook that genuinely needs
 * its own transaction has to move to a separate bean or use a {@code TransactionTemplate}.
 *
 * @param <E>  the JPA entity
 * @param <V>  the view model
 * @param <ID> the entity identifier
 */
public abstract class AbstractEntityCrudService<E extends AuditableEntity, V extends ResourceVm, ID>
        implements EntityCrudService<E, V, ID> {

    protected final VmMapper<E, V> mapper;
    protected final JpaRepository<E, ID> repository;

    protected AbstractEntityCrudService(VmMapper<E, V> mapper, JpaRepository<E, ID> repository) {
        this.mapper = mapper;
        this.repository = repository;
    }

    @Override
    @Transactional
    public V saveOrUpdate(V vm) {
        E entity = mapper.toEntity(vm);          // creates, or loads-and-mutates on vm.id()
        assertNotStale(vm, entity);
        beforeSave(entity, vm);
        E saved = innerSave(entity, vm);
        repository.flush();                      // force the INSERT/UPDATE now so @Version and
                                                // @UpdateTimestamp are current before mapping, and
                                                // a constraint violation surfaces to the handler
        return mapper.toVm(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public V findById(ID id) {
        return mapper.toVmWithChildren(findEntityById(id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<V> findAll(Pageable pageable) {
        return innerFindAll(pageable).map(mapper::toVm);
    }

    @Override
    @Transactional
    public void delete(ID id) {
        innerDelete(findEntityById(id));
        repository.flush();     // emit the DELETE (or @SoftDelete UPDATE) now, so its Hibernate
                               // post-delete event reaches the BEFORE_COMMIT audit recorder — a
                               // commit-time flush fires that event after the synchronizations run
    }

    @Override
    public Set<String> allowedSortFields() {
        return mapper.allowedSortFields();
    }

    /**
     * The mapper loads the managed entity and mutates it, so Hibernate's own {@code @Version} check
     * compares the freshly loaded version against the database and always agrees within one
     * transaction. That guards the load-to-flush window only. This guards against a client saving
     * from a copy it read minutes ago: a mismatched token is a 409, a missing token on the update
     * path is a 400 (research R9).
     */
    private void assertNotStale(V vm, E entity) {
        if (vm.id() == null) {
            return;
        }
        if (vm.version() == null) {
            throw new MissingVersionException(entityName(), vm.id());
        }
        if (vm.version() != entity.getVersion()) {
            throw new ObjectOptimisticLockingFailureException(entityName(), vm.id());
        }
    }

    // ---- override hooks (FR-010) --------------------------------------------

    /** Runs after the stale check, before the entity is saved. Default: nothing. */
    protected void beforeSave(E entity, V vm) {
    }

    /** Persist the entity. Default: {@code repository.save}. */
    protected E innerSave(E entity, V vm) {
        return repository.save(entity);
    }

    /** One bounded page of entities. Default: {@code repository.findAll(pageable)}. */
    protected Page<E> innerFindAll(Pageable pageable) {
        return repository.findAll(pageable);
    }

    /**
     * Delete the entity. Default: this record type is not deletable — it is retired through state
     * it already carries. Override to allow deletion (research R1).
     */
    protected void innerDelete(E entity) {
        throw new DeletionNotSupportedException(retirementHint());
    }

    /** The message the 405 shows when {@code innerDelete} is not overridden. */
    protected String retirementHint() {
        return "%s records cannot be deleted.".formatted(entityName());
    }

    protected E findEntityById(ID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecordNotFoundException(entityName(), id));
    }

    /** Human-readable record-type name used in error messages. */
    protected abstract String entityName();
}
