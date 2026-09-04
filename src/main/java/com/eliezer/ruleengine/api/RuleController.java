package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.crud.CrudController;
import com.eliezer.ruleengine.api.dto.FieldMetadataVm;
import com.eliezer.ruleengine.api.dto.MatchScope;
import com.eliezer.ruleengine.api.dto.PageResponse;
import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.api.dto.PreviewRequest;
import com.eliezer.ruleengine.api.dto.RuleVm;
import com.eliezer.ruleengine.api.dto.Vms;
import com.eliezer.ruleengine.domain.Rule;
import com.fasterxml.jackson.annotation.JsonView;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.compiler.RuleCompiler;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import com.eliezer.ruleengine.service.FieldMetadataService;
import com.eliezer.ruleengine.service.RuleCrudService;
import com.eliezer.ruleengine.service.RuleEvaluationService;
import com.eliezer.ruleengine.service.RuleService;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * The four inherited CRUD operations (from {@link CrudController}) plus the rule-specific
 * operations that are not part of the uniform contract (FR-012): condition replacement, evaluation,
 * dry-run preview, and the queryable-field list.
 */
@RestController
@RequestMapping("/api/v1/rules")
public class RuleController extends CrudController<Rule, RuleVm, UUID> {

    private final RuleService ruleService;
    private final RuleEvaluationService evaluationService;
    private final RuleCompiler ruleCompiler;
    private final PersonFieldRegistry personFieldRegistry;
    private final FieldMetadataService fieldMetadataService;
    private final RuleEngineProperties properties;

    public RuleController(RuleCrudService crudService,
                          RuleService ruleService,
                          RuleEvaluationService evaluationService,
                          RuleCompiler ruleCompiler,
                          PersonFieldRegistry personFieldRegistry,
                          FieldMetadataService fieldMetadataService,
                          RuleEngineProperties properties) {
        super(crudService, properties);
        this.ruleService = ruleService;
        this.evaluationService = evaluationService;
        this.ruleCompiler = ruleCompiler;
        this.personFieldRegistry = personFieldRegistry;
        this.fieldMetadataService = fieldMetadataService;
        this.properties = properties;
    }

    @PutMapping("/{ruleId}/condition")
    public RuleVm updateCondition(@PathVariable UUID ruleId,
                                  @Valid @RequestBody PreviewRequest request) {
        return ruleService.updateCondition(ruleId, request.condition());
    }

    @GetMapping("/{ruleId}/matches")
    @JsonView(Vms.Summary.class)
    public PageResponse<PersonVm> matches(@PathVariable UUID ruleId,
                                          @RequestParam(defaultValue = "GLOBAL") MatchScope scope,
                                          @RequestParam(defaultValue = "0") int page,
                                          @RequestParam(required = false) Integer size) {
        return PageResponse.from(
                evaluationService.evaluate(ruleId, scope, pageable(page, size)),
                java.util.function.Function.identity());
    }

    /** Dry-run an unsaved tree. */
    @PostMapping("/preview")
    @JsonView(Vms.Summary.class)
    public PageResponse<PersonVm> preview(@Valid @RequestBody PreviewRequest request,
                                          @RequestParam(defaultValue = "0") int page,
                                          @RequestParam(required = false) Integer size) {
        return PageResponse.from(
                evaluationService.preview(request.condition(), pageable(page, size)),
                java.util.function.Function.identity());
    }

    /**
     * Sorted logical names only. Superseded as a rule builder's source by
     * {@link #fieldMetadata()}, and left unchanged for the callers it already has.
     */
    @GetMapping("/fields")
    public List<String> queryableFields() {
        return ruleCompiler.queryableFields(personFieldRegistry);
    }

    /**
     * Everything a rule builder needs to offer safe choices: each queryable field's label, type,
     * effective operator set and — when enumerated — its permitted values.
     *
     * <p>Unpaged, and deliberately so: the body is bounded by the registry, a compile-time
     * constant, not by a query result, and no database is touched. That is the narrow carve-out
     * the constitution's Principle I names for this endpoint and for {@code GET /fields}.
     */
    @GetMapping("/fields/metadata")
    public List<FieldMetadataVm> fieldMetadata() {
        return fieldMetadataService.publishedFields();
    }

    /**
     * Local clamping for the two person-returning endpoints outside the inherited contract. The
     * CRUD list endpoint's clamping lives in {@link CrudController}.
     */
    private Pageable pageable(int page, Integer size) {
        int effective = size == null
                ? properties.defaultPageSize()
                : Math.clamp(size, 1, properties.maxPageSize());
        return PageRequest.of(Math.max(page, 0), effective, Sort.by("id"));
    }
}
