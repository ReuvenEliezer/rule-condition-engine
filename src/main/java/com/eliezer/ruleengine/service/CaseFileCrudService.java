package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.CaseFileVm;
import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.service.convert.CaseFileVmMapper;
import com.eliezer.ruleengine.service.crud.AbstractEntityCrudService;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class CaseFileCrudService extends AbstractEntityCrudService<CaseFile, CaseFileVm, UUID> {

    public CaseFileCrudService(CaseFileVmMapper mapper, CaseRepository caseRepository) {
        super(mapper, caseRepository);
    }

    /** Cases are retired by status, not deleted — {@code innerDelete} inherits the throw. */
    @Override
    protected String retirementHint() {
        return "Cases are closed, not deleted: POST /api/v1/cases with status=CLOSED";
    }

    @Override
    public Sort identitySort() {
        return Sort.by("id");
    }

    @Override
    protected String entityName() {
        return "case";
    }
}
