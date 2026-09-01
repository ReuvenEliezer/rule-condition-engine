package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.domain.RiskLevel;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonView;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Bidirectional view model for {@code Person}. One record, both directions (research R2).
 *
 * <p>Depth is a Jackson view: {@link Vms.Summary} fields appear on list responses,
 * {@link Vms.Detail} fields only on single-record reads — so {@code nationalId} is never in a
 * listing or a rule-match result (FR-017). System-owned fields carry
 * {@code @JsonProperty(access = READ_ONLY)}: emitted on reads, dropped on writes, so a client
 * cannot forge them (FR-023).
 *
 * <p>{@code caseLinks} is a first page and {@code caseLinkCount} its total — a detail response
 * never returns a whole unbounded relation (constitution Principle I).
 */
public record PersonVm(
        @JsonView(Vms.Summary.class) UUID id,
        @JsonView(Vms.Summary.class) Integer version,
        @JsonView(Vms.Summary.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String type,

        @JsonView(Vms.Summary.class) @NotBlank @Size(max = 200) String name,
        @JsonView(Vms.Summary.class) @NotNull @Min(0) @Max(149) Integer age,
        @JsonView(Vms.Summary.class) String city,
        @JsonView(Vms.Summary.class) @NotNull RiskLevel risk,

        @JsonView(Vms.Detail.class) @NotBlank String nationalId,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) List<PersonCaseVm> caseLinks,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Long caseLinkCount,

        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant createdAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String createdBy,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant updatedAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String updatedBy
) implements ResourceVm {

    public static final String TYPE = "person";
}
