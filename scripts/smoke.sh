#!/usr/bin/env bash
set -euo pipefail
base="${1:-http://localhost:8080}"

curl -fsS "$base/api/health" | tee /dev/stderr
echo
token=$(curl -fsS -X POST "$base/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@toka.local","password":"Toka2026!"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).accessToken))')

curl -fsS "$base/api/users" -H "authorization: Bearer $token" | tee /dev/stderr
echo
curl -fsS -X POST "$base/api/ai/query" \
  -H "authorization: Bearer $token" \
  -H 'content-type: application/json' \
  -d '{"question":"¿Qué permisos tiene el rol ADMIN?"}' | tee /dev/stderr
echo
