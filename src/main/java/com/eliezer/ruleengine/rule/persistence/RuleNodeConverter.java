package com.eliezer.ruleengine.rule.persistence;

import com.eliezer.ruleengine.exception.RuleSerializationException;
import com.eliezer.ruleengine.rule.model.RuleNode;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * jsonb <-> AST bridge.
 *
 * <p>Registered as a Spring bean so Hibernate instantiates it through {@code SpringBeanContainer}
 * and it receives the application's configured {@link ObjectMapper}. Letting Hibernate serialize
 * the tree with its own internal mapper would work today but silently diverges the moment the
 * application mapper gains a module or a naming strategy — and a divergence here means rules
 * written by the API cannot be read back by the engine.
 */
@Component
@Converter
@RequiredArgsConstructor
public class RuleNodeConverter implements AttributeConverter<RuleNode, String> {

    private final ObjectMapper objectMapper;

    @Override
    public String convertToDatabaseColumn(RuleNode attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(attribute);
        } catch (JacksonException e) {
            throw new RuleSerializationException("Failed to serialize rule condition tree", e);
        }
    }

    @Override
    public RuleNode convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(dbData, RuleNode.class);
        } catch (JacksonException e) {
            throw new RuleSerializationException("Failed to deserialize stored rule condition tree", e);
        }
    }
}
