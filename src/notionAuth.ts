import type { HandlerInput } from 'ask-sdk-core';

export class NotionAuth {
  /**
   * Alexa account linking places the linked-account access token on the
   * incoming request. The account-linking server will eventually issue
   * the token that identifies the user's Notion connection.
   */
  static getAccessToken(handlerInput: HandlerInput): string | undefined {
    return handlerInput.requestEnvelope.session?.user?.accessToken;
  }

  static requireAccessToken(handlerInput: HandlerInput): string {
    const accessToken = this.getAccessToken(handlerInput);

    if (!accessToken) {
      throw new Error('NOTION_ACCOUNT_NOT_LINKED');
    }

    return accessToken;
  }
}
