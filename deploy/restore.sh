#!/bin/sh
# Restores a backup file into the running database. THIS REPLACES ALL CURRENT DATA.
# Usage (on the server, in the project folder):   sh deploy/restore.sh backups/phoenix-YYYYMMDD-HHMMSS.sql.gz
set -eu
FILE="${1:?Give the backup file path}"
[ -f "$FILE" ] || { echo "File not found: $FILE"; exit 1; }
printf 'This will REPLACE the current database with %s. Type YES to continue: ' "$FILE"
read -r ANSWER
[ "$ANSWER" = "YES" ] || { echo "Cancelled."; exit 1; }
. ./.env
docker compose stop web worker
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"
gunzip -c "$FILE" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null
docker compose start web worker
echo "Restore finished."
