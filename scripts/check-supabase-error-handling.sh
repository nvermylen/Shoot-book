#!/usr/bin/env bash
# CI gate: detect Supabase mutation calls (.insert/.update/.delete/.upsert)
# where the result is awaited but { error } is not destructured.
#
# Catches:  await supabase.from('x').insert(...);        (no assignment)
#           const { data } = await supabase...insert     (error not destructured)
#
# Does NOT flag:
#           const { data, error } = await supabase...    (correct)
#           const { error } = await supabase...          (correct)
#           const result = await supabase...             (full result captured — caller's responsibility)
#
# Exit 0 = clean, Exit 1 = violations found.

set -euo pipefail

SEARCH_DIR="${1:-src}"
VIOLATIONS=0

# Pattern 1: bare await with no assignment (fire-and-forget mutation)
while IFS= read -r line; do
  if [ -n "$line" ]; then
    echo "  BARE AWAIT: $line"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(grep -rn --include='*.ts' --include='*.tsx' \
  -E '^\s*await\s+.*\.from\(.*\)\.(insert|update|delete|upsert)\(' "$SEARCH_DIR" 2>/dev/null || true)

# Pattern 2: destructured { data } without error (most common mistake)
while IFS= read -r line; do
  if [ -n "$line" ]; then
    echo "  MISSING error: $line"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done < <(grep -rn --include='*.ts' --include='*.tsx' \
  -E 'const\s+\{\s*data\s*\}\s*=\s*await\s+.*\.from\(.*\)\.(insert|update|delete|upsert|select)\(' "$SEARCH_DIR" 2>/dev/null || true)

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "Found $VIOLATIONS Supabase call(s) with unchecked { error }."
  echo "See ANTI_PATTERNS.md #37: always destructure { error } from Supabase mutations."
  exit 1
fi

echo "All Supabase mutations properly handle { error }. ✓"
exit 0
