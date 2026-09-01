package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.crud.CrudController;
import com.eliezer.ruleengine.api.dto.PersonCaseVm;
import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.domain.PersonCaseId;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import com.eliezer.ruleengine.service.PersonCaseCrudService;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The composite {@code {id}} is {@code "<personUuid>:<caseUuid>"}, bound through the
 * {@code Converter<String, PersonCaseId>} registered in {@code WebConfig} — so this class inherits
 * {@code CrudController} with no path overrides (research R7).
 */
@RestController
@RequestMapping("/api/v1/person-cases")
public class PersonCaseController extends CrudController<PersonCase, PersonCaseVm, PersonCaseId> {

    public PersonCaseController(PersonCaseCrudService service, RuleEngineProperties properties) {
        super(service, properties);
    }
}
