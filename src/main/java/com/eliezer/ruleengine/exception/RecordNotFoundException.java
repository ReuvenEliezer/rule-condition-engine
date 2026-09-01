package com.eliezer.ruleengine.exception;

/**
 * No managed record of the given type resolves the given identifier — including a person that has
 * been soft-deleted. Mapped to {@code 404 RECORD_NOT_FOUND}.
 */
public class RecordNotFoundException extends RuntimeException {

    private final String entityName;
    private final transient Object identifier;

    public RecordNotFoundException(String entityName, Object identifier) {
        super("%s %s not found".formatted(entityName, identifier));
        this.entityName = entityName;
        this.identifier = identifier;
    }

    public String getEntityName() {
        return entityName;
    }

    public Object getIdentifier() {
        return identifier;
    }
}
