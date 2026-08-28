package com.eliezer.ruleengine.api.dto;

/**
 * Resolves the ambiguity in "run this rule": a rule hangs off exactly one case, but that does not
 * say whether the case bounds the search or merely owns the rule. Both are legitimate and they
 * answer different questions, so the caller states which one it wants rather than the engine
 * guessing.
 */
public enum MatchScope {

    /** Search the whole population. "Who out there looks like this?" — discovery. */
    GLOBAL,

    /** Search only persons already linked to the rule's case. "Which of my subjects match?" — triage. */
    CASE_SCOPED
}
