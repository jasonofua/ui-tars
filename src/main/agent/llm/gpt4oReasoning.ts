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

      const basePrompt = `You are an advanced AI automation assistant that executes precise web and computer tasks. 

Your response must be:
- A list of clear, executable instructions
- One specific action per line
- Include exact UI element descriptions (exact button text, field labels, positions)
- Include precise waiting conditions (wait for specific elements, not just time)
- No explanations or step numbers
- No additional commentary

Important guidelines for web automation:
- Always wait for elements to appear before interacting with them
- Describe elements by their exact text, not generic descriptions
- Include alternative paths if a specific element isn't found
- Specify exact text to type, including whether to include quotes
- For navigation, note specific visual cues that indicate success`;

      if (instructions) {
        return `${basePrompt}

I have found a relevant task in my knowledge base:
${instructions.join('\n')}

Based on analyzing this task and your request:
- If this task matches your needs exactly, I'll execute these precise steps
- If website layouts have changed, I'll look for equivalent elements
- If elements aren't found, I'll search for alternative paths to complete the task
- I'll verify each step is completed before moving to the next step`;
      } else {
        return `${basePrompt}

For your requested task, I will:
- Break the process into precise, executable steps
- Identify clear visual indicators for each element
- Wait for elements to be fully loaded and interactive
- Use exact text matches for all interactions
- Verify each step completes successfully

For example:
Open Chrome browser
Wait for Chrome to fully initialize
Click on the address bar at the top of the window
Type "example.com" without quotes
Press Enter
Wait until page fully loads and "Sign Up" button is visible
Click on button with exact text "Sign Up"
Wait for form to appear with field labeled "Email"
Click in field labeled "Email"
Type "username@email.com" without quotes
Wait for "Continue" button to become clickable
Click on button with exact text "Continue"`;
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
