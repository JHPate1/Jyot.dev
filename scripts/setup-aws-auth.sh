#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
KEYS_TABLE="${KEYS_TABLE:-seeker-api-keys}"
USAGE_TABLE="${USAGE_TABLE:-seeker-api-usage}"
USERS_TABLE="${USERS_TABLE:-seeker-users}"
SES_EMAIL="${SES_FROM_EMAIL:?Set SES_FROM_EMAIL to the verified sender address, e.g. noreply@example.com}"

aws dynamodb create-table --region "$REGION" --table-name "$KEYS_TABLE" \
  --attribute-definitions AttributeName=keyHash,AttributeType=S \
  --key-schema AttributeName=keyHash,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null || true

aws dynamodb create-table --region "$REGION" --table-name "$USAGE_TABLE" \
  --attribute-definitions AttributeName=keyHash,AttributeType=S AttributeName=day,AttributeType=S \
  --key-schema AttributeName=keyHash,KeyType=HASH AttributeName=day,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST >/dev/null || true

aws dynamodb create-table --region "$REGION" --table-name "$USERS_TABLE" \
  --attribute-definitions AttributeName=email,AttributeType=S \
  --key-schema AttributeName=email,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST >/dev/null || true

aws dynamodb wait table-exists --region "$REGION" --table-name "$KEYS_TABLE"
aws dynamodb wait table-exists --region "$REGION" --table-name "$USAGE_TABLE"
aws dynamodb wait table-exists --region "$REGION" --table-name "$USERS_TABLE"

aws ses verify-email-identity --region "$REGION" --email-address "$SES_EMAIL"

cat <<OUT
Created/verified resources in $REGION:
- KEYS_TABLE=$KEYS_TABLE
- USAGE_TABLE=$USAGE_TABLE
- USERS_TABLE=$USERS_TABLE
- SES_FROM_EMAIL=$SES_EMAIL (check inbox to complete verification)

Add these Lambda env vars:
KEYS_TABLE=$KEYS_TABLE
USAGE_TABLE=$USAGE_TABLE
USERS_TABLE=$USERS_TABLE
SES_FROM_EMAIL=$SES_EMAIL
AWS_REGION=$REGION
APP_URL=https://your-app-domain.example
OUT
