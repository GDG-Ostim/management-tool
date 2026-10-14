#!/usr/bin/env bash
# Docker smoke test (CI): build → first start + bootstrap → sign in → restart keeps data →
# online backup → change → restore with the service stopped → change is gone.
# Uses a throwaway env file, secret and volume (project gdg-smoke); the repo .env is never read or written.
set -euo pipefail

export COMPOSE_PROJECT_NAME=gdg-smoke APP_PORT=3300
origin=https://gdg-smoke.example.test
base=http://127.0.0.1:$APP_PORT
password=Smoke-Baskan-Sifresi-2026
work=$(mktemp -d)
export BOOTSTRAP_SECRET_FILE=$work/bootstrap-password.txt
printf '%s' "$password" > "$BOOTSTRAP_SECRET_FILE"
export ENV_FILE=$work/app.env
cat > "$ENV_FILE" <<EOF
APP_URL=$origin
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
RESEND_API_KEY=re_smoke_not_used
MAIL_FROM=no-reply@example.test
BOOTSTRAP_ADMIN_EMAIL=baskan@smoke.test
BOOTSTRAP_ADMIN_NAME=Smoke Başkan
EOF

compose() { docker compose "$@"; }
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then compose logs --no-color app || true; fi
  compose down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

sign_in() {
  curl -s -D - -o /dev/null -X POST "$base/api/auth/sign-in/email" -H "Origin: $origin" -H 'content-type: application/json' \
    -d "{\"email\":\"baskan@smoke.test\",\"password\":\"$password\"}" | tr -d '\r' | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p' | head -1
}
committees() { curl -sf "$base/api/committees" -H "Cookie: $1"; }
step() { printf '\n== %s\n' "$1"; }

step 'Build and first start'
compose up -d --build --wait --wait-timeout 120
compose logs app | grep -q 'İlk başkan oluşturuldu'
cookie=$(sign_in); test -n "$cookie"
curl -sf "$base/api/me" -H "Cookie: $cookie" | grep -q '"role":"super_admin"'
curl -sf -o /dev/null "$base/panolar"
test "$(compose exec -T app id -un)" = node

step 'Restart keeps data and skips bootstrap'
curl -sf -X POST "$base/api/committees" -H "Cookie: $cookie" -H "Origin: $origin" -H 'content-type: application/json' -d '{"name":"Etkinlik"}' >/dev/null
compose restart app && compose up -d --wait --wait-timeout 60
cookie=$(sign_in); test -n "$cookie"
committees "$cookie" | grep -q '"name":"Etkinlik"'
# Bootstrap ran once: still exactly one president, and this start did not create another.
test "$(curl -sf "$base/api/users" -H "Cookie: $cookie" | grep -o '"role":"super_admin"' | wc -l)" = 1
if compose logs app | tail -n 5 | grep -q 'İlk başkan oluşturuldu'; then echo 'Bootstrap ran again on restart'; exit 1; fi
compose logs app | grep -q 'Başlangıç yedeği alındı'

step 'Online backup, change, restore'
backup=$(compose exec -T app node apps/api/dist/backup-cli.js | tr -d '\r' | tail -1)
echo "backup: $backup"
curl -sf -X POST "$base/api/committees" -H "Cookie: $cookie" -H "Origin: $origin" -H 'content-type: application/json' -d '{"name":"Medya"}' >/dev/null
committees "$cookie" | grep -q '"name":"Medya"'
compose stop app
compose run --rm --no-deps -T app node apps/api/dist/restore-cli.js "$backup" --yes
compose up -d --wait --wait-timeout 60
cookie=$(sign_in); test -n "$cookie"
list=$(committees "$cookie")
echo "$list" | grep -q '"name":"Etkinlik"'
if echo "$list" | grep -q '"name":"Medya"'; then echo 'Restore did not roll back the change'; exit 1; fi

step 'Docker smoke test passed'
