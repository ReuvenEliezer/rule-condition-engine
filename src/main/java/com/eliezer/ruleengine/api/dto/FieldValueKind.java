package com.eliezer.ruleengine.api.dto;

/**
 * The published abstraction over a {@code FieldDescriptor}'s {@code javaType} — deliberately
 * coarser than the Java type, because the only decision it drives in a rule builder is which
 * value control to render. {@code Integer} and {@code BigDecimal} are both {@link #NUMBER}.
 *
 * <p>The Java type itself is not published: it describes the persistence mapping, which is no
 * business of a caller (see {@code FieldMetadataVm}).
 */
public enum FieldValueKind {

    /** {@code String} — one text box; a list operator takes a multi-entry text list. */
    TEXT,

    /** Any {@code Number} — one numeric box; {@code BETWEEN} takes two bounds. */
    NUMBER,

    /** Any {@code Enum} — a closed choice over the published permitted values. */
    ENUM,

    /** {@code Instant} — one text box holding an ISO-8601 instant. */
    INSTANT
}
