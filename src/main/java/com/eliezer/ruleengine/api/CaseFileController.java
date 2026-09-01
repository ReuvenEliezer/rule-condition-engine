package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.crud.CrudController;
import com.eliezer.ruleengine.api.dto.CaseFileVm;
import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import com.eliezer.ruleengine.service.CaseFileCrudService;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cases")
public class CaseFileController extends CrudController<CaseFile, CaseFileVm, UUID> {

    public CaseFileController(CaseFileCrudService service, RuleEngineProperties properties) {
        super(service, properties);
    }
}
