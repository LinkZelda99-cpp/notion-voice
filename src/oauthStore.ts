import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  QueryCommand
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const tableName = process.env.OAUTH_TABLE_NAME;

if (!tableName) {
  throw new Error('OAUTH_TABLE_NAME is required');
}

export interface AuthorizationTransaction {
  id: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  notionState: string;
  notionAccessToken?: string;
  notionRefreshToken?: string;
  createdAt: number;
  expiresAt: number;
}

export async function putTransaction(transaction: AuthorizationTransaction): Promise<void> {
  await client.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      id: { S: transaction.id },
      redirectUri: { S: transaction.redirectUri },
      state: { S: transaction.state },
      notionState: { S: transaction.notionState },
      ...(transaction.codeChallenge
        ? { codeChallenge: { S: transaction.codeChallenge } }
        : {}),
      ...(transaction.codeChallengeMethod
        ? { codeChallengeMethod: { S: transaction.codeChallengeMethod } }
        : {}),
      ...(transaction.notionAccessToken
        ? { notionAccessToken: { S: transaction.notionAccessToken } }
        : {}),
      ...(transaction.notionRefreshToken
        ? { notionRefreshToken: { S: transaction.notionRefreshToken } }
        : {}),
      createdAt: { N: String(transaction.createdAt) },
      expiresAt: { N: String(transaction.expiresAt) },
    }
  }));
}

export async function getTransaction(id: string): Promise<AuthorizationTransaction | undefined> {
  const result = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: { id: { S: id } }
  }));

  const item = result.Item;
  if (!item) return undefined;

  const transaction: AuthorizationTransaction = {
    id,
    redirectUri: item.redirectUri.S!,
    state: item.state.S!,
    notionState: item.notionState.S!,
    createdAt: Number(item.createdAt.N),
    expiresAt: Number(item.expiresAt.N),
  };

  if (item.codeChallenge?.S) transaction.codeChallenge = item.codeChallenge.S;
  if (item.codeChallengeMethod?.S) transaction.codeChallengeMethod = item.codeChallengeMethod.S;
  if (item.notionAccessToken?.S) transaction.notionAccessToken = item.notionAccessToken.S;
  if (item.notionRefreshToken?.S) transaction.notionRefreshToken = item.notionRefreshToken.S;

  if (transaction.expiresAt <= Math.floor(Date.now() / 1000)) {
    await deleteTransaction(id);
    return undefined;
  }

  return transaction;
}

export async function findTransactionByNotionState(state: string): Promise<AuthorizationTransaction | undefined> {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'notionState-index',
    KeyConditionExpression: 'notionState = :state',
    ExpressionAttributeValues: {
      ':state': { S: state }
    },
    Limit: 1
  }));

  const item = result.Items?.[0];
  if (!item?.id?.S) return undefined;
  return getTransaction(item.id.S);
}

export async function deleteTransaction(id: string): Promise<void> {
  await client.send(new DeleteItemCommand({
    TableName: tableName,
    Key: { id: { S: id } }
  }));
}
