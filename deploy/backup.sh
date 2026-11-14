#!/bin/sh
# Daily compressed PostgreSQL backup. Runs inside the "backup" service.
# Files land in ./backups on the server; backups older than KEEP_DAYS are deleted.
set -eu
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="/backups/phoenix-${STAMP}.sql.gz"
pg_dump --no-owner --no-privileges | gzip > "${FILE}.tmp"
mv "${FILE}.tmp" "${FILE}"
find /backups -name 'phoenix-*.sql.gz' -mtime +"${KEEP_DAYS:-14}" -delete
echo "backup written: ${FILE}"
