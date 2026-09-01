package com.eliezer.ruleengine.service.convert;

import com.eliezer.ruleengine.api.dto.RuleVm;
import com.eliezer.ruleengine.domain.Rule;
import com.eliezer.ruleengine.exception.RecordNotFoundException;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.UUID;

/**
 * Replaces the entity&harr;DTO mapping formerly inlined in {@code RuleService}
 * ({@code RuleResponse.from} and the {@code CreateRuleRequest} builder block).
 */
@Component
public class RuleVmMapper extends AbstractVmMapper<Rule, RuleVm, UUID> {

    private static final Set<String> SORT_FIELDS = Set.of("id", "name", "enabled", "createdAt", "updatedAt");

    private final RuleRepository ruleRepository;
    private final CaseRepository caseRepository;

    public RuleVmMapper(RuleRepository ruleRepository, CaseRepository caseRepository) {
        this.ruleRepository = ruleRepository;
        this.caseRepository = caseRepository;
    }

    @Override
    protected Rule createInstance() {
        return Rule.builder().id(UUID.randomUUID()).build();
    }

    @Override
    protected UUID parseId(Object rawId) {
        return rawId instanceof UUID uuid ? uuid : UUID.fromString(rawId.toString());
    }

    @Override
    protected Rule loadForUpdate(UUID id) {
        return ruleRepository.findWithCaseById(id)
                .orElseThrow(() -> new RecordNotFoundException("rule", id));
    }

    @Override
    protected void applyToEntity(Rule entity, RuleVm vm) {
        if (entity.getCaseFile() == null || !entity.getCaseFile().getId().equals(vm.caseId())) {
            entity.setCaseFile(caseRepository.findById(vm.caseId())
                    .orElseThrow(() -> new RuleValidationException("Unknown case: " + vm.caseId())));
        }
        entity.setName(vm.name());
        entity.setEnabled(vm.enabled());
        entity.setConditionTree(vm.condition());
    }

    @Override
    public RuleVm toVm(Rule e) {
        return new RuleVm(
                e.getId(),
                e.getVersion(),
                RuleVm.TYPE,
                e.getCaseFile().getId(),
                e.getName(),
                e.isEnabled(),
                e.getConditionTree(),
                e.getCreatedAt(),
                e.getCreatedBy(),
                e.getUpdatedAt(),
                e.getUpdatedBy());
    }

    @Override
    public Set<String> allowedSortFields() {
        return SORT_FIELDS;
    }
}
