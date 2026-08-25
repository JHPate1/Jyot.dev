#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Seeker Code · deploy the branded API gateway to AWS
#  Creates: DynamoDB tables, Lambda (streaming), Function URL, IAM role
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
FN_NAME="${FN_NAME:-seeker-api}"
ROLE_NAME="${ROLE_NAME:-seeker-api-role}"
KEYS_TABLE="${KEYS_TABLE:-seeker-api-keys}"
USAGE_TABLE="${USAGE_TABLE:-seeker-api-usage}"
DEFAULT_DAILY_LIMIT="${DEFAULT_DAILY_LIMIT:-50}"
ADMIN_SECRET="${ADMIN_SECRET:-$(openssl rand -hex 24)}"
NVIDIA_KEY_PRO="${NVIDIA_KEY_PRO:-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}"
NVIDIA_KEY_PERPLEX="${NVIDIA_KEY_PERPLEX:-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}"
NVIDIA_KEY_FLASH="${NVIDIA_KEY_FLASH:-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}"
CORS_ORIGIN="${CORS_ORIGIN:-*}"

c() { printf "\033[38;5;112m%s\033[0m\n" "$*"; }
w() { printf "\033[38;5;214m%s\033[0m\n" "$*"; }
die() { printf "\033[38;5;203mERROR: %s\033[0m\n" "$*" >&2; exit 1; }

command -v aws >/dev/null || die "awscli v2 required"
command -v jq  >/dev/null || die "jq required"
command -v zip >/dev/null || die "zip required"
command -v npm >/dev/null || die "npm required"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
c "▸ Account $ACCOUNT · Region $REGION · Function $FN_NAME"

# ── 1. DynamoDB tables ───────────────────────────────────────────────────────
create_table() {
  local name="$1" key="$2" sort="${3:-}"
  if aws dynamodb describe-table --table-name "$name" --region "$REGION" >/dev/null 2>&1; then
    c "  table $name exists"
    return
  fi
  c "  creating table $name"
  local attrs="AttributeName=$key,AttributeType=S"
  local schema="AttributeName=$key,KeyType=HASH"
  if [[ -n "$sort" ]]; then
    attrs="$attrs AttributeName=$sort,AttributeType=S"
    schema="$schema AttributeName=$sort,KeyType=RANGE"
  fi
  # shellcheck disable=SC2086
  aws dynamodb create-table \
    --table-name "$name" \
    --attribute-definitions $attrs \
    --key-schema $schema \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" >/dev/null
  aws dynamodb wait table-exists --table-name "$name" --region "$REGION"
}

create_table "$KEYS_TABLE" keyHash
create_table "$USAGE_TABLE" keyHash day

# TTL on usage so old days expire automatically (optional attribute)
aws dynamodb update-time-to-live --table-name "$USAGE_TABLE" --region "$REGION" \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" >/dev/null 2>&1 || true

# ── 2. IAM role ──────────────────────────────────────────────────────────────
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  c "▸ Creating IAM role $ROLE_NAME"
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  cat > /tmp/seeker-ddb-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:Scan","dynamodb:Query"],
    "Resource": [
      "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${KEYS_TABLE}",
      "arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${USAGE_TABLE}"
    ]
  }]
}
EOF
  aws iam put-role-policy --role-name "$ROLE_NAME" \
    --policy-name seeker-ddb --policy-document file:///tmp/seeker-ddb-policy.json
  c "  waiting for IAM propagation…"
  sleep 10
else
  c "  IAM role exists"
fi

# ── 3. Build Lambda zip ──────────────────────────────────────────────────────
c "▸ Building Lambda package"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pushd "$ROOT/api" >/dev/null
npm install --omit=dev --no-audit --fund=false
rm -f /tmp/seeker-api.zip
zip -qr /tmp/seeker-api.zip index.mjs package.json node_modules
popd >/dev/null

ENV_JSON=$(jq -n \
  --arg kt "$KEYS_TABLE" --arg ut "$USAGE_TABLE" \
  --arg kp "$NVIDIA_KEY_PRO" --arg kx "$NVIDIA_KEY_PERPLEX" --arg kf "$NVIDIA_KEY_FLASH" \
  --arg adm "$ADMIN_SECRET" --arg lim "$DEFAULT_DAILY_LIMIT" --arg cors "$CORS_ORIGIN" \
  '{Variables:{
    KEYS_TABLE:$kt, USAGE_TABLE:$ut,
    NVIDIA_KEY_PRO:$kp, NVIDIA_KEY_PERPLEX:$kx, NVIDIA_KEY_FLASH:$kf,
    NVIDIA_BASE_URL:"https://integrate.api.nvidia.com/v1",
    ADMIN_SECRET:$adm, DEFAULT_DAILY_LIMIT:$lim, CORS_ORIGIN:$cors
  }}')

# ── 4. Create or update Lambda ───────────────────────────────────────────────
if aws lambda get-function --function-name "$FN_NAME" --region "$REGION" >/dev/null 2>&1; then
  c "▸ Updating function code + config"
  aws lambda update-function-code --function-name "$FN_NAME" --region "$REGION" \
    --zip-file fileb:///tmp/seeker-api.zip >/dev/null
  aws lambda wait function-updated --function-name "$FN_NAME" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FN_NAME" --region "$REGION" \
    --timeout 300 --memory-size 512 \
    --environment "$ENV_JSON" >/dev/null
  aws lambda wait function-updated --function-name "$FN_NAME" --region "$REGION"
else
  c "▸ Creating function"
  aws lambda create-function --function-name "$FN_NAME" --region "$REGION" \
    --runtime nodejs20.x --handler index.handler \
    --role "$ROLE_ARN" \
    --zip-file fileb:///tmp/seeker-api.zip \
    --timeout 300 --memory-size 512 \
    --environment "$ENV_JSON" >/dev/null
  aws lambda wait function-active --function-name "$FN_NAME" --region "$REGION"
fi

# Enable response streaming (required for SSE)
aws lambda put-function-concurrency --function-name "$FN_NAME" --region "$REGION" \
  --reserved-concurrent-executions 50 >/dev/null 2>&1 || true

# ── 5. Function URL (public HTTPS endpoint, RESPONSE_STREAM) ─────────────────
URL="$(aws lambda get-function-url-config --function-name "$FN_NAME" --region "$REGION" \
  --query FunctionUrl --output text 2>/dev/null || echo None)"

if [[ "$URL" == "None" || -z "$URL" ]]; then
  c "▸ Creating Function URL (RESPONSE_STREAM)"
  URL="$(aws lambda create-function-url-config --function-name "$FN_NAME" --region "$REGION" \
    --auth-type NONE \
    --invoke-mode RESPONSE_STREAM \
    --cors "AllowOrigins=${CORS_ORIGIN},AllowMethods=*,AllowHeaders=Authorization,Content-Type,X-Seeker-Admin,ExposeHeaders=X-Seeker-Remaining,X-Seeker-Model,MaxAge=86400" \
    --query FunctionUrl --output text)"
  # Public invoke permission
  aws lambda add-permission --function-name "$FN_NAME" --region "$REGION" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE >/dev/null 2>&1 || true
else
  c "▸ Function URL already exists — ensuring RESPONSE_STREAM"
  aws lambda update-function-url-config --function-name "$FN_NAME" --region "$REGION" \
    --invoke-mode RESPONSE_STREAM \
    --cors "AllowOrigins=${CORS_ORIGIN},AllowMethods=*,AllowHeaders=Authorization,Content-Type,X-Seeker-Admin,ExposeHeaders=X-Seeker-Remaining,X-Seeker-Model,MaxAge=86400" \
    >/dev/null || true
fi

URL="${URL%/}"

# ── 6. Seed a demo key ───────────────────────────────────────────────────────
c "▸ Minting a demo Seeker key (limit ${DEFAULT_DAILY_LIMIT}/day)"
SEED="$(curl -sS -X POST "${URL}/v1/admin/keys" \
  -H "Content-Type: application/json" \
  -H "X-Seeker-Admin: ${ADMIN_SECRET}" \
  -d "{\"label\":\"demo\",\"dailyLimit\":${DEFAULT_DAILY_LIMIT}}")"
DEMO_KEY="$(echo "$SEED" | jq -r '.apiKey // empty')"

echo
c "════════════════════════════════════════════════════════════════"
c "  Seeker API is live"
c "  Base URL     : ${URL}/v1"
c "  Models       : ${URL}/v1/models"
c "  Admin secret : ${ADMIN_SECRET}"
if [[ -n "$DEMO_KEY" ]]; then
  c "  Demo API key : ${DEMO_KEY}"
  c "  (shown once — paste into Seeker Code → Settings)"
fi
c "════════════════════════════════════════════════════════════════"
echo
w "Next: set these Amplify / local env vars:"
echo "  VITE_SEEKER_API_URL=${URL}/v1"
echo "  VITE_SEEKER_API_KEY=${DEMO_KEY:-sk_seeker_...}"
echo
w "Create more keys anytime:"
echo "  export SEEKER_API_URL=${URL}"
echo "  export SEEKER_ADMIN_SECRET=${ADMIN_SECRET}"
echo "  node api/seed-key.mjs --label alice --limit 100"
