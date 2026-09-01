package com.eliezer.ruleengine.audit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.AuditorAware;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.AbstractRequestLoggingFilter;

import java.io.IOException;

/**
 * One structured log line per inbound HTTP call: method, path, status, elapsed millis, actor.
 *
 * <p>{@code setIncludeHeaders(false)} and {@code setIncludePayload(false)} so FR-025 holds
 * <em>structurally</em>, not by redaction rules: no {@code Authorization} header value and no
 * request body containing a {@code nationalId} can reach the log at all. The request log stays in
 * the log stream — one row per HTTP call is a different volume and retention problem from one row
 * per business change, which is {@link AuditEntry}.
 */
@Slf4j
public class RequestAuditFilter extends AbstractRequestLoggingFilter {

    private final AuditorAware<String> auditorAware;

    public RequestAuditFilter(AuditorAware<String> auditorAware) {
        this.auditorAware = auditorAware;
        setIncludeHeaders(false);
        setIncludePayload(false);
        setIncludeQueryString(false);
        setIncludeClientInfo(false);
    }

    @Override
    protected void beforeRequest(@NonNull HttpServletRequest request, @NonNull String message) {
        // Nothing before the request — the useful line needs the status and elapsed time.
    }

    @Override
    protected void afterRequest(@NonNull HttpServletRequest request, @NonNull String message) {
        // Superseded by the structured line emitted in doFilterInternal.
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            log.info("request method={} path={} status={} elapsedMs={} actor={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    elapsedMs,
                    auditorAware.getCurrentAuditor().orElse("system"));
        }
    }
}
