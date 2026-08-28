package com.eliezer.ruleengine.repository;

import com.eliezer.ruleengine.domain.Rule;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface RuleRepository extends JpaRepository<Rule, UUID> {

    @EntityGraph(attributePaths = "caseFile")
    Optional<Rule> findWithCaseById(UUID id);

    Optional<Rule> findByCaseFileId(UUID caseId);

    boolean existsByCaseFileId(UUID caseId);
}
