package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.RuleVm;
import com.eliezer.ruleengine.domain.Rule;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.repository.RuleRepository;
import com.eliezer.ruleengine.service.convert.RuleVmMapper;
import com.eliezer.ruleengine.service.crud.AbstractEntityCrudService;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class RuleCrudService extends AbstractEntityCrudService<Rule, RuleVm, UUID> {

    private final RuleRepository ruleRepository;
    private final RuleService ruleService;

    public RuleCrudService(RuleVmMapper mapper, RuleRepository ruleRepository, RuleService ruleService) {
        super(mapper, ruleRepository);
        this.ruleRepository = ruleRepository;
        this.ruleService = ruleService;
    }

    /**
     * Write-time rule validation, preserved from the old {@code RuleService.create} (FR-012): the
     * condition tree must compile all the way to SQL before the rule is persisted, and the
     * rule:case relation stays 1:1.
     */
    @Override
    protected void beforeSave(Rule entity, RuleVm vm) {
        if (vm.id() == null && ruleRepository.existsByCaseFileId(vm.caseId())) {
            throw new RuleValidationException(
                    "Case %s already has a rule — the rule:case relation is 1:1".formatted(vm.caseId()));
        }
        ruleService.assertCompilable(vm.condition());
    }

    @Override
    protected String retirementHint() {
        return "Rules are disabled, not deleted: POST /api/v1/rules with enabled=false";
    }

    @Override
    public Sort identitySort() {
        return Sort.by("id");
    }

    @Override
    protected String entityName() {
        return "rule";
    }
}
