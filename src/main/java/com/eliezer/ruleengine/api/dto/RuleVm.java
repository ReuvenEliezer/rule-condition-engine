package com.eliezer.ruleengine.api.dto;

import com.eliezer.ruleengine.rule.model.RuleNode;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonView;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/**
 * Bidirectional view model for {@code Rule}. Replaces {@code CreateRuleRequest} (every writable
 * field) and {@code RuleResponse} (every returned field) with one record: a null {@code id} means
 * create, a present one means update (FR-003).
 *
 * <p>{@code updatedAt} is detail-only, like every other resource's audit metadata — a summary that
 * leaked it would make {@code RuleVm} the one VM putting audit fields in list responses, against
 * FR-002/SC-001 (T048).
 */
public record RuleVm(
        @JsonView(Vms.Summary.class) UUID id,
        @JsonView(Vms.Summary.class) Integer version,
        @JsonView(Vms.Summary.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String type,

        @JsonView(Vms.Summary.class) @NotNull UUID caseId,
        @JsonView(Vms.Summary.class) @NotBlank @Size(max = 200) String name,
        @JsonView(Vms.Summary.class) boolean enabled,

        @JsonView(Vms.Detail.class) @NotNull RuleNode condition,

        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant createdAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String createdBy,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) Instant updatedAt,
        @JsonView(Vms.Detail.class) @JsonProperty(access = JsonProperty.Access.READ_ONLY) String updatedBy
) implements ResourceVm {

    public static final String TYPE = "rule";
}
