# The Uniform Record-Management Contract

**Feature**: `001-crud-audit-viewmodel-api` | **Date**: 2026-08-30

Every managed record type inherits these operations with these shapes (FR-001, FR-002). Concrete
endpoints and schemas are in [openapi.yaml](./openapi.yaml); decisions are in
[research.md](./research.md).

---

## 1. The generic skeleton

Three type parameters, everywhere: **DB entity, UI object, identifier.**

```java
public class PersonController   extends CrudController<Person,     PersonVm,     UUID> { }
public class CaseFileController extends CrudController<CaseFile,   CaseFileVm,   UUID> { }
public class RuleController     extends CrudController<Rule,       RuleVm,       UUID> { }
public class PersonCaseController extends CrudController<PersonCase, PersonCaseVm, PersonCaseId> { }
```

### The UI object

One record per entity, used in both directions. Summary vs. detail is a **Jackson view**, not a
second type; read-only fields are enforced by Jackson, not by a separate request type.

```java
// api/dto/Vms.java — the two view markers, declared once
public final class Vms {
    public interface Summary { }                       // list responses
    public interface Detail extends Summary { }        // single-record responses
}

// api/dto/ResourceVm.java
public interface ResourceVm {
    Object id();        // null => create, present => update  (FR-003)
    Integer version();  // optimistic-lock token; boxed, see below   (R9)
    String type();      // discriminator                      (FR-014)
}

// api/dto/PersonVm.java
public record PersonVm(
        @JsonView(Vms.Summary.class) UUID id,
        @JsonView(Vms.Summary.class) Integer version,
        @JsonView(Vms.Summary.class) @JsonProperty(access = READ_ONLY) String type,

        @JsonView(Vms.Summary.class) @NotBlank @Size(max = 200) String name,
        @JsonView(Vms.Summary.class) @NotNull @Min(0) @Max(149) Integer age,
        @JsonView(Vms.Summary.class) String city,
        @JsonView(Vms.Summary.class) @NotNull RiskLevel risk,

        // Detail only — never serialised on a list or match response (FR-017)
        @JsonView(Vms.Detail.class) @NotBlank String nationalId,
        @JsonView(Vms.Detail.class) @JsonProperty(access = READ_ONLY) List<PersonCaseVm> caseLinks,

        // Audit metadata: emitted, never accepted (FR-023)
        @JsonView(Vms.Detail.class) @JsonProperty(access = READ_ONLY) Instant createdAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = READ_ONLY) String  createdBy,
        @JsonView(Vms.Detail.class) @JsonProperty(access = READ_ONLY) Instant updatedAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = READ_ONLY) String  updatedBy
) implements ResourceVm { }
```

Two annotations carry the whole payload contract:

- **`@JsonView(Vms.Detail.class)`** — the field is serialised only on single-record responses.
  `Vms.Detail extends Vms.Summary`, so a summary field is included in both.
`version` is boxed on the VM and a primitive `int` on `AuditableEntity`. A primitive here would
deserialise an omitted `version` to `0`, which silently equals a never-updated entity's version and
loses the stale-client signal; null on the update path is a 400 instead.

- **`@JsonProperty(access = READ_ONLY)`** — Jackson emits the field but **ignores it on
  deserialisation**. A client that posts `"createdBy": "attacker"` has it silently dropped, which is
  FR-023 without a filtering step and without a separate request record.

### Controller — written once

```java
// api/crud/CrudController.java
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
        boolean creating = vm.id() == null;          // the FR-003 discriminator
        V saved = service.saveOrUpdate(vm);
        return creating ? ResponseEntity.created(location(saved)).body(saved)
                        : ResponseEntity.ok(saved);
    }

    @GetMapping("/{id}")
    @JsonView(Vms.Detail.class)
    public V findById(@PathVariable ID id) {
        return service.findById(id);
    }

    @GetMapping
    @JsonView(Vms.Summary.class)                     // <- the one place list-shape is decided
    public PageResponse<V> findAll(@RequestParam(defaultValue = "0") int page,
                                   @RequestParam(required = false) Integer size,
                                   @RequestParam(required = false) String sort) {
        return PageResponse.from(service.findAll(pageable(page, size, sort)));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable ID id) {
        service.delete(id);      // base impl throws DeletionNotSupportedException -> 405
    }

    /**
     * Page size is clamped server-side; trusting a client-supplied size lets one request ask for
     * the whole population. The identity sort is always appended last: LIMIT/OFFSET over a
     * non-unique ordering lets rows repeat or vanish between pages.
     */
    private Pageable pageable(int page, Integer size, String sort) {
        int effective = size == null ? properties.defaultPageSize()
                                     : Math.clamp(size, 1, properties.maxPageSize());
        return PageRequest.of(Math.max(page, 0), effective,
                              parseSort(sort).and(service.identitySort()));
    }

    private Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) return Sort.unsorted();
        String[] parts = sort.split(",", 2);
        String field = parts[0].trim();
        if (!service.allowedSortFields().contains(field)) {
            throw new SortFieldNotAllowedException(field, service.allowedSortFields());
        }
        return Sort.by(parts.length > 1 && parts[1].trim().equalsIgnoreCase("desc")
                ? Sort.Direction.DESC : Sort.Direction.ASC, field);
    }

    private URI location(V saved) {
        return ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(saved.id()).toUri();
    }
}
```

**The summary/detail decision is made in the base class, once.** Every resource inherits it; no
per-endpoint annotation to forget. The only endpoints that must declare a view themselves are the
rule-specific ones that return persons — `/matches` and `/preview` — and both take
`@JsonView(Vms.Summary.class)`.

> Spring MVC resolves `V` and `ID` against the concrete subclass (`GenericTypeResolver`), so
> `@RequestBody` deserialises to the right record and `@PathVariable` binds through the registered
> `Converter<String, ID>` — including `PersonCaseIdConverter` for the composite key (R7).

### Service — written once

```java
// service/crud/EntityCrudService.java
public interface EntityCrudService<E, V extends ResourceVm, ID> {
    V saveOrUpdate(V vm);
    V findById(ID id);
    Page<V> findAll(Pageable pageable);
    void delete(ID id);
    Set<String> allowedSortFields();
    Sort identitySort();
}

// service/crud/AbstractEntityCrudService.java
public abstract class AbstractEntityCrudService<E extends AuditableEntity,
                                                V extends ResourceVm, ID>
        implements EntityCrudService<E, V, ID> {

    protected final VmMapper<E, V> mapper;
    protected final JpaRepository<E, ID> repository;

    @Transactional
    public V saveOrUpdate(V vm) {
        E entity = mapper.toEntity(vm);        // creates or loads-and-mutates on vm.id()
        assertNotStale(vm, entity);            // see below - @Version alone does not catch this
        beforeSave(entity, vm);
        return mapper.toVm(innerSave(entity, vm));
    }

    /**
     * The mapper loads the managed entity and mutates it, so Hibernate's @Version check compares
     * the freshly loaded version against the database - which always agrees inside one
     * transaction. That guards the load-to-flush window; it does NOT guard against a client
     * saving from a copy it read ten minutes ago. This does.
     */
    private void assertNotStale(V vm, E entity) {
        if (vm.id() != null && !Integer.valueOf(entity.getVersion()).equals(vm.version())) {
            throw new ObjectOptimisticLockingFailureException(entityName(), vm.id());
        }
    }

    @Transactional(readOnly = true)
    public V findById(ID id)                { return mapper.toVm(findEntityById(id)); }

    @Transactional(readOnly = true)
    public Page<V> findAll(Pageable p)      { return innerFindAll(p).map(mapper::toVm); }

    @Transactional
    public void delete(ID id)               { innerDelete(findEntityById(id)); }

    public Set<String> allowedSortFields()  { return mapper.allowedSortFields(); }

    // ---- override hooks (FR-010) -------------------------------------------
    protected void beforeSave(E entity, V vm) { }
    protected E    innerSave(E entity, V vm)  { return repository.save(entity); }
    protected Page<E> innerFindAll(Pageable p){ return repository.findAll(p); }

    /** Default: this record type is not deletable. Override to allow it (R1). */
    protected void innerDelete(E entity) {
        throw new DeletionNotSupportedException(getClass(), retirementHint());
    }
    protected String retirementHint() { return "This record type cannot be deleted."; }

    protected E findEntityById(ID id) {
        return repository.findById(id)
                .orElseThrow(() -> new RecordNotFoundException(entityName(), id));
    }
}
```

Mapping runs **inside** the transaction — `open-in-view` is false, so a mapper called from the
controller would throw on any lazy field (R4).

### Mapper — one per record type

```java
// service/convert/VmMapper.java
public interface VmMapper<E extends AuditableEntity, V extends ResourceVm> {
    E toEntity(V vm);              // create or load-and-mutate
    V toVm(E entity);              // populates every field; the view decides what is serialised
    Set<String> allowedSortFields();
}
```

`AbstractVmMapper` implements the create-vs-load dispatch on `vm.id() == null` and leaves three
hooks: `createInstance()`, `findById(ID)`, `applyToEntity(E, V)` — mirroring the reference's
`AbstractEntityVmConverter`, minus its `includeChildren` boolean.

`PersonVmMapper.allowedSortFields()` derives from `PersonFieldRegistry`, so the sort vocabulary and
the rule-condition vocabulary cannot drift (R9).

**One exception to "populate everything":** `caseLinks` and `CaseFileVm.linkedPersons` are child
collections that must never be loaded for a list. The mapper leaves them null and a `@JsonView`
would not save the query cost, so `AbstractEntityCrudService.findAll` calls `mapper.toVm` while the
detail path calls `mapper.toVmWithChildren` — the single place where the two depths diverge in code
rather than in annotation.

### What one record type costs

```java
@RestController
@RequestMapping("/api/v1/persons")
public class PersonController extends CrudController<Person, PersonVm, UUID> {
    PersonController(PersonCrudService service, RuleEngineProperties properties) {
        super(service, properties);
    }
}
```

Plus one `PersonVm` record, one `PersonVmMapper`, and a `PersonCrudService` overriding only what
differs. **No shared class changes** — which is SC-002.

---

## 2. The operations

| Operation | Method + path | Body | Success |
|---|---|---|---|
| Save (create or update) | `POST /api/v1/{resource}` | `<Type>Vm` | `201` + `Location` when `id` absent; `200` when present |
| Read one | `GET /api/v1/{resource}/{id}` | — | `200`, detail view |
| List a page | `GET /api/v1/{resource}?page&size&sort` | — | `200`, `PageResponse` of summary views |
| Delete | `DELETE /api/v1/{resource}/{id}` | — | `204`, or `405` where the type declines it |

There is deliberately **no** unpaged list operation. `GET /api/v1/{resource}` with no parameters is
the "list all" of FR-001, always bounded (R5).

### Resources

| Path | Record | `{id}` form | `DELETE` |
|---|---|---|---|
| `/api/v1/persons` | Person | UUID | `204` — soft delete; links hard-deleted with it |
| `/api/v1/person-cases` | PersonCase | `"<personUuid>:<caseUuid>"` | `204` — hard delete (unlink) |
| `/api/v1/cases` | CaseFile | UUID | `405` — close it: `POST` with `status: CLOSED` |
| `/api/v1/rules` | Rule | UUID | `405` — disable it: `POST` with `enabled: false` |

Deletion is an **optional** operation (R1). Cases and rules already carry their own retirement state
(`CaseStatus.CLOSED`, `Rule.enabled`); a second parallel "deleted" flag would give those tables two
notions of "not active" that can disagree. The `405` names the correct call.

---

## 3. Listing parameters

| Parameter | Default | Rule |
|---|---|---|
| `page` | `0` | Negative clamps to `0` |
| `size` | `rule-engine.default-page-size` (50) | Clamped to `[1, rule-engine.max-page-size]` (500) — silently, never rejected (FR-005) |
| `sort` | identity sort | `field` or `field,desc`. Unknown field ⇒ `400 INVALID_SORT_FIELD` |

The identity sort is appended on every request, so paging is totally ordered and consecutive pages
neither repeat nor skip rows (FR-006).

```json
{ "content": [ ... ], "page": 0, "size": 50, "totalElements": 1284, "totalPages": 26 }
```

`size` echoes the **effective** size after clamping, not what was asked for.

---

## 4. Payload envelope

| Field | On request | On response |
|---|---|---|
| `id` | Absent ⇒ create; present ⇒ update | Always present |
| `version` | Echo what you read; stale ⇒ `409`. Omitted deserialises to `0` — correct on create, safely stale on update | Always present |
| `type` | Ignored (`READ_ONLY`) | Discriminator (FR-014) |

Audit fields are `READ_ONLY` and `Vms.Detail` — emitted on single-record reads, ignored on every
write.

### Summary vs. detail

`Vms.Summary` is what list responses serialise; `Vms.Detail extends Vms.Summary` adds the rest.
`nationalId` is `Vms.Detail` only, so it is absent from `/persons` listings and from
`/rules/{id}/matches`.

**Honest limit of this mechanism**: the exclusion is enforced by serialisation, not by the type
system. Separate summary/detail records would make a leak unrepresentable; a view makes it
*one annotation*. That annotation is declared once on `CrudController.findAll`, inherited by every
resource, so the only way to leak is to add a new person-returning endpoint and omit the view —
which is why `/matches` and `/preview` carry it explicitly and are asserted in
`ResponseExposureTest`.

Detail responses embed children as a **first page plus a total count**, never a whole collection.

---

## 5. Errors

All errors use the existing `ErrorResponse` envelope: `{ "code", "message", "timestamp" }`.

| Status | Code | Cause |
|---|---|---|
| `400` | `VALIDATION_FAILED` | Bean-validation failure on the submitted VM |
| `400` | `INVALID_SORT_FIELD` | `sort` names a field the resource does not expose |
| `400` | `MALFORMED_REQUEST` | Unparseable body |
| `404` | `RECORD_NOT_FOUND` | No such id, or the person is soft-deleted |
| `405` | `DELETION_NOT_SUPPORTED` | `DELETE` on cases or rules; message names the alternative |
| `409` | `CONCURRENT_MODIFICATION` | Stale `version` — another client saved first |
| `409` | `CONSTRAINT_VIOLATION` | Uniqueness or FK violation (e.g. duplicate `nationalId`) |

A save whose `id` no longer resolves returns `404`, never a silent create under a new id.

Rule-specific errors (`UNKNOWN_FIELD`, `INCOMPATIBLE_OPERATOR`, `RULE_TREE_TOO_COMPLEX`,
`INVALID_RULE`, `RULE_STORAGE_ERROR`) are unchanged.

---

## 6. Rule-specific operations (preserved, FR-012)

Not part of the uniform contract; `RuleController` keeps them alongside the inherited four.

| Method + path | Purpose |
|---|---|
| `PUT /api/v1/rules/{ruleId}/condition` | Replace the condition tree, validated by compiling it |
| `GET /api/v1/rules/{ruleId}/matches?scope&page&size` | Evaluate a stored rule |
| `POST /api/v1/rules/preview?page&size` | Dry-run an unsaved tree |
| `GET /api/v1/rules/fields` | Queryable field list for the rule-builder UI |

`matches` and `preview` return `PageResponse<PersonVm>` annotated `@JsonView(Vms.Summary.class)` —
which is what replaces the hand-written `nationalId` exclusion in today's `PersonMatch`.

Write-time rule validation is preserved: the inherited save calls `RuleCrudService.beforeSave`,
which runs the existing `assertCompilable` check, so an unqueryable rule still cannot be persisted.
