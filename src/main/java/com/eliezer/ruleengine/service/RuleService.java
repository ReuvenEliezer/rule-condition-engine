package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.RuleVm;
import com.eliezer.ruleengine.domain.Rule;
import com.eliezer.ruleengine.exception.RuleNotFoundException;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.compiler.RuleCompiler;
import com.eliezer.ruleengine.rule.model.RuleNode;
import com.eliezer.ruleengine.service.convert.RuleVmMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * The rule-specific operations that sit alongside the inherited CRUD contract: replacing a
 * condition tree, and the write-time compilability check that {@code RuleCrudService.beforeSave}
 * reuses. Save / find / page now live in {@code RuleCrudService}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RuleService {

    private final RuleRepository ruleRepository;
    private final PersonRepository personRepository;
    private final PersonFieldRegistry personFieldRegistry;
    private final RuleCompiler ruleCompiler;
    private final RuleVmMapper ruleVmMapper;

    @Transactional
    public RuleVm updateCondition(UUID ruleId, RuleNode condition) {
        Rule rule = ruleRepository.findWithCaseById(ruleId)
                .orElseThrow(() -> new RuleNotFoundException(ruleId));

        assertCompilable(condition);
        rule.setConditionTree(condition);
        return ruleVmMapper.toVm(rule);
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
    public void assertCompilable(RuleNode condition) {
        long matches = personRepository.count(ruleCompiler.compile(personFieldRegistry, condition));
        log.info("Rule condition compiled successfully; current match count: {}", matches);
    }
}
