package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.MatchScope;
import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.Rule;
import com.eliezer.ruleengine.exception.RuleNotFoundException;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import com.eliezer.ruleengine.rule.compiler.RuleCompiler;
import com.eliezer.ruleengine.rule.model.RuleNode;
import com.eliezer.ruleengine.service.convert.PersonVmMapper;
import jakarta.persistence.criteria.Join;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class RuleEvaluationService {

    private final RuleRepository ruleRepository;
    private final PersonRepository personRepository;
    private final PersonFieldRegistry personFieldRegistry;
    private final RuleCompiler ruleCompiler;
    private final PersonVmMapper personVmMapper;

    /**
     * Evaluates a stored rule.
     *
     * <p>Pagination is pushed to the database rather than applied to a materialised list: an
     * intelligence rule can legitimately match a large slice of the population, and the caller
     * usually wants the count plus a first page, not the whole set.
     */
    @Transactional(readOnly = true)
    public Page<PersonVm> evaluate(UUID ruleId, MatchScope scope, Pageable pageable) {
        Rule rule = ruleRepository.findWithCaseById(ruleId)
                .orElseThrow(() -> new RuleNotFoundException(ruleId));

        Specification<Person> spec = specificationFor(
                rule.getConditionTree(), scope, rule.getCaseFile().getId());

        Page<Person> matches = personRepository.findAll(spec, pageable);
        log.debug("Rule {} ({}) matched {} persons", ruleId, scope, matches.getTotalElements());
        return matches.map(personVmMapper::toVm);
    }

    /** Evaluates an unsaved tree — the rule-builder dry run. */
    @Transactional(readOnly = true)
    public Page<PersonVm> preview(RuleNode condition, Pageable pageable) {
        return personRepository.findAll(ruleCompiler.compile(personFieldRegistry, condition), pageable)
                .map(personVmMapper::toVm);
    }

    private Specification<Person> specificationFor(RuleNode condition, MatchScope scope, UUID caseId) {
        Specification<Person> compiled = ruleCompiler.compile(personFieldRegistry, condition);
        return switch (scope) {
            case GLOBAL -> compiled;
            case CASE_SCOPED -> compiled.and(linkedToCase(caseId));
        };
    }

    /**
     * Restricts to persons already attached to the case.
     *
     * <p>An EXISTS subquery would avoid the DISTINCT that this join forces. A plain join is used
     * here because the compiler may already have joined {@code caseLinks} for a {@code case.*}
     * field, and duplicating that association with a second, independent join changes the meaning
     * of the predicate. If {@code case.*} fields are ever removed from the registry, switch this
     * to EXISTS and drop the DISTINCT.
     */
    private Specification<Person> linkedToCase(UUID caseId) {
        return (root, query, cb) -> {
            if (query != null) {
                query.distinct(true);
            }
            Join<Object, Object> link = root.join("caseLinks");
            return cb.equal(link.get("caseFile").get("id"), caseId);
        };
    }
}
