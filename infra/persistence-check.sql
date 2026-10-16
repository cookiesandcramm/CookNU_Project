CREATE TABLE IF NOT EXISTS persistence_check (
    id serial PRIMARY KEY,
    note text,
    created_at timestamptz DEFAULT now()
);

INSERT INTO persistence_check (note) VALUES ('survives normal container recreation');