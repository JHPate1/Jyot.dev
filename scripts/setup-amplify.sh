#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Kode · AWS Amplify provisioning script
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_NAME="${APP_NAME:-kode}"
BRANCH="${BRANCH:-main}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
REPO_URL="${REPO_URL:-}"
NVIDIA_API_KEY="${NVIDIA_API_KEY:-}"
NVIDIA_BASE_URL="${NVIDIA_BASE_URL:-https://integrate.api.nvidia.com/v1}"
NVIDIA_MODEL="${NVIDIA_MODEL:-nvidia/nemotron-3-super-120b-a12b}"
MANUAL=0
[[ "${1:-}" == "--manual" ]] && MANUAL=1

c() { printf "\033[38;5;112m%s\033[0m\n" "$*"; }
w() { printf "\033[38;5;214m%s\033[0m\n" "$*"; }
die() { printf "\033[38;5;203mERROR: %s\033[0m\n" "$*" >&2; exit 1; }

command -v aws >/dev/null || die "awscli v2 not found"
command -v jq  >/dev/null || die "jq not found"

c "▸ Region: $REGION   App: $APP_NAME   Branch: $BRANCH"

BUILD_SPEC="$(cat <<'YAML'
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci --prefer-offline --no-audit --fund=false
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - "**/*"
  cache:
    paths:
      - node_modules/**/*
YAML
)"

CUSTOM_HEADERS="$(cat <<'YAML'
customHeaders:
  - pattern: "**/*"
    headers:
      - key: Cross-Origin-Opener-Policy
        value: same-origin
      - key: X-Content-Type-Options
        value: nosniff
      - key: Referrer-Policy
        value: strict-origin-when-cross-origin
      - key: Permissions-Policy
        value: "camera=(), microphone=(), geolocation=()"
YAML
)"

ENV_VARS=$(jq -n \
  --arg k "$NVIDIA_API_KEY" --arg b "$NVIDIA_BASE_URL" --arg m "$NVIDIA_MODEL" \
  '{VITE_NVIDIA_API_KEY:$k, VITE_NVIDIA_BASE_URL:$b, VITE_NVIDIA_MODEL:$m, NODE_OPTIONS:"--max-old-space-size=4096"}')

APP_ID="$(aws amplify list-apps --region "$REGION" \
  --query "apps[?name=='${APP_NAME}'].appId | [0]" --output text 2>/dev/null || echo "None")"

if [[ "$APP_ID" == "None" || -z "$APP_ID" ]]; then
  c "▸ Creating Amplify app ($APP_NAME)…"
  CREATE_ARGS=(--name "$APP_NAME" --region "$REGION"
    --platform WEB
    --build-spec "$BUILD_SPEC"
    --custom-headers "$CUSTOM_HEADERS"
    --environment-variables "$ENV_VARS"
    --custom-rules '[{"source":"/<*>","target":"/index.html","status":"404-200"}]'
    --enable-branch-auto-build)
  if [[ $MANUAL -eq 0 && -n "$REPO_URL" ]]; then
    [[ -n "${GITHUB_ACCESS_TOKEN:-}" ]] || die "Set GITHUB_ACCESS_TOKEN, or run with --manual"
    CREATE_ARGS+=(--repository "$REPO_URL" --oauth-token "$GITHUB_ACCESS_TOKEN")
  fi
  APP_ID="$(aws amplify create-app "${CREATE_ARGS[@]}" --query 'app.appId' --output text)"
  c "  created appId=$APP_ID"
else
  c "▸ Updating existing app $APP_ID…"
  aws amplify update-app --app-id "$APP_ID" --region "$REGION" \
    --build-spec "$BUILD_SPEC" \
    --custom-headers "$CUSTOM_HEADERS" \
    --environment-variables "$ENV_VARS" >/dev/null
fi

if ! aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" >/dev/null 2>&1; then
  c "▸ Creating branch '$BRANCH'…"
  aws amplify create-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" \
    --stage PRODUCTION --enable-auto-build \
    --environment-variables "$ENV_VARS" >/dev/null
fi

if [[ $MANUAL -eq 1 ]]; then
  c "▸ Building locally…"
  npm ci --prefer-offline --no-audit --fund=false
  VITE_NVIDIA_API_KEY="$NVIDIA_API_KEY" \
  VITE_NVIDIA_BASE_URL="$NVIDIA_BASE_URL" \
  VITE_NVIDIA_MODEL="$NVIDIA_MODEL" \
  npm run build

  c "▸ Zipping dist/…"
  (cd dist && zip -qr ../kode-dist.zip .)

  c "▸ Requesting upload slot…"
  DEPLOY="$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION")"
  JOB_ID="$(echo "$DEPLOY" | jq -r '.jobId')"
  UPLOAD_URL="$(echo "$DEPLOY" | jq -r '.zipUploadUrl')"
  curl -s -H "Content-Type: application/zip" --upload-file kode-dist.zip "$UPLOAD_URL"
  aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --region "$REGION" >/dev/null
  rm -f kode-dist.zip
  c "  deployment job $JOB_ID started"
else
  c "▸ Triggering CI build…"
  aws amplify start-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-type RELEASE --region "$REGION" >/dev/null || \
    w "  start-job failed — push a commit, or re-run with --manual"
fi

DOMAIN="$(aws amplify get-app --app-id "$APP_ID" --region "$REGION" --query 'app.defaultDomain' --output text)"
echo
c "════════════════════════════════════════════════════════════"
c "  Kode deployed"
c "  App ID : $APP_ID"
c "  URL    : https://${BRANCH}.${DOMAIN}"
c "════════════════════════════════════════════════════════════"
