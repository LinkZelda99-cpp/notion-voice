import type { Handler } from 'aws-lambda';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import {
  deleteTransaction,
  getTransaction,
  putTransaction,
  findTransactionByNotionState
} from './oauthStore.js';

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

const env = {
  notionClientId: process.env.NOTION_CLIENT_ID,
  notionClientSecret: process.env.NOTION_CLIENT_SECRET,
  notionRedirectUri: process.env.NOTION_REDIRECT_URI,
  alexaClientId: process.env.ALEXA_CLIENT_ID,
};

for (const [name, value] of Object.entries(env)) {
  if (!value) throw new Error(`${name} is required`);
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const redirect = (location: string) => ({
  statusCode: 302,
  headers: { location },
  body: '',
});

const html = (body: string) => ({
  statusCode: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body
});

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function base64UrlSha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function equalSecrets(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function authorize(params: URLSearchParams) {
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');

  if (
    clientId !== env.alexaClientId ||
    !redirectUri ||
    !responseType ||
    responseType !== 'code' ||
    !state
  ) {
    return json(400, { error: 'invalid_request' });
  }

  const transactionId = randomToken();
  const notionState = randomToken();

  await putTransaction({
    id: transactionId,
    redirectUri,
    state,
    codeChallenge: codeChallenge ?? undefined,
    codeChallengeMethod: codeChallengeMethod ?? undefined,
    notionState,
    createdAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });

  const notion = new URL(NOTION_AUTHORIZE_URL);
  notion.searchParams.set('owner', 'user');
  notion.searchParams.set('client_id', env.notionClientId!);
  notion.searchParams.set('redirect_uri', env.notionRedirectUri!);
  notion.searchParams.set('response_type', 'code');
  notion.searchParams.set('state', notionState);

  return redirect(notion.toString());
}

async function notionCallback(params: URLSearchParams) {
  const code = params.get('code');
  const notionState = params.get('state');

  if (!code || !notionState) {
    return html('<h1>Notion authorization failed.</h1>');
  }

  const transaction = await findTransactionByNotionState(notionState);
  if (!transaction) {
    return html('<h1>This authorization request has expired.</h1>');
  }

  const response = await fetch(NOTION_TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: basicAuth(env.notionClientId!, env.notionClientSecret!),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.notionRedirectUri,
    }),
  });

  if (!response.ok) {
    return html('<h1>Notion authorization could not be completed.</h1>');
  }

  const tokens = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokens.access_token) {
    return html('<h1>Notion did not return an access token.</h1>');
  }

  transaction.notionAccessToken = tokens.access_token;
  transaction.notionRefreshToken = tokens.refresh_token;
  await putTransaction(transaction);

  const alexaCode = randomToken();
  await putTransaction({
    ...transaction,
    id: `code:${alexaCode}`,
    notionState: transaction.notionState,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  });

  await deleteTransaction(transaction.id);

  const location = new URL(transaction.redirectUri);
  location.searchParams.set('code', alexaCode);
  location.searchParams.set('state', transaction.state);

  return redirect(location.toString());
}

async function token(params: URLSearchParams, authorization: string | null) {
  const grantType = params.get('grant_type');
  const clientId = params.get('client_id');
  const clientSecret = params.get('client_secret');
  const credentials = authorization?.startsWith('Basic ')
    ? Buffer.from(authorization.slice(6), 'base64').toString('utf8').split(':')
    : [];

  const suppliedClientId = clientId ?? credentials[0];
  const suppliedClientSecret = clientSecret ?? credentials[1];

  if (
    suppliedClientId !== env.alexaClientId ||
    !suppliedClientSecret ||
    !process.env.ALEXA_CLIENT_SECRET ||
    !equalSecrets(suppliedClientSecret, process.env.ALEXA_CLIENT_SECRET)
  ) {
    return json(401, { error: 'invalid_client' });
  }

  if (grantType === 'authorization_code') {
    const code = params.get('code');
    const redirectUri = params.get('redirect_uri');
    const codeVerifier = params.get('code_verifier');

    if (!code || !redirectUri) {
      return json(400, { error: 'invalid_request' });
    }

    const transaction = await getTransaction(`code:${code}`);
    if (!transaction || transaction.redirectUri !== redirectUri) {
      return json(400, { error: 'invalid_grant' });
    }

    if (transaction.codeChallenge) {
      if (transaction.codeChallengeMethod !== 'S256' || !codeVerifier) {
        return json(400, { error: 'invalid_grant' });
      }

      const calculated = base64UrlSha256(codeVerifier);
      if (!equalSecrets(calculated, transaction.codeChallenge)) {
        return json(400, { error: 'invalid_grant' });
      }
    }

    await deleteTransaction(`code:${code}`);

    return json(200, {
      access_token: transaction.notionAccessToken,
      refresh_token: transaction.notionRefreshToken,
      token_type: 'Bearer',
    });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token');
    if (!refreshToken) {
      return json(400, { error: 'invalid_request' });
    }

    const response = await fetch(NOTION_TOKEN_URL, {
      method: 'POST',
      headers: {
        authorization: basicAuth(env.notionClientId!, env.notionClientSecret!),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return json(400, { error: 'invalid_grant' });
    }

    const tokens = await response.json() as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!tokens.access_token) {
      return json(500, { error: 'server_error' });
    }

    return json(200, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? refreshToken,
      token_type: 'Bearer',
    });
  }

  return json(400, { error: 'unsupported_grant_type' });
}


export const handler: Handler = async (event) => {
  const path = event.rawPath ?? event.path ?? '';
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const params = new URLSearchParams(
    method === 'POST'
      ? event.body ?? ''
      : event.rawQueryString ?? ''
  );

  if (method === 'GET' && path.endsWith('/authorize')) {
    return authorize(params);
  }

  if (method === 'GET' && path.endsWith('/notion/callback')) {
    return notionCallback(params);
  }

  if (method === 'POST' && path.endsWith('/token')) {
    return token(params, event.headers?.authorization ?? event.headers?.Authorization ?? null);
  }

  return json(404, { error: 'not_found' });
};
