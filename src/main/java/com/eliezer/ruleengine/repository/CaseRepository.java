package com.eliezer.ruleengine.repository;

import com.eliezer.ruleengine.domain.CaseFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.UUID;

public interface CaseRepository extends JpaRepository<CaseFile, UUID>, JpaSpecificationExecutor<CaseFile> {
}
