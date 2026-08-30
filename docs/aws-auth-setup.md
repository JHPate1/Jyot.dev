# Seeker Code AWS auth, SES, and managed API keys

This app now supports a production-style flow:

1. A user registers with email/password.
2. The API stores the user in DynamoDB and sends a 6-digit verification code through Amazon SES.
3. After verification, the API creates a managed `sk_seeker_...` key, assigns the Free tier, and returns limits to the app.
4. The frontend stores that key locally and uses the single backend `/v1/chat/completions` endpoint.
5. The API enforces hourly, weekly, and monthly request limits before proxying to NVIDIA Nemotron.

## Tiers

| Tier | Price | Instances | Hourly requests | Weekly requests | Monthly requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | $0/mo | 5 | 5 | 100 | 1,000 |
| Pro | $19/mo | 20 | 120 | 2,500 | 25,000 |
| Team | $49/mo | 60 | 500 | 10,000 | 100,000 |

## Important: Amplify does not create the DB automatically

`amplify.yml` in this repository is frontend-only: it runs `npm ci` and `npm run build`, then publishes `dist`. It does **not** create DynamoDB tables, Lambda, IAM permissions, or SES identities by itself. You must run one of the AWS setup scripts below, or convert these resources into Amplify Gen 2/CDK later.

## One-command DB + SES setup only

```bash
AWS_REGION=us-east-1 \
SES_FROM_EMAIL=noreply@yourdomain.com \
./scripts/setup-aws-auth.sh
```

Then open the SES verification email and verify the sender identity. If your SES account is still in sandbox mode, also verify every recipient used for testing or request production access in the AWS SES console.

## Full API deploy option

To create/update the Lambda API plus DynamoDB resources in one pass, run:

```bash
AWS_REGION=us-east-1 \
SES_FROM_EMAIL=noreply@yourdomain.com \
APP_URL=https://your-amplify-domain.example \
CORS_ORIGIN=https://your-amplify-domain.example \
./scripts/deploy-seeker-api.sh
```

If `SES_FROM_EMAIL` is omitted, development registrations still work, but verification codes are logged in Lambda instead of emailed.

## Lambda environment variables

Set these on the Seeker API Lambda:

```bash
KEYS_TABLE=seeker-api-keys
USAGE_TABLE=seeker-api-usage
USERS_TABLE=seeker-users
SES_FROM_EMAIL=noreply@yourdomain.com
APP_URL=https://your-amplify-domain.example
NVIDIA_KEY_PRO=nvapi-...
NVIDIA_KEY_PERPLEX=nvapi-...
NVIDIA_KEY_FLASH=nvapi-...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
CORS_ORIGIN=https://your-amplify-domain.example
ADMIN_SECRET=<long random secret>
```

## Required Lambda IAM permissions

Attach a policy allowing:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Scan"], "Resource": ["arn:aws:dynamodb:*:*:table/seeker-api-keys", "arn:aws:dynamodb:*:*:table/seeker-api-usage", "arn:aws:dynamodb:*:*:table/seeker-users"] },
    { "Effect": "Allow", "Action": ["ses:SendEmail"], "Resource": "*" }
  ]
}
```

## Frontend link

For local development, set the API base URL if it differs from the default proxy:

```bash
VITE_SEEKER_API_BASE_URL=https://your-api-id.lambda-url.us-east-1.on.aws/v1
npm run dev
```

The auth UI calls `/auth/register`, `/auth/verify`, and `/auth/login` on that same API origin. Once verified, the returned managed API key is saved in browser storage and also placed in Seeker settings for all IDE calls.
