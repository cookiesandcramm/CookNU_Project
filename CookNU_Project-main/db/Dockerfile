# Postgres with the schema + seed baked in (no bind mount, so it also works when
# Jenkins runs inside a container and talks to the host's Docker socket).
FROM postgres:17-alpine
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
