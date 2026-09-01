package com.eliezer.ruleengine.service.convert;

import com.eliezer.ruleengine.api.dto.CaseFileVm;
import com.eliezer.ruleengine.api.dto.PersonVm;
import com.eliezer.ruleengine.domain.CaseFile;
import com.eliezer.ruleengine.domain.Person;
import com.eliezer.ruleengine.exception.RecordNotFoundException;
import com.eliezer.ruleengine.repository.CaseRepository;
import com.eliezer.ruleengine.repository.PersonCaseRepository;
import com.eliezer.ruleengine.repository.RuleRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Component
public class CaseFileVmMapper extends AbstractVmMapper<CaseFile, CaseFileVm, UUID> {

    /** {@code createdAt} is the JPA attribute; {@code @AttributeOverride} maps it to {@code opened_at}. */
    private static final Set<String> SORT_FIELDS = Set.of("id", "title", "status", "createdAt");
    private static final PageRequest FIRST_PAGE = PageRequest.of(0, 20, Sort.by("id.personId"));

    private final CaseRepository caseRepository;
    private final RuleRepository ruleRepository;
    private final PersonCaseRepository personCaseRepository;

    public CaseFileVmMapper(CaseRepository caseRepository,
                            RuleRepository ruleRepository,
                            PersonCaseRepository personCaseRepository) {
        this.caseRepository = caseRepository;
        this.ruleRepository = ruleRepository;
        this.personCaseRepository = personCaseRepository;
    }

    @Override
    protected CaseFile createInstance() {
        return CaseFile.builder().id(UUID.randomUUID()).build();
    }

    @Override
    protected UUID parseId(Object rawId) {
        return rawId instanceof UUID uuid ? uuid : UUID.fromString(rawId.toString());
    }

    @Override
    protected CaseFile loadForUpdate(UUID id) {
        return caseRepository.findById(id)
                .orElseThrow(() -> new RecordNotFoundException("case", id));
    }

    @Override
    protected void applyToEntity(CaseFile entity, CaseFileVm vm) {
        entity.setTitle(vm.title());
        entity.setStatus(vm.status());
    }

    @Override
    public CaseFileVm toVm(CaseFile e) {
        return toVm(e, null, null, null);
    }

    @Override
    public CaseFileVm toVmWithChildren(CaseFile e) {
        List<PersonVm> linked = personCaseRepository.findByCaseFileId(e.getId(), FIRST_PAGE)
                .map(link -> personSummary(link.getPerson()))
                .getContent();
        long total = personCaseRepository.countByCaseFileId(e.getId());
        UUID ruleId = ruleRepository.findIdByCaseFileId(e.getId()).orElse(null);
        return toVm(e, ruleId, linked, total);
    }

    private CaseFileVm toVm(CaseFile e, UUID ruleId, List<PersonVm> linkedPersons, Long linkedPersonCount) {
        return new CaseFileVm(
                e.getId(),
                e.getVersion(),
                CaseFileVm.TYPE,
                e.getTitle(),
                e.getStatus(),
                e.getCreatedAt(),
                ruleId,
                linkedPersons,
                linkedPersonCount,
                e.getCreatedBy(),
                e.getUpdatedAt(),
                e.getUpdatedBy());
    }

    private static PersonVm personSummary(Person p) {
        return new PersonVm(p.getId(), p.getVersion(), PersonVm.TYPE, p.getName(), p.getAge(),
                p.getCity(), p.getRisk(), null, null, null, null, null, null, null);
    }

    @Override
    public Set<String> allowedSortFields() {
        return SORT_FIELDS;
    }
}
