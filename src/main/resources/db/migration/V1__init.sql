
CREATE TABLE person (
    id          UUID PRIMARY KEY,
    name        TEXT        NOT NULL,
    national_id TEXT        NOT NULL UNIQUE,
    age         INTEGER     NOT NULL CHECK (age >= 0 AND age < 150),
    city        TEXT,
    risk        TEXT        NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE case_file (
    id          UUID PRIMARY KEY,
    title       TEXT        NOT NULL,
    status      TEXT        NOT NULL CHECK (status IN ('OPEN','UNDER_REVIEW','CLOSED')),
    opened_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE person_case (
    person_id  UUID        NOT NULL REFERENCES person(id)    ON DELETE CASCADE,
    case_id    UUID        NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
    role       TEXT        NOT NULL CHECK (role IN ('SUBJECT','ASSOCIATE','WITNESS')),
    linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (person_id, case_id)
);

-- rule : case is 1:1 -> the FK lives on rule and is UNIQUE.
CREATE TABLE rule (
    id             UUID PRIMARY KEY,
    case_id        UUID        NOT NULL UNIQUE REFERENCES case_file(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
    condition_tree JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports the reverse lookup person -> cases used by CASE_SCOPED evaluation.
CREATE INDEX idx_person_case_case_id ON person_case (case_id);

-- CONTAINS compiles to LOWER(name) LIKE '%...%'. A btree index cannot serve a
-- leading-wildcard LIKE; pg_trgm GIN can.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_person_name_trgm ON person USING gin (LOWER(name) gin_trgm_ops);

CREATE INDEX idx_person_risk_age ON person (risk, age);
