package com.eliezer.ruleengine.api;

import com.eliezer.ruleengine.api.dto.ErrorResponse;
import com.eliezer.ruleengine.exception.IncompatibleOperatorException;
import com.eliezer.ruleengine.exception.RuleNotFoundException;
import com.eliezer.ruleengine.exception.RuleSerializationException;
import com.eliezer.ruleengine.exception.RuleTreeTooComplexException;
import com.eliezer.ruleengine.exception.RuleValidationException;
import com.eliezer.ruleengine.exception.UnknownFieldException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
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
