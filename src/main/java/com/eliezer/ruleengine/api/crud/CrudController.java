package com.eliezer.ruleengine.api.crud;

import com.eliezer.ruleengine.api.dto.PageResponse;
import com.eliezer.ruleengine.api.dto.ResourceVm;
import com.eliezer.ruleengine.api.dto.Vms;
import com.eliezer.ruleengine.exception.SortFieldNotAllowedException;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import com.eliezer.ruleengine.service.crud.EntityCrudService;
import com.fasterxml.jackson.annotation.JsonView;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.util.function.Function;

/**
 * The uniform record-management contract, written once (FR-001, FR-002). A concrete controller is
 * {@code @RestController @RequestMapping("/api/v1/{resource}") class XController extends
 * CrudController<X, XVm, XId>} plus a constructor — nothing else.
 *
 * <p>Spring MVC resolves {@code V} and {@code ID} against the concrete subclass
 * ({@code GenericTypeResolver}), so {@code @RequestBody} deserialises to the right record and
 * {@code @PathVariable} binds through the registered {@code Converter<String, ID>} — including the
 * composite {@code PersonCaseId} (research R7).
 *
 * @param <E>  the JPA entity
 * @param <V>  the view model
 * @param <ID> the entity identifier
 */
public abstract class CrudController<E, V extends ResourceVm, ID> {

    protected final EntityCrudService<E, V, ID> service;
    private final RuleEngineProperties properties;

    protected CrudController(EntityCrudService<E, V, ID> service, RuleEngineProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @PostMapping
    @JsonView(Vms.Detail.class)
    public ResponseEntity<V> saveOrUpdate(@Valid @RequestBody V vm) {
        boolean creating = vm.id() == null;
        V saved = service.saveOrUpdate(vm);
        return creating
                ? ResponseEntity.created(location(saved)).body(saved)
                : ResponseEntity.ok(saved);
    }

    @GetMapping("/{id}")
    @JsonView(Vms.Detail.class)
    public V findById(@PathVariable ID id) {
        return service.findById(id);
    }

    @GetMapping
    @JsonView(Vms.Summary.class)
    public PageResponse<V> findAll(@RequestParam(defaultValue = "0") int page,
                                   @RequestParam(required = false) Integer size,
                                   @RequestParam(required = false) String sort) {
        return PageResponse.from(service.findAll(pageable(page, size, sort)), Function.identity());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable ID id) {
        service.delete(id);
    }

    /**
     * Page size is clamped server-side; trusting a client-supplied size lets one request ask for
     * the whole population. A negative page clamps to 0. The identity sort is appended last:
     * LIMIT/OFFSET over a non-unique ordering lets rows repeat or vanish between pages.
     */
    private Pageable pageable(int page, Integer size, String sort) {
        int effective = size == null
                ? properties.defaultPageSize()
                : Math.clamp(size, 1, properties.maxPageSize());
        return PageRequest.of(Math.max(page, 0), effective,
                parseSort(sort).and(service.identitySort()));
    }

    private Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.unsorted();
        }
        String[] parts = sort.split(",", 2);
        String field = parts[0].trim();
        if (!service.allowedSortFields().contains(field)) {
            throw new SortFieldNotAllowedException(field, service.allowedSortFields());
        }
        boolean desc = parts.length > 1 && parts[1].trim().equalsIgnoreCase("desc");
        return Sort.by(desc ? Sort.Direction.DESC : Sort.Direction.ASC, field);
    }

    private URI location(V saved) {
        return ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(saved.id()).toUri();
    }
}
