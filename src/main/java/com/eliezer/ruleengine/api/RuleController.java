package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.dto.CreateRuleRequest;
import com.eliezer.ruleengine.api.dto.MatchScope;
import com.eliezer.ruleengine.api.dto.PageResponse;
import com.eliezer.ruleengine.api.dto.PersonMatch;
import com.eliezer.ruleengine.api.dto.PreviewRequest;
import com.eliezer.ruleengine.api.dto.RuleResponse;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.compiler.RuleCompiler;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import com.eliezer.ruleengine.service.RuleEvaluationService;
import com.eliezer.ruleengine.service.RuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rules")
@RequiredArgsConstructor
public class RuleController {

    private final RuleService ruleService;
    private final RuleEvaluationService evaluationService;
    private final RuleCompiler ruleCompiler;
    private final PersonFieldRegistry personFieldRegistry;
    private final RuleEngineProperties properties;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RuleResponse create(@Valid @RequestBody CreateRuleRequest request) {
        return RuleResponse.from(ruleService.create(request));
    }

    @GetMapping("/{ruleId}")
    public RuleResponse get(@PathVariable UUID ruleId) {
        return RuleResponse.from(ruleService.get(ruleId));
    }

    @PutMapping("/{ruleId}/condition")
    public RuleResponse updateCondition(@PathVariable UUID ruleId,
                                        @Valid @RequestBody PreviewRequest request) {
        return RuleResponse.from(ruleService.updateCondition(ruleId, request.condition()));
    }

    @GetMapping("/{ruleId}/matches")
    public PageResponse<PersonMatch> matches(@PathVariable UUID ruleId,
                                             @RequestParam(defaultValue = "GLOBAL") MatchScope scope,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(required = false) Integer size) {
        return PageResponse.from(
                evaluationService.evaluate(ruleId, scope, pageable(page, size)),
                PersonMatch::from);
    }

    /** Dry-run an unsaved tree. */
    @PostMapping("/preview")
    public PageResponse<PersonMatch> preview(@Valid @RequestBody PreviewRequest request,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(required = false) Integer size) {
        return PageResponse.from(
                evaluationService.preview(request.condition(), pageable(page, size)),
                PersonMatch::from);
    }

    /** Drives the field dropdown in a rule-builder UI. */
    @GetMapping("/fields")
    public List<String> queryableFields() {
        return ruleCompiler.queryableFields(personFieldRegistry);
    }

    /**
     * Page size is clamped server-side. Trusting a client-supplied size lets one request ask for
     * the entire population in a single round trip.
     */
    private Pageable pageable(int page, Integer size) {
        int effective = size == null
                ? properties.defaultPageSize()
                : Math.clamp(size, 1, properties.maxPageSize());
        return PageRequest.of(Math.max(page, 0), effective, Sort.by("id"));
    }
}
