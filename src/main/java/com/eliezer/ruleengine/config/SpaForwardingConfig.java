package com.eliezer.ruleengine.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.server.ResponseStatusException;

/**
 * Forwards a client-side route to {@code /index.html} so a deep link survives a page reload
 * (research R3). This is hosting, not API capability — no endpoint, field, validation rule or
 * response shape changes.
 *
 * <p>The forward is deliberately <strong>not</strong> a catch-all:
 * <ul>
 *   <li><strong>Extensions are excluded by the mapping.</strong> {@code {path:[^.]*}} only matches
 *       a final segment with no {@code .}, so a missing {@code /assets/app.123.js} falls through to
 *       the resource handler and {@code 404}s as itself rather than resolving to the SPA shell.</li>
 *   <li><strong>{@code /api/**} is excluded in code.</strong> A real API route is a more specific
 *       mapping and never reaches here; an <em>unknown</em> {@code /api/...} path would, so it is
 *       turned into a plain {@code 404} rather than served {@code index.html} — a catch-all forward
 *       would render every API not-found as HTML and defeat FR-039.</li>
 * </ul>
 *
 * <p>{@code quickstart.md} asserts both halves: {@code GET /rules/new} returns {@code 200}, and
 * {@code GET /api/v1/persons/<unknown>} returns a JSON {@code 404}.
 */
@Controller
public class SpaForwardingConfig {

    @GetMapping(value = {"/{path:[^.]*}", "/**/{path:[^.]*}"})
    public String forwardClientRoute(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (path.equals("/api") || path.startsWith("/api/")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return "forward:/index.html";
    }
}
