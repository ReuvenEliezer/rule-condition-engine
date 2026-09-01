package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.domain.CaseStatus;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonView;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Bidirectional view model for {@code CaseFile}.
 *
 * <p>{@code openedAt} is the entity's inherited {@code createdAt} under its domain name; there is
 * deliberately no separate {@code createdAt} field, which would emit the same column value twice
 * under two names (data-model §1). {@code linkedPersons} is a first page and
 * {@code linkedPersonCount} its total.
 */
public record CaseFileVm(
        @JsonView(Vms.Summary.class) UUID id,
        @JsonView(Vms.Summary.class) Integer version,
        @JsonView(Vms.Summary.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String type,

        @JsonView(Vms.Summary.class) @NotBlank @Size(max = 200) String title,
        @JsonView(Vms.Summary.class) @NotNull CaseStatus status,
        @JsonView(Vms.Summary.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant openedAt,

        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) UUID ruleId,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) List<PersonVm> linkedPersons,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Long linkedPersonCount,

        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String createdBy,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant updatedAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String updatedBy
) implements ResourceVm {

    public static final String TYPE = "case";
}
