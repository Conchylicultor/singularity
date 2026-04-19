#!/usr/bin/env bash
# Backs up all Singularity databases (excludes claude-* worktree databases and system databases).
set -euo pipefail

BACKUP_DIR="${HOME}/.backups/singularity"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUT_DIR="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${OUT_DIR}"

DATABASES=$(psql -U "${USER}" -d postgres -t -A -c "
  SELECT datname FROM pg_database
  WHERE datname NOT IN ('template0', 'template1', 'postgres')
    AND datname NOT LIKE 'claude-%'
  ORDER BY datname;
")

if [[ -z "${DATABASES}" ]]; then
  echo "No databases to back up."
  exit 0
fi

echo "Backing up to ${OUT_DIR}"

for db in ${DATABASES}; do
  echo "  Dumping ${db}..."
  pg_dump -U "${USER}" -Fc "${db}" > "${OUT_DIR}/${db}.dump"
done

echo "Done. Files:"
ls -lh "${OUT_DIR}"
