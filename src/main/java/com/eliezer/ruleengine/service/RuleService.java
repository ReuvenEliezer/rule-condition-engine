package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.CreateRuleRequest;
import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.Rule;
import com.eliezer.ruleengine.exception.RuleNotFoundException;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.compiler.RuleCompiler;
import com.eliezer.ruleengine.rule.model.RuleNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleService {

    private final RuleRepository ruleRepository;
    private final CaseRepository caseRepository;
    private final PersonRepository personRepository;
    private final PersonFieldRegistry personFieldRegistry;
    private final RuleCompiler ruleCompiler;
    private final Clock clock;

    /**
     * Persists a rule only after its tree compiles.
     *
     * <p>Validating at write time rather than read time is the important half: an unqueryable rule
     * that is only discovered when an analyst runs it produces an error at exactly the moment the
     * answer was needed, and there is no obvious owner to fix it.
     */
    @Transactional
    public Rule create(CreateRuleRequest request) {
        CaseFile caseFile = caseRepository.findById(request.caseId())
                .orElseThrow(() -> new RuleValidationException("Unknown case: " + request.caseId()));

        if (ruleRepository.existsByCaseFileId(request.caseId())) {
            throw new RuleValidationException(
                    "Case %s already has a rule — the rule:case relation is 1:1".formatted(request.caseId()));
        }

        assertCompilable(request.condition());

        Rule rule = Rule.builder()
                .id(UUID.randomUUID())
                .caseFile(caseFile)
                .name(request.name())
                .enabled(request.enabled())
                .conditionTree(request.condition())
                .updatedAt(clock.instant())
                .build();

        return ruleRepository.save(rule);
    }

    @Transactional
    public Rule updateCondition(UUID ruleId, RuleNode condition) {
        Rule rule = ruleRepository.findWithCaseById(ruleId)
                .orElseThrow(() -> new RuleNotFoundException(ruleId));

        assertCompilable(condition);
        rule.setConditionTree(condition);
        rule.setUpdatedAt(clock.instant());
        return rule;
    }

    @Transactional(readOnly = true)
    public Rule get(UUID ruleId) {
        return ruleRepository.findWithCaseById(ruleId)
                .orElseThrow(() -> new RuleNotFoundException(ruleId));
    }

    /**
     * Forces the tree all the way through to SQL.
     *
     * <p>A Specification is a lambda: constructing it runs no field resolution, no operator
     * compatibility check and no operand coercion — all of that lives inside {@code toPredicate},
     * which only fires when a query is actually built. Running a COUNT is the cheapest way to make
     * that happen, and it doubles as useful feedback (a brand-new rule matching zero or several
     * hundred thousand persons is usually an authoring mistake worth logging).
     */
    private void assertCompilable(RuleNode condition) {
        long matches = personRepository.count(ruleCompiler.compile(personFieldRegistry, condition));
        log.info("Rule condition compiled successfully; current match count: {}", matches);
    }
}
