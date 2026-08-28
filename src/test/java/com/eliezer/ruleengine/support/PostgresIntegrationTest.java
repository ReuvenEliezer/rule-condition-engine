package com.eliezer.ruleengine.support;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/**
 * Base for anything touching persistence. Real Postgres, not H2: this project depends on jsonb,
 * pg_trgm and Postgres' collation behaviour for LIKE — none of which H2 reproduces faithfully, and
 * all of which would let a broken query pass in CI and fail in production.
 */
@Tag("integration")
@Testcontainers
@SpringBootTest
@Import(PostgresIntegrationTest.ContainerConfig.class)
public abstract class PostgresIntegrationTest {

    @TestConfiguration(proxyBeanMethods = false)
    static class ContainerConfig {

        @Bean
        @ServiceConnection
        PostgreSQLContainer<?> postgres() {
            return new PostgreSQLContainer<>("postgres:18.4-alpine")
                    .withDatabaseName("ruleengine")
                    .withReuse(true);
        }
    }
}
