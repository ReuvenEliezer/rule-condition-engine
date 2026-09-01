package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.dto.ErrorResponse;
import com.eliezer.ruleengine.exception.AuditRecordingException;
import com.eliezer.ruleengine.exception.DeletionNotSupportedException;
import com.eliezer.ruleengine.exception.IncompatibleOperatorException;
import com.eliezer.ruleengine.exception.MissingVersionException;
import com.eliezer.ruleengine.exception.RecordNotFoundException;
import com.eliezer.ruleengine.exception.RuleNotFoundException;
import com.eliezer.ruleengine.exception.RuleSerializationException;
import com.eliezer.ruleengine.exception.RuleTreeTooComplexException;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.exception.SortFieldNotAllowedException;
import com.eliezer.ruleengine.exception.UnknownFieldException;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Clock;

@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final Clock clock;

    @ExceptionHandler(RuleNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleNotFound(RuleNotFoundException e) {
        return ErrorResponse.of("RULE_NOT_FOUND", e.getMessage(), clock.instant());
    }

    @ExceptionHandler({RecordNotFoundException.class, EntityNotFoundException.class})
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleRecordNotFound(RuntimeException e) {
        return ErrorResponse.of("RECORD_NOT_FOUND", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(DeletionNotSupportedException.class)
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    public ErrorResponse handleDeletionNotSupported(DeletionNotSupportedException e) {
        return ErrorResponse.of("DELETION_NOT_SUPPORTED", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(SortFieldNotAllowedException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleSortField(SortFieldNotAllowedException e) {
        return ErrorResponse.of("INVALID_SORT_FIELD", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleIllegalArgument(IllegalArgumentException e) {
        return ErrorResponse.of("INVALID_ARGUMENT", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(MissingVersionException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleMissingVersion(MissingVersionException e) {
        return ErrorResponse.of("VERSION_REQUIRED", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse handleOptimisticLock(ObjectOptimisticLockingFailureException e) {
        return ErrorResponse.of("CONCURRENT_MODIFICATION",
                "The record was modified by another request; re-read it and retry", clock.instant());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse handleDataIntegrity(DataIntegrityViolationException e) {
        return ErrorResponse.of("CONSTRAINT_VIOLATION",
                "The request violates a uniqueness or referential constraint", clock.instant());
    }

    @ExceptionHandler(UnknownFieldException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleUnknownField(UnknownFieldException e) {
        return ErrorResponse.of("UNKNOWN_FIELD", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(IncompatibleOperatorException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleIncompatibleOperator(IncompatibleOperatorException e) {
        return ErrorResponse.of("INCOMPATIBLE_OPERATOR", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(RuleTreeTooComplexException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public ErrorResponse handleTooComplex(RuleTreeTooComplexException e) {
        return ErrorResponse.of("RULE_TREE_TOO_COMPLEX", e.getMessage(), clock.instant());
    }

    @ExceptionHandler(RuleValidationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleValidation(RuleValidationException e) {
        return ErrorResponse.of("INVALID_RULE", e.getMessage(), clock.instant());
    }

    /**
     * Jackson wraps constructor-thrown exceptions in {@code ValueInstantiationException}. Without
     * unwrapping, every compact-constructor rejection surfaces as an opaque 400 that tells the
     * rule author nothing about which node was wrong.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleUnreadable(HttpMessageNotReadableException e) {
        Throwable cause = rootCause(e);
        if (cause instanceof RuleValidationException validation) {
            return ErrorResponse.of("INVALID_RULE", validation.getMessage(), clock.instant());
        }
        for (Throwable t = e; t != null && t != t.getCause(); t = t.getCause()) {
            if (t instanceof tools.jackson.databind.exc.UnrecognizedPropertyException upe) {
                return ErrorResponse.of("VALIDATION_FAILED",
                        "unknown field '%s'; accepted: %s".formatted(upe.getPropertyName(), upe.getKnownPropertyIds()),
                        clock.instant());
            }
        }
        return ErrorResponse.of("MALFORMED_REQUEST", cause.getMessage(), clock.instant());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleBeanValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(error -> "%s %s".formatted(error.getField(), error.getDefaultMessage()))
                .reduce((a, b) -> a + "; " + b)
                .orElse("request validation failed");
        return ErrorResponse.of("VALIDATION_FAILED", detail, clock.instant());
    }

    @ExceptionHandler(AuditRecordingException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorResponse handleAuditFailure(AuditRecordingException e) {
        log.error("Audit entry could not be recorded; business change rolled back", e);
        return ErrorResponse.of("AUDIT_RECORDING_FAILED",
                "The change was rolled back because its audit entry could not be recorded", clock.instant());
    }

    @ExceptionHandler(RuleSerializationException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorResponse handleSerialization(RuleSerializationException e) {
        log.error("Stored rule tree could not be (de)serialized", e);
        return ErrorResponse.of("RULE_STORAGE_ERROR",
                "Stored rule could not be read", clock.instant());
    }

    private Throwable rootCause(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current;
    }
}
