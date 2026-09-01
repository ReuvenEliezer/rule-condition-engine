package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.crud.CrudController;
import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.rule.validation.RuleEngineProperties;
import com.eliezer.ruleengine.service.PersonCrudService;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/persons")
public class PersonController extends CrudController<Person, PersonVm, UUID> {

    public PersonController(PersonCrudService service, RuleEngineProperties properties) {
        super(service, properties);
    }
}
