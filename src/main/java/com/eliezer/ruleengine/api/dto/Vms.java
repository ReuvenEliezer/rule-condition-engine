package com.eliezer.ruleengine.api.dto;

/**
 * The two Jackson-view markers that split every VM into a compact list form and a fuller
 * single-record form. Declared once; applied once, on {@code CrudController} (FR-015).
 *
 * <p>{@code Detail extends Summary}, so a field tagged {@code @JsonView(Summary.class)} is
 * serialised in both forms and a field tagged {@code @JsonView(Detail.class)} in neither the list
 * nor a match response.
 */
public final class Vms {

    private Vms() {
    }

    /** Serialised on list responses (and, transitively, on single-record responses). */
    public interface Summary {
    }

    /** Serialised only on single-record responses. */
    public interface Detail extends Summary {
    }
}
