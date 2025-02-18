/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from 'openai/resources/chat/completions';

import { logger } from '@main/logger';

import { VlmRequestOptions, VlmResponse } from './base';
import { knowledgeBase } from '@main/store/knowledgeBase';

// Keep VlmRequestOptions and VlmResponse types

export interface GPT4oReasoningOptions {
  temperature?: number;
  max_tokens?: number;
}

export class GPT4oReasoning {
  private openai: OpenAI;
  private knowledgeBase = knowledgeBase;
  private readonly defaultModel = 'gpt-4o';

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      logger.error('OPENAI_API_KEY environment variable is not set.');
      throw new Error('OPENAI_API_KEY environment variable is not set.');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.openai.com/v1',
    });
  }

  get vlmModel() {
    // Return default model if environment variable is not set
    return process.env.REASONING_MODEL || this.defaultModel;
  }

  private async getInstructionPrompt(query: string): Promise<string> {
    try {
      const instructions = await this.knowledgeBase.getInstructions(query);

      const basePrompt = `You are an advanced AI assistant that helps users accomplish computer tasks through careful reasoning and precise instructions.

Your response must be:
- A list of clear, executable instructions
- One specific action per line
- Include exact UI elements, URLs, and values
- No explanations or step numbers
- No additional commentary

Focus on accuracy and practicality. Each step should be something a computer can execute.`;

      if (instructions) {
        return `${basePrompt}

I have found a relevant task in my knowledge base that we can learn from:
${instructions.join('\n')}

Please analyze the provided task and determine:
1. If it is an exact match for the user's request
2. If it is a similar task that requires adaptation
3. If it is a different task but contains useful patterns

Based on your analysis:
- For exact matches: Use the provided instructions as is.
- For similar tasks: Adapt the instructions while preserving core steps and technical details.
- For different tasks: Use the structure as inspiration.`;
      } else {
        return `${basePrompt}

Analyze the user's request by:
- Breaking down the task into fundamental operations
- Identifying the most reliable method to execute each step
- Ensuring each step is precise and executable

For example:
Open Chrome browser
Navigate to https://example.com
Click "Sign Up" button
Type "username@email.com" in Email field
Click "Continue" button`;
      }
    } catch (error) {
      logger.error('Failed to get instructions:', error);
      throw error;
    }
  }


  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (i === maxRetries - 1) throw error; // Last attempt, throw the error

        if (error?.status === 503) {
          const delay = initialDelay * Math.pow(2, i);
          logger.info(`Retrying after ${delay}ms due to 503 error`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error; // For other errors, throw immediately
      }
    }
    throw new Error('Max retries reached');
  }

  async invoke(
    { conversations }: { conversations: any },
    options?: VlmRequestOptions & GPT4oReasoningOptions,
  ): Promise<VlmResponse> {
    const { abortController } = options ?? {};
    const startTime = Date.now();

    try {
      const userMessage = conversations[conversations.length - 1].value;
      if (!userMessage) {
        throw new Error('No user message found');
      }

      const systemPrompt = await this.getInstructionPrompt(userMessage);

      const systemMessage: ChatCompletionSystemMessageParam = {
        role: 'system',
        content: systemPrompt
      };

      const userMessageParam: ChatCompletionUserMessageParam = {
        role: 'user',
        content: userMessage
      };

      const messages: ChatCompletionMessageParam[] = [
        systemMessage,
        userMessageParam
      ];

      logger.debug('Making OpenAI request with:', {
        model: this.vlmModel,
        messageCount: messages.length,
        firstFewWords: userMessage.slice(0, 50)
      });

      // Wrap the OpenAI call in the retry mechanism
      const result = await this.retryWithExponentialBackoff(async () => {
        return await this.openai.chat.completions.create({
          model: this.vlmModel,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        });
      });

      if (!result.choices[0]?.message?.content) {
        throw new Error('No content in response');
      }

      return {
        prediction: result.choices[0].message.content,
        reflections: []
      };
    } catch (error: any) {
      logger.error('GPT4o API Error:', {
        error: error.message,
        status: error.status,
        type: error.type,
        model: this.vlmModel,
        lastMessage: conversations[conversations.length - 1]?.value
      });
      throw error;
    }
  }
}
