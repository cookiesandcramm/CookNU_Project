#!/bin/sh
# End-to-end smoke test of the backend, through the reverse proxy.
#
# It exercises all three backend modules AND the real database:
#   register -> login -> create recipe -> list -> heart -> notification -> cleanup
# Test accounts are deleted at the end (even on failure), which also removes their
# recipes/hearts/notifications, so repeated pipeline runs leave no junk in the DB.
#
# Usage:  BASE_URL=http://localhost:8080 sh scripts/smoke-test.sh
# From inside the Jenkins container, BASE_URL is typically http://host.docker.internal:8080
set -eu

BASE_URL="${BASE_URL:-http://localhost:8080}"
STAMP="$(date +%s)-$$"
OWNER_EMAIL="smoke-owner-$STAMP@cooknu.example"
FAN_EMAIL="smoke-fan-$STAMP@cooknu.example"
PASSWORD='Smoke@12345'
OWNER_TOKEN=""
FAN_TOKEN=""

fail() { echo "SMOKE TEST FAILED: $1" >&2; exit 1; }
step() { echo "-> $1"; }

# Extract the first value of a JSON string field from stdin (our JSON is compact).
json_field() { grep -o "\"$1\":\"[^\"]*\"" | head -n 1 | cut -d'"' -f4; }

call() { # method path [token] [body]
  method="$1"; path="$2"; token="${3:-}"; body="${4:-}"
  set -- -sS -f -X "$method" "$BASE_URL$path"
  [ -n "$token" ] && set -- "$@" -H "Authorization: Bearer $token"
  [ -n "$body" ] && set -- "$@" -H 'Content-Type: application/json' -d "$body"
  curl "$@"
}

cleanup() {
  [ -n "$OWNER_TOKEN" ] && call DELETE /api/auth/me "$OWNER_TOKEN" >/dev/null 2>&1 || true
  [ -n "$FAN_TOKEN" ] && call DELETE /api/auth/me "$FAN_TOKEN" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 1. Wait until every module reports healthy through the proxy (DB included).
for path in /api/auth/health /api/recipes/health /api/notifications/health; do
  step "waiting for $path"
  ok=0
  for _ in $(seq 1 30); do
    if curl -sf -o /dev/null "$BASE_URL$path"; then ok=1; break; fi
    sleep 2
  done
  [ "$ok" = 1 ] || fail "$path never became healthy"
done
echo "deployed version: $(call GET /api/recipes/health | json_field version)"

# 2. Accounts
step "register owner and fan"
RESP=$(call POST /api/auth/register "" "{\"name\":\"Smoke Owner\",\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}") || fail "register owner"
OWNER_TOKEN=$(printf '%s' "$RESP" | json_field token)
[ -n "$OWNER_TOKEN" ] || fail "no token returned on register"
RESP=$(call POST /api/auth/register "" "{\"name\":\"Smoke Fan\",\"email\":\"$FAN_EMAIL\",\"password\":\"$PASSWORD\"}") || fail "register fan"
FAN_TOKEN=$(printf '%s' "$RESP" | json_field token)

step "login"
call POST /api/auth/login "" "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}" | grep -q '"token"' || fail "login"
call GET /api/auth/me "$OWNER_TOKEN" | grep -q "$OWNER_EMAIL" || fail "GET /me"

# 3. Recipe written to and read back from PostgreSQL
step "create and read a recipe"
RESP=$(call POST /api/recipes "$OWNER_TOKEN" '{"title":"Smoke Test Adobo","category":"Dinner,Chicken","ingredients":"chicken\nsoy sauce","instructions":"Simmer.","prepTime":"30 mins","servings":"4"}') || fail "create recipe"
RECIPE_ID=$(printf '%s' "$RESP" | json_field id)
[ -n "$RECIPE_ID" ] || fail "no recipe id returned"
call GET "/api/recipes/$RECIPE_ID" | grep -q 'Smoke Test Adobo' || fail "read recipe back"
call GET "/api/recipes?search=Smoke%20Test%20Adobo&category=Dinner" | grep -q "$RECIPE_ID" || fail "recipe missing from search/category listing"

# 4. Heart -> notification for the author (recipe-service writes, notification-service reads)
step "heart the recipe and check the author's notification"
call POST "/api/recipes/$RECIPE_ID/heart" "$FAN_TOKEN" | grep -q '"hearted":true' || fail "heart"
call GET /api/notifications "$OWNER_TOKEN" | grep -q 'Smoke Fan liked your recipe' || fail "notification not delivered"
call GET "/api/recipes?favorites=true" "$FAN_TOKEN" | grep -q "$RECIPE_ID" || fail "recipe not in fan's favorites"

# 5. Security checks
step "auth is enforced"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/recipes" -H 'Content-Type: application/json' -d '{"title":"x"}')
[ "$code" = 401 ] || fail "creating a recipe without a token returned $code (expected 401)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/recipes/$RECIPE_ID" -H "Authorization: Bearer $FAN_TOKEN")
[ "$code" = 403 ] || fail "deleting someone else's recipe returned $code (expected 403)"

echo "SMOKE TEST PASSED"
