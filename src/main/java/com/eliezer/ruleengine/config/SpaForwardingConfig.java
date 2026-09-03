package com.eliezer.ruleengine.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Forwards a client-side route to {@code /index.html} so a deep link survives a page reload
 * (research R3). This is hosting, not API capability — no endpoint, field, validation rule or
 * response shape changes.
 *
 * <p>The forward is deliberately <strong>not</strong> a catch-all. It excludes:
 * <ul>
 *   <li>any path beginning {@code /api/} — a catch-all would render an API {@code 404}
 *       ({@code RECORD_NOT_FOUND}) as an HTML page and defeat FR-039 for every not-found path;</li>
 *   <li>any path whose last segment names a file extension (e.g. {@code /assets/app.123.js},
 *       {@code /favicon.ico}) — those are real static resources and must 404 as themselves if
 *       missing rather than silently resolving to the SPA shell.</li>
 * </ul>
 *
 * <p>{@code quickstart.md} asserts both halves: {@code GET /rules/new} returns {@code 200}, and
 * {@code GET /api/v1/persons/<unknown>} returns a JSON {@code 404}.
 */
@Configuration
public class SpaForwardingConfig implements WebMvcConfigurer {

    @Override
    public void addViewControllers(@NonNull ViewControllerRegistry registry) {
        // Single-segment and multi-segment client routes that carry no file extension.
        registry.addViewController("/{path:^(?!api$)[^\\.]*}")
                .setViewName("forward:/index.html");
        registry.addViewController("/{path:^(?!api$)[^\\.]*}/{*rest}")
                .setViewName("forward:/index.html");
    }
}
