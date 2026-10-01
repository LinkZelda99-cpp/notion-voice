import type { Handler } from 'aws-lambda';
import { skill } from './skill.js';

export const handler: Handler = async (event, context) => {
  return skill.invoke(event, context);
};
