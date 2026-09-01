-- Baseline schema.
--
-- This is the whole schema, not an increment: person, case_file, person_case and rule carry their
-- audit and versioning columns from the start, person carries its soft-delete marker, and
-- audit_entry exists alongside them. There is deliberately no V2/V3/V4 splitting those apart --
-- nothing has shipped, so there is no history to preserve and nothing to backfill.
--
-- No timestamp column carries a DDL default. Hibernate's @CreationTimestamp / @UpdateTimestamp own
-- created_at, updated_at, opened_at, linked_at and occurred_at; a `DEFAULT now()` alongside them
-- would be a second source of truth that disagrees on any insert made outside Hibernate
-- (constitution, Principle V). The defaults that remain are on non-timestamp columns whose value is
-- a genuine constant -- version, enabled and deleted -- so a hand-written INSERT from psql lands in
-- a valid state. created_by / updated_by deliberately have no default: an insert that does not
-- resolve an actor must fail loudly rather than record a blank one (FR-026).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE person (
    id          UUID PRIMARY KEY,
    name        TEXT        NOT NULL,
    national_id TEXT        NOT NULL,
    age         INTEGER     NOT NULL CHECK (age >= 0 AND age < 150),
    city        TEXT,
    risk        TEXT        NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    created_by  TEXT        NOT NULL,
    updated_by  TEXT        NOT NULL,
    version     INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE case_file (
    id         UUID PRIMARY KEY,
    title      TEXT        NOT NULL,
    status     TEXT        NOT NULL CHECK (status IN ('OPEN','UNDER_REVIEW','CLOSED')),
    opened_at  TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT        NOT NULL,
    updated_by TEXT        NOT NULL,
    version    INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE person_case (
    person_id  UUID        NOT NULL REFERENCES person(id)    ON DELETE CASCADE,
    case_id    UUID        NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL CHECK (role IN ('SUBJECT','ASSOCIATE','WITNESS')),
    linked_at  TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT        NOT NULL,
    updated_by TEXT        NOT NULL,
    version    INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (person_id, case_id)
);

-- rule : case is 1:1 -> the FK lives on rule and is UNIQUE.
CREATE TABLE rule (
    id             UUID PRIMARY KEY,
    case_id        UUID        NOT NULL UNIQUE REFERENCES case_file(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
    condition_tree JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL,
    created_by     TEXT        NOT NULL,
    updated_by     TEXT        NOT NULL,
    version        INTEGER     NOT NULL DEFAULT 0
);

-- One row per lifecycle change of a managed record. Insert-only and never itself audited, so it
-- carries no version / updated_at / updated_by. record_id is TEXT because person_case is keyed by
-- a pair and renders as "<personUuid>:<caseUuid>".
CREATE TABLE audit_entry (
    id             UUID PRIMARY KEY,
    record_type    TEXT        NOT NULL,
    record_id      TEXT        NOT NULL,
    operation      TEXT        NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
    actor          TEXT        NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL,
    entity_version INTEGER,
    changes        JSONB
);

-- national_id is unique among *live* persons only. A plain UNIQUE would let one soft-deleted row
-- permanently ban re-registering that national id, failing against a row the caller cannot see.
CREATE UNIQUE INDEX ux_person_national_id_active ON person (national_id) WHERE deleted = false;
CREATE INDEX idx_person_active ON person (id) WHERE deleted = false;

-- Supports the reverse lookup person -> cases used by CASE_SCOPED evaluation.
CREATE INDEX idx_person_case_case_id ON person_case (case_id);

-- CONTAINS compiles to LOWER(name) LIKE '%...%'. A btree index cannot serve a
-- leading-wildcard LIKE; pg_trgm GIN can.
CREATE INDEX idx_person_name_trgm ON person USING gin (LOWER(name) gin_trgm_ops);

CREATE INDEX idx_person_risk_age ON person (risk, age);

-- Both audit indexes end in id so a paged listing has a total ordering (constitution, Principle I).
CREATE INDEX idx_audit_entry_record ON audit_entry (record_type, record_id, occurred_at DESC, id DESC);
CREATE INDEX idx_audit_entry_recent ON audit_entry (occurred_at DESC, id DESC);
