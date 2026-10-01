import {
  getRequestType,
  getIntentName,
  getSlotValue,
  SkillBuilders
} from 'ask-sdk-core';
import type { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { NotionAuth } from './notionAuth.js';
import { NotionClient } from './notionClient.js';

const LaunchRequestHandler: RequestHandler = {
  canHandle(handlerInput) {
    return getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Welcome to Notion Voice. You can ask me to add something to Notion.')
      .reprompt('What would you like me to add to Notion?')
      .getResponse();
  }
};

const AddToNotionIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'AddToNotionIntent'
    );
  },
  async handle(handlerInput) {
    const text = getSlotValue(handlerInput.requestEnvelope, 'text');

    if (!text) {
      return handlerInput.responseBuilder
        .speak('What would you like me to add to Notion?')
        .reprompt('Tell me what to add.')
        .getResponse();
    }

    const accessToken = NotionAuth.getAccessToken(handlerInput);

    if (!accessToken) {
      return handlerInput.responseBuilder
        .speak('Your Notion account is not linked yet. Please link your Notion account in the Alexa app.')
        .getResponse();
    }

    // TODO: Replace this placeholder page ID with the user's configured
    // destination once the account-linking and destination flows exist.
    const pageId = process.env.NOTION_DEFAULT_PAGE_ID;

    if (!pageId) {
      return handlerInput.responseBuilder
        .speak('Notion Voice is not configured with a destination page yet.')
        .getResponse();
    }

    try {
      const notion = new NotionClient(accessToken);

      await notion.appendBlock(pageId, {
        type: 'to_do',
        text
      });

      return handlerInput.responseBuilder
        .speak(`Added ${text} to Notion.`)
        .getResponse();
    } catch (error) {
      console.error('Failed to add block to Notion:', error);

      return handlerInput.responseBuilder
        .speak('I could not add that to Notion. Please try again.')
        .getResponse();
    }
  }
};

const HelpIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('You can ask me to add something to Notion.')
      .reprompt('What would you like to add?')
      .getResponse();
  }
};

const CancelAndStopIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(
        getIntentName(handlerInput.requestEnvelope) ?? ''
      )
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Goodbye.')
      .getResponse();
  }
};

const SessionEndedRequestHandler: RequestHandler = {
  canHandle(handlerInput) {
    return getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput: HandlerInput, error: Error) {
    console.error('Alexa skill error:', error);

    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong.')
      .getResponse();
  }
};

export const skill = SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AddToNotionIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .create();
