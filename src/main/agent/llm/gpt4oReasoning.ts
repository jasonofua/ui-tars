/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from 'openai/resources/chat/completions';

import { logger } from '@main/logger';

import { VlmRequestOptions, VlmResponse } from './base';
import { KnowledgeBaseStore } from '@main/store/knowledgeBase';

// Keep VlmRequestOptions and VlmResponse types

export interface GPT4oReasoningOptions {
  temperature?: number;
  max_tokens?: number;
}

export class GPT4oReasoning {
  private openai: OpenAI;
  private knowledgeBase: KnowledgeBaseStore;
  private readonly defaultModel = 'gpt-4o';

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      logger.error('OPENAI_API_KEY environment variable is not set.');
      throw new Error('OPENAI_API_KEY environment variable is not set.');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.openai.com/v1', // Explicitly set base URL
    });
    this.knowledgeBase = KnowledgeBaseStore.getInstance();
  }

  get vlmModel() {
    // Return default model if environment variable is not set
    return process.env.REASONING_MODEL || this.defaultModel;
  }

  async invoke(
    { conversations }: { conversations: any },
    options?: VlmRequestOptions & GPT4oReasoningOptions,
  ): Promise<VlmResponse> {
    const { abortController } = options ?? {};
    const startTime = Date.now();

    try {
      // Get the last message from conversations
      const userMessage = conversations[conversations.length - 1].value;
      if (!userMessage) {
        throw new Error('No user message found');
      }

      // Properly typed messages
      const systemMessage: ChatCompletionSystemMessageParam = {
        role: 'system',
        content: this.getInstructionPrompt(userMessage)
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

      const result = await this.openai.chat.completions.create({
        model: this.vlmModel,
        messages,
        temperature: 0.7,
        max_tokens: 1000
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

  private getInstructionPrompt(query: string): string {
    const knowledgeBaseMatch = this.knowledgeBase.getInstructions(query);

    return `You are an AI assistant that generates step-by-step instructions for computer tasks.
${knowledgeBaseMatch ? `
I have a reference instruction set that you should follow VERY closely:

${knowledgeBaseMatch.instructions.join('\n')}

IMPORTANT GUIDELINES:
1. Follow the SAME STRUCTURE as the reference instructions
2. Use the SAME TECHNICAL STEPS in the same order
3. Keep all URLs, button names, and specific values EXACTLY the same
4. Maintain the same level of detail for each step
5. Keep all critical information like passwords, addresses, and technical terms identical
6. You may rephrase slightly but preserve the technical accuracy
7. Each instruction must achieve the same technical outcome as its reference
` : `
You need to generate step by step instructions for the task.
These instructions will be used to automate user interface.
You need to generate list of instructions.
While generate instructions, you need to split them by line breaking.
And each instruction should be a small piece of the thing you need to do at specific step.
Make it clear and detailed so I can easily follow the instructions.`}

Do not generate any other system prompt or guidelines.
Only generate instructions.
Do not include anything such as Step 1:, etc.
Only generate instructions.`;
  }
}
