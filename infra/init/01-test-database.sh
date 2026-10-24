#!/bin/sh
set -eu

# Executado pelo entrypoint oficial apenas em um volume novo.
# Nenhum schema, tabela ou dado funcional é criado.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=test_db="$POSTGRES_TEST_DB" <<'SQL'
SELECT format('CREATE DATABASE %I', :'test_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db')
\gexec
SQL
