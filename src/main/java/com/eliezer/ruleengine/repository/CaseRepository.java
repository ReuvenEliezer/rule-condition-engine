package com.eliezer.ruleengine.repository;

import com.eliezer.ruleengine.domain.CaseFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface CaseRepository extends JpaRepository<CaseFile, UUID> {
}
