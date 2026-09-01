package com.eliezer.ruleengine.exception;

/**
 * {@code DELETE} was called on a record type that is retired through state it already carries
 * (a case is closed, a rule is disabled) rather than deleted. Mapped to
 * {@code 405 DELETION_NOT_SUPPORTED}; the message names the correct call, so the 405 is
 * self-documenting.
 */
public class DeletionNotSupportedException extends RuntimeException {

    public DeletionNotSupportedException(String retirementHint) {
        super(retirementHint);
    }
}
