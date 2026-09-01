package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.service.convert.PersonVmMapper;
import com.eliezer.ruleengine.service.crud.AbstractEntityCrudService;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class PersonCrudService extends AbstractEntityCrudService<Person, PersonVm, UUID> {

    private final PersonRepository personRepository;
    private final PersonCaseRepository personCaseRepository;

    public PersonCrudService(PersonVmMapper mapper,
                             PersonRepository personRepository,
                             PersonCaseRepository personCaseRepository) {
        super(mapper, personRepository);
        this.personRepository = personRepository;
        this.personCaseRepository = personCaseRepository;
    }

    /**
     * Hard-delete the person's links, then soft-delete the person — in that order, one transaction.
     * {@code @SoftDelete} issues an {@code UPDATE}, not a {@code DELETE}, so {@code person_case}'s
     * {@code ON DELETE CASCADE} never fires; without this cleanup the links dangle against a parent
     * no query can see, and loading one throws {@code EntityNotFoundException}.
     */
    @Override
    protected void innerDelete(Person entity) {
        personCaseRepository.deleteByIdPersonId(entity.getId());
        personRepository.delete(entity);
    }

    @Override
    public Sort identitySort() {
        return Sort.by("id");
    }

    @Override
    protected String entityName() {
        return "person";
    }
}
