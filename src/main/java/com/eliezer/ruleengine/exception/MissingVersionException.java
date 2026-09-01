package com.eliezer.ruleengine.exception;

/**
 * An update (a save carrying an {@code id}) arrived with no {@code version} token. The version is
 * how the server proves the client is editing the row it last read; its absence is rejected with
 * {@code 400 VERSION_REQUIRED} rather than treated as an implicit match (research R9).
 */
public class MissingVersionException extends RuntimeException {

    public MissingVersionException(String entityName, Object identifier) {
        super("A version is required to update %s %s".formatted(entityName, identifier));
    }
}
