package com.eliezer.ruleengine.config;

import com.eliezer.ruleengine.audit.RequestAuditFilter;
import com.eliezer.ruleengine.domain.PersonCaseId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.domain.AuditorAware;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Binds the composite {@code person_case} key through the same {@code @PathVariable ID} path as
 * every other resource, so {@code PersonCaseController} inherits {@code CrudController} unchanged
 * (research R7). A {@code /{personId}/{caseId}} special case would leave the inherited single-id
 * mapping active and fail at startup with an ambiguous mapping.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addFormatters(@NonNull org.springframework.format.FormatterRegistry registry) {
        registry.addConverter(new PersonCaseIdConverter());
    }

    @Bean
    RequestAuditFilter requestAuditFilter(AuditorAware<String> auditorAware) {
        return new RequestAuditFilter(auditorAware);
    }

    /** Parses {@code "<personUuid>:<caseUuid>"}. */
    static final class PersonCaseIdConverter implements Converter<String, PersonCaseId> {

        @Override
        public PersonCaseId convert(@NonNull String source) {
            return PersonCaseId.parse(source);
        }
    }
}
