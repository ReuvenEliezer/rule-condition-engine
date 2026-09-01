package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.domain.PersonRole;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonView;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

/**
 * Bidirectional view model for the {@code PersonCase} link.
 *
 * <p>{@code id} is the composite key rendered as {@code "<personUuid>:<caseUuid>"} and is
 * <em>derived</em> from {@code personId}+{@code caseId}: an {@code id} present and disagreeing with
 * the pair is a 400, an absent {@code id} whose pair already exists is a 409 {@code CONSTRAINT_VIOLATION}
 * rather than a silent update (see {@code PersonCaseCrudService}). {@code linkedAt} is the inherited
 * {@code createdAt} under its domain name.
 */
public record PersonCaseVm(
        @JsonView(Vms.Summary.class) String id,
        @JsonView(Vms.Summary.class) Integer version,
        @JsonView(Vms.Summary.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String type,

        @JsonView(Vms.Summary.class) @NotNull UUID personId,
        @JsonView(Vms.Summary.class) @NotNull UUID caseId,
        @JsonView(Vms.Summary.class) @NotNull PersonRole role,
        @JsonView(Vms.Summary.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant linkedAt,

        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) PersonVm person,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) CaseFileVm caseFile,

        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String createdBy,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant updatedAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String updatedBy
) implements ResourceVm {

    public static final String TYPE = "person-case";

    /** {@code "<personUuid>:<caseUuid>"} from a pair. */
    public static String idOf(UUID personId, UUID caseId) {
        return personId + ":" + caseId;
    }
}
