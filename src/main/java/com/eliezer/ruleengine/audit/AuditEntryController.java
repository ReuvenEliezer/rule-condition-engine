package com.eliezer.ruleengine.audit;

import com.eliezer.ruleengine.api.dto.PageResponse;
import com.eliezer.ruleengine.exception.SortFieldNotAllowedException;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.function.Function;

/**
 * Read-only, paged access to the audit trail (FR-029). <strong>Not</strong> a {@code CrudController}:
 * audit entries are derived history, not a managed record type, so the uniform save/delete contract
 * does not apply — forcing it would mean two operations that exist only to be refused.
 *
 * <p>Same page-size clamping as {@code CrudController}; default sort {@code occurred_at DESC, id DESC},
 * both keys so the listing is totally ordered (constitution Principle I).
 */
@RestController
@RequestMapping("/api/v1/audit-entries")
public class AuditEntryController {

    private static final Set<String> SORT_FIELDS = Set.of("occurredAt", "recordType", "operation");
    private static final Sort DEFAULT_SORT =
            Sort.by(Sort.Direction.DESC, "occurredAt").and(Sort.by(Sort.Direction.DESC, "id"));

    private final AuditEntryRepository repository;
    private final RuleEngineProperties properties;

    public AuditEntryController(AuditEntryRepository repository, RuleEngineProperties properties) {
        this.repository = repository;
        this.properties = properties;
    }

    @GetMapping
    public PageResponse<AuditEntryVm> list(@RequestParam(required = false) String recordType,
                                           @RequestParam(required = false) String recordId,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(required = false) Integer size,
                                           @RequestParam(required = false) String sort) {
        Pageable pageable = pageable(page, size, sort);
        Page<AuditEntry> result;
        if (recordType != null && recordId != null) {
            result = repository.findByRecordTypeAndRecordId(recordType, recordId, pageable);
        } else if (recordType != null) {
            result = repository.findByRecordType(recordType, pageable);
        } else {
            result = repository.findAll(pageable);
        }
        return PageResponse.from(result.map(AuditEntryVm::from), Function.identity());
    }

    private Pageable pageable(int page, Integer size, String sort) {
        int effective = size == null
                ? properties.defaultPageSize()
                : Math.clamp(size, 1, properties.maxPageSize());
        return PageRequest.of(Math.max(page, 0), effective, parseSort(sort));
    }

    private Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return DEFAULT_SORT;
        }
        String[] parts = sort.split(",", 2);
        String field = parts[0].trim();
        if (!SORT_FIELDS.contains(field)) {
            throw new SortFieldNotAllowedException(field, SORT_FIELDS);
        }
        boolean desc = parts.length > 1 && parts[1].trim().equalsIgnoreCase("desc");
        return Sort.by(desc ? Sort.Direction.DESC : Sort.Direction.ASC, field)
                .and(Sort.by(Sort.Direction.DESC, "id"));
    }
}
