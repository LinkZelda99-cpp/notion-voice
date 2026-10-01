# Notion Voice

Control your Notion workspace with voice through Amazon Alexa.

## Current status

This repository is the initial working prototype, including the Alexa skill, Notion API client, and AWS-hosted OAuth account-linking service.

The first goal is intentionally small:

> "Alexa, ask Notion Voice to add finish my chemistry homework"

The skill currently contains:

- An Alexa custom-skill interaction model
- A TypeScript ASK SDK backend
- A reusable Notion API client based on the Notion Sidebar project
- An Alexa-aware authentication layer that reads the linked account token
- A placeholder destination page configuration

## Architecture

```
Alexa
  │
  ▼
Notion Voice skill
  │
  ▼
Notion API
  │
  ▼
User's Notion workspace
```

Account linking will sit between Alexa and the Notion API:

```
Alexa account linking
        │
        ▼
Notion OAuth
        │
        ▼
Notion access token
```

## Development

Install dependencies:

```bash
npm install
```

Check types:

```bash
npm run check-types
```

Build the Lambda bundle:

```bash
npm run build
```

## Alexa setup

Create a **Custom** Alexa skill and use the interaction model in `models/en-US.json`.

Amazon's current documentation recommends the authorization-code OAuth flow for account linking. The account-linking authorization server is implemented in `src/oauthLambda.ts`; the current `NotionAuth` class consumes the resulting Alexa access token.

## Environment

For the first skeleton, the backend expects:

- `NOTION_DEFAULT_PAGE_ID` — temporary destination page ID

Do not commit Notion tokens, OAuth client secrets, or Alexa account-linking secrets.

## Relationship to Notion Sidebar

This is a separate project, not a branch of Notion Sidebar.

Reusable Notion API logic is being brought over where it makes sense. VS Code-specific UI, WebViews, Activity Bar code, and VS Code SecretStorage are intentionally not part of this repository.
