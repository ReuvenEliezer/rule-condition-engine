package com.eliezer.ruleengine.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ApplicationConfig {

    /** Injected everywhere time is read, so tests can advance it without sleeping. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
