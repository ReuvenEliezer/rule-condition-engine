package com.eliezer.ruleengine.service;

import com.eliezer.ruleengine.api.dto.PersonCaseVm;
import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.domain.PersonCaseId;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.service.convert.PersonCaseVmMapper;
import com.eliezer.ruleengine.service.crud.AbstractEntityCrudService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class PersonCaseCrudService extends AbstractEntityCrudService<PersonCase, PersonCaseVm, PersonCaseId> {

    private final PersonCaseRepository personCaseRepository;

    public PersonCaseCrudService(PersonCaseVmMapper mapper, PersonCaseRepository personCaseRepository) {
        super(mapper, personCaseRepository);
        this.personCaseRepository = personCaseRepository;
    }

    /**
     * The {@code id} is derived from {@code personId}+{@code caseId}, so validate rather than trust:
     * an {@code id} present and disagreeing with the pair is a 400; an absent {@code id} whose pair
     * already exists is a 409 {@code CONSTRAINT_VIOLATION}, not a silent update — {@code save()} on
     * an assigned key would otherwise {@code merge} into the existing row.
     */
    @Override
    protected void beforeSave(PersonCase entity, PersonCaseVm vm) {
        if (vm.id() != null) {
            PersonCaseId claimed = PersonCaseId.parse(vm.id().toString());
            if (!claimed.getPersonId().equals(vm.personId()) || !claimed.getCaseId().equals(vm.caseId())) {
                throw new IllegalArgumentException(
                        "id %s disagrees with personId/caseId (%s, %s)".formatted(vm.id(), vm.personId(), vm.caseId()));
            }
        } else if (personCaseRepository.existsById(new PersonCaseId(vm.personId(), vm.caseId()))) {
            throw new DataIntegrityViolationException(
                    "person %s is already linked to case %s".formatted(vm.personId(), vm.caseId()));
        }
    }

    /** Hard delete — an unlink (research R1). */
    @Override
    protected void innerDelete(PersonCase entity) {
        personCaseRepository.delete(entity);
    }

    @Override
    public Sort identitySort() {
        return Sort.by("id.personId").and(Sort.by("id.caseId"));
    }

    @Override
    protected String entityName() {
        return "person-case";
    }
}
