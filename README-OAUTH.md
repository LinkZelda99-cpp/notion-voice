# Notion Voice OAuth

Notion Voice uses Amazon Alexa's OAuth 2.0 authorization-code account-linking flow.

## Endpoints

The OAuth Lambda exposes three routes:

- `GET /oauth/authorize` — Alexa's authorization endpoint.
- `POST /oauth/token` — Alexa's access-token endpoint.
- `GET /oauth/notion/callback` — Notion's OAuth callback.

The flow is:

```
Alexa
  │
  ▼
/oauth/authorize
  │
  ▼
Notion OAuth
  │
  ▼
/oauth/notion/callback
  │
  ▼
/oauth/token
  │
  ▼
Alexa receives Notion access + refresh tokens
```

Alexa's authorization request carries `state`, `redirect_uri`, and (when enabled) PKCE parameters. The service preserves those values while the user is sent through Notion OAuth.

## AWS resources

The implementation expects:

- AWS Lambda for `src/oauthLambda.ts`
- API Gateway HTTP API routes for the three endpoints
- DynamoDB table for short-lived OAuth transactions
- HTTPS on port 443 for the public OAuth endpoints

Recommended DynamoDB key:

- Partition key: `id` (String)
- TTL attribute: `expiresAt` (Number)

A DynamoDB GSI on `notionState` is also required:

- Partition key: `notionState` (String)

The GSI lets the Notion callback find the original Alexa transaction without scanning the table.

## Environment variables

Set these as Lambda environment variables/secrets:

- `ALEXA_CLIENT_ID`
- `ALEXA_CLIENT_SECRET`
- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET`
- `NOTION_REDIRECT_URI`
- `OAUTH_TABLE_NAME`

Do not commit client secrets.

## Notion integration

Create/use a Notion **public integration** and register:

`NOTION_REDIRECT_URI`

as its OAuth redirect URI. The redirect URI must exactly match the URI used during the Notion authorization-code exchange.

## Alexa configuration

In the Alexa developer console, configure Account Linking with the authorization-code grant:

- Authorization URI: `https://<your-api-domain>/oauth/authorize`
- Access Token URI: `https://<your-api-domain>/oauth/token`

Register the Amazon-provided Alexa redirect URLs exactly as shown in the console. Amazon requires HTTPS and expects the authorization server to preserve the incoming `state` and validate PKCE at the token endpoint.

## Current limitation

The repository intentionally keeps the OAuth server separate from the Alexa skill Lambda. The OAuth service returns the Notion OAuth token directly as Alexa's access token, so the existing `NotionAuth` + `NotionClient` code can consume it without another proxy layer.

Before deployment, add the DynamoDB GSI implementation in `src/oauthStore.ts` and wire the API Gateway routes. The current callback function fails closed rather than performing an unsafe table scan.
