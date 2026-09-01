package com.eliezer.ruleengine.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface AuditEntryRepository extends JpaRepository<AuditEntry, UUID> {

    Page<AuditEntry> findByRecordTypeAndRecordId(String recordType, String recordId, Pageable pageable);

    Page<AuditEntry> findByRecordType(String recordType, Pageable pageable);
}
