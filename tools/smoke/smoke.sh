#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:5000}"
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-kamu-audit-smoke-db}"

echo "=== Kamu Web Audit smoke test (bash) ==="

step() {
  echo "-- $1"
}

step "Check Docker availability"
docker --version >/dev/null

step "Start Postgres 16 container (if not running)"
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER_NAME}\$"; then
  docker run -d --rm \
    --name "${POSTGRES_CONTAINER_NAME}" \
    -p 5432:5432 \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=kamu_audit_smoke \
    postgres:16 >/dev/null
else
  echo "Postgres container ${POSTGRES_CONTAINER_NAME} already running."
fi

echo "Waiting for Postgres to accept connections..."
sleep 15

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../backend/KamuAudit.Api" && pwd)"

step "Apply EF Core migrations"
(
  cd "${BACKEND_DIR}"
  export ConnectionStrings__Default="Host=localhost;Port=5432;Database=kamu_audit_smoke;Username=postgres;Password=postgres"
  dotnet ef database update
)

step "Start backend API"
(
  cd "${BACKEND_DIR}"
  export ConnectionStrings__Default="Host=localhost;Port=5432;Database=kamu_audit_smoke;Username=postgres;Password=postgres"
  export Jwt__Key="THIS_IS_A_LOCAL_SMOKE_TEST_KEY_WITH_MINIMUM_32_CHARS!"
  export Runner__WorkingDirectory="$(cd "${BACKEND_DIR}/../../runner" && pwd)"
  export Runner__NodePath="node"
  export Runner__CliScript="dist/cli.js"
  export Runner__MaxRunDurationMinutes="5"
  export RateLimiting__Enabled="false"

  dotnet run --urls "${API_URL}" > /tmp/kamu-audit-smoke-api.log 2>&1 &
  echo $! > /tmp/kamu-audit-smoke-api.pid
)

trap 'echo "Cleaning up..."; if [ -f /tmp/kamu-audit-smoke-api.pid ]; then kill $(cat /tmp/kamu-audit-smoke-api.pid) 2>/dev/null || true; fi; docker stop "${POSTGRES_CONTAINER_NAME}" >/dev/null 2>&1 || true' EXIT

echo "Waiting for /health/ready..."
READY=0
for i in $(seq 1 30); do
  if curl -sf "${API_URL}/health/ready" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [ "${READY}" -ne 1 ]; then
  echo "API did not become ready in time."
  exit 1
fi

step "Register user"
curl -sf -X POST "${API_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","password":"SmokeTest123!","role":"QA"}' >/dev/null

step "Login user"
LOGIN_JSON="$(curl -sf -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","password":"SmokeTest123!"}')"
TOKEN="$(echo "${LOGIN_JSON}" | jq -r '.token')"
if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "null" ]; then
  echo "Login response did not contain token."
  exit 1
fi

step "Create audit"
CREATE_JSON="$(curl -sf -X POST "${API_URL}/api/Audits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"targetUrl":"https://example.com","maxLinks":5}')"
AUDIT_ID="$(echo "${CREATE_JSON}" | jq -r '.id')"
if [ -z "${AUDIT_ID}" ] || [ "${AUDIT_ID}" = "null" ]; then
  echo "Create audit response did not contain id."
  exit 1
fi

step "Poll audit until terminal status"
TERMINAL=0
for i in $(seq 1 60); do
  AUDIT_JSON="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/Audits/${AUDIT_ID}")"
  STATUS="$(echo "${AUDIT_JSON}" | jq -r '.status')"
  echo "Current status: ${STATUS}"
  if [ "${STATUS}" = "completed" ] || [ "${STATUS}" = "failed" ]; then
    TERMINAL=1
    break
  fi
  sleep 2
done
if [ "${TERMINAL}" -ne 1 ]; then
  echo "Audit did not reach a terminal status in time."
  exit 1
fi

step "Fetch summary/findings/gaps"
SUMMARY_JSON="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/Audits/${AUDIT_ID}/summary")"
FINDINGS_JSON="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/Audits/${AUDIT_ID}/findings?page=1&pageSize=20")"
GAPS_JSON="$(curl -sf -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/Audits/${AUDIT_ID}/gaps?page=1&pageSize=20")"

echo "Summary: FindingsTotal=$(echo "${SUMMARY_JSON}" | jq -r '.FindingsTotal') GapsTotal=$(echo "${SUMMARY_JSON}" | jq -r '.GapsTotal')"

step "Verify /metrics contains key metrics"
METRICS="$(curl -sf "${API_URL}/metrics")"
for NAME in \
  audit_queue_depth \
  audit_running_count \
  audit_runs_completed_total \
  audit_runs_started_total \
  audit_runs_retries_total \
  audit_ingestion_failures_total \
  audit_runner_timeouts_total \
  audit_run_duration_ms_count \
  audit_run_duration_ms_sum; do
  if ! grep -q "${NAME}" <<< "${METRICS}"; then
    echo "Metric '${NAME}' not found in /metrics output."
    exit 1
  fi
done

echo "Smoke test completed successfully."
exit 0

