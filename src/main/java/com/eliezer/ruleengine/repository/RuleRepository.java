package com.eliezer.ruleengine.repository;

import com.eliezer.ruleengine.domain.Rule;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface RuleRepository extends JpaRepository<Rule, UUID> {

    @EntityGraph(attributePaths = "caseFile")
    Optional<Rule> findWithCaseById(UUID id);

    Optional<Rule> findByCaseFileId(UUID caseId);

    boolean existsByCaseFileId(UUID caseId);

    /** The rule's id for a case, as a scalar projection — resolves {@code CaseFileVm.ruleId} without loading the rule. */
    @Query("select r.id from Rule r where r.caseFile.id = :caseId")
    Optional<UUID> findIdByCaseFileId(UUID caseId);
}
