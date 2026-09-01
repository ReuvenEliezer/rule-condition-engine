package com.eliezer.ruleengine.service.convert;

import com.eliezer.ruleengine.api.dto.PersonCaseVm;
import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.exception.RecordNotFoundException;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.PersonRepository;
import com.eliezer.ruleengine.rule.compiler.FieldDescriptor;
import com.eliezer.ruleengine.rule.compiler.PersonFieldRegistry;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Component
public class PersonVmMapper extends AbstractVmMapper<Person, PersonVm, UUID> {

    /** First page of a person's links embedded in the detail response — never the whole relation. */
    private static final PageRequest FIRST_PAGE =
            PageRequest.of(0, 20, Sort.by("id.caseId"));

    private final PersonRepository personRepository;
    private final PersonCaseRepository personCaseRepository;
    private final Set<String> allowedSortFields;

    public PersonVmMapper(PersonRepository personRepository,
                          PersonCaseRepository personCaseRepository,
                          PersonFieldRegistry fieldRegistry) {
        this.personRepository = personRepository;
        this.personCaseRepository = personCaseRepository;
        // Derived from the rule-condition registry so the two vocabularies cannot drift (R9).
        Set<String> fields = new LinkedHashSet<>();
        fields.add("id");
        fieldRegistry.descriptors().values().stream()
                .filter(descriptor -> !descriptor.requiresJoin())
                .map(FieldDescriptor::attributePath)
                .forEach(fields::add);
        this.allowedSortFields = Set.copyOf(fields);
    }

    @Override
    protected Person createInstance() {
        return Person.builder().id(UUID.randomUUID()).build();
    }

    @Override
    protected UUID parseId(Object rawId) {
        return rawId instanceof UUID uuid ? uuid : UUID.fromString(rawId.toString());
    }

    @Override
    protected Person loadForUpdate(UUID id) {
        return personRepository.findById(id)
                .orElseThrow(() -> new RecordNotFoundException("person", id));
    }

    @Override
    protected void applyToEntity(Person entity, PersonVm vm) {
        entity.setName(vm.name());
        entity.setNationalId(vm.nationalId());
        entity.setAge(vm.age());
        entity.setCity(vm.city());
        entity.setRisk(vm.risk());
    }

    @Override
    public PersonVm toVm(Person e) {
        return toVm(e, null, null);
    }

    @Override
    public PersonVm toVmWithChildren(Person e) {
        List<PersonCaseVm> links = personCaseRepository.findByIdPersonId(e.getId(), FIRST_PAGE)
                .map(PersonVmMapper::linkSummary)
                .getContent();
        long total = personCaseRepository.countByIdPersonId(e.getId());
        return toVm(e, links, total);
    }

    private PersonVm toVm(Person e, List<PersonCaseVm> caseLinks, Long caseLinkCount) {
        return new PersonVm(
                e.getId(),
                e.getVersion(),
                PersonVm.TYPE,
                e.getName(),
                e.getAge(),
                e.getCity(),
                e.getRisk(),
                e.getNationalId(),
                caseLinks,
                caseLinkCount,
                e.getCreatedAt(),
                e.getCreatedBy(),
                e.getUpdatedAt(),
                e.getUpdatedBy());
    }

    private static PersonCaseVm linkSummary(PersonCase link) {
        return new PersonCaseVm(
                PersonCaseVm.idOf(link.getId().getPersonId(), link.getId().getCaseId()),
                link.getVersion(),
                PersonCaseVm.TYPE,
                link.getId().getPersonId(),
                link.getId().getCaseId(),
                link.getRole(),
                link.getCreatedAt(),
                null, null, null, null, null);
    }

    @Override
    public Set<String> allowedSortFields() {
        return allowedSortFields;
    }
}
