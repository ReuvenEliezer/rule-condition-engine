package com.eliezer.ruleengine.service.convert;

import com.eliezer.ruleengine.api.dto.CaseFileVm;
import com.eliezer.ruleengine.api.dto.PersonCaseVm;
import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.domain.PersonCaseId;
import com.eliezer.ruleengine.exception.RecordNotFoundException;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class PersonCaseVmMapper extends AbstractVmMapper<PersonCase, PersonCaseVm, PersonCaseId> {

    private static final Set<String> SORT_FIELDS = Set.of("role", "createdAt");

    private final PersonCaseRepository personCaseRepository;
    private final PersonRepository personRepository;
    private final CaseRepository caseRepository;

    public PersonCaseVmMapper(PersonCaseRepository personCaseRepository,
                              PersonRepository personRepository,
                              CaseRepository caseRepository) {
        this.personCaseRepository = personCaseRepository;
        this.personRepository = personRepository;
        this.caseRepository = caseRepository;
    }

    @Override
    protected PersonCase createInstance() {
        return PersonCase.builder().build();
    }

    @Override
    protected PersonCaseId parseId(Object rawId) {
        return rawId instanceof PersonCaseId id ? id : PersonCaseId.parse(rawId.toString());
    }

    @Override
    protected PersonCase loadForUpdate(PersonCaseId id) {
        return personCaseRepository.findById(id)
                .orElseThrow(() -> new RecordNotFoundException("person-case", id));
    }

    @Override
    protected void applyToEntity(PersonCase entity, PersonCaseVm vm) {
        if (entity.getId() == null) {
            Person person = personRepository.findById(vm.personId())
                    .orElseThrow(() -> new RecordNotFoundException("person", vm.personId()));
            CaseFile caseFile = caseRepository.findById(vm.caseId())
                    .orElseThrow(() -> new RecordNotFoundException("case", vm.caseId()));
            entity.setId(new PersonCaseId(vm.personId(), vm.caseId()));
            entity.setPerson(person);
            entity.setCaseFile(caseFile);
        }
        entity.setRole(vm.role());
    }

    @Override
    public PersonCaseVm toVm(PersonCase e) {
        return toVm(e, null, null);
    }

    @Override
    public PersonCaseVm toVmWithChildren(PersonCase e) {
        return toVm(e, personSummary(e.getPerson()), caseSummary(e.getCaseFile()));
    }

    private PersonCaseVm toVm(PersonCase e, PersonVm person, CaseFileVm caseFile) {
        return new PersonCaseVm(
                e.getId().toString(),
                e.getVersion(),
                PersonCaseVm.TYPE,
                e.getId().getPersonId(),
                e.getId().getCaseId(),
                e.getRole(),
                e.getCreatedAt(),
                person,
                caseFile,
                e.getCreatedBy(),
                e.getUpdatedAt(),
                e.getUpdatedBy());
    }

    private static PersonVm personSummary(Person p) {
        return new PersonVm(p.getId(), p.getVersion(), PersonVm.TYPE, p.getName(), p.getAge(),
                p.getCity(), p.getRisk(), null, null, null, null, null, null, null);
    }

    private static CaseFileVm caseSummary(CaseFile c) {
        return new CaseFileVm(c.getId(), c.getVersion(), CaseFileVm.TYPE, c.getTitle(), c.getStatus(),
                c.getCreatedAt(), null, null, null, null, null, null);
    }

    @Override
    public Set<String> allowedSortFields() {
        return SORT_FIELDS;
    }
}
