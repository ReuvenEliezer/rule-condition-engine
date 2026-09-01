package com.eliezer.ruleengine.repository;

import com.eliezer.ruleengine.domain.PersonCase;
import com.eliezer.ruleengine.domain.PersonCaseId;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

/**
 * Paginated access to the person:case relation, replacing the mapped collection that used to hang
 * off {@link com.eliezer.ruleengine.domain.CaseFile}. The link table is unbounded per case and per
 * person, so it is only ever read a page at a time.
 */
public interface PersonCaseRepository extends JpaRepository<PersonCase, PersonCaseId> {

    /**
     * A page of the persons linked to one case.
     *
     * <p>{@code person} is fetched with the page rather than lazily per row: whoever asks for a
     * page of links almost always needs the person behind each one, and without the graph that is
     * N+1 selects per page. The association is to-one, so the fetch join cannot multiply root rows
     * and the page size stays exact — the same fetch on a to-many would corrupt both.
     *
     * <p>Callers must pass a totally-ordering sort; {@code id.personId} is unique within a case.
     * LIMIT/OFFSET over an unordered result lets rows repeat or disappear between pages.
     */
    @EntityGraph(attributePaths = "person")
    Page<PersonCase> findByCaseFileId(UUID caseId, Pageable pageable);

    /** A page of the cases one person is linked to — backs {@code PersonVm}'s detail children. */
    Page<PersonCase> findByIdPersonId(UUID personId, Pageable pageable);

    long countByCaseFileId(UUID caseId);

    long countByIdPersonId(UUID personId);

    /**
     * Hard-deletes every link for a person in one statement. Called from
     * {@code PersonCrudService.innerDelete} before the person is soft-deleted: {@code @SoftDelete}
     * issues no {@code DELETE}, so {@code person_case}'s {@code ON DELETE CASCADE} never fires and
     * the links would otherwise dangle against an invisible parent.
     */
    @Modifying
    @Query("delete from PersonCase pc where pc.id.personId = :personId")
    void deleteByIdPersonId(@Param("personId") UUID personId);
}
