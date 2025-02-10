import retry from 'async-retry';
import mitt, { Emitter, Handler } from 'mitt';

import {
  IMAGE_PLACEHOLDER,
  MAX_LOOP_COUNT,
  VlmModeEnum,
} from '@ui-tars/shared/constants/vlm';
import { ScreenshotResult, StatusEnum } from '@ui-tars/shared/types';
import { ComputerUseUserData, Conversation } from '@ui-tars/shared/types/data';
import { ShareVersion } from '@ui-tars/shared/types/share';
import sleep from '@ui-tars/shared/utils/sleep';

import { logger } from '@main/logger';

import { markClickPosition } from '../utils/image';
import { Desktop } from './device';
import { VLM, VlmRequest } from './llm/base';
import { GPT4oReasoning } from './llm/gpt4oReasoning';
import { getSummary, processVlmParams } from './utils';

type AgentEvents = {
  data: ComputerUseUserData;
  error: Partial<ComputerUseUserData> & {
    code: number;
    error: string;
    stack?: string;
  };
};

export class ComputerUseAgent {
  private readonly logger = logger;
  private conversations: Conversation[] = [];
  private startTime: number;
  private status: StatusEnum;
  private lastSentIndex = -1;
  private mode: VlmModeEnum = VlmModeEnum.Agent;
  private emitter: Emitter<AgentEvents>;

  constructor(
    private readonly config: {
      systemPrompt: string;
      abortController: AbortController | null;
      instruction: string;
      device: Desktop;
      vlm: VLM;
      gpt4o: GPT4oReasoning;
    },
  ) {
    this.emitter = mitt<AgentEvents>();
    this.status = StatusEnum.INIT;
    this.startTime = Date.now();
  }

  on<Key extends keyof AgentEvents>(
    type: Key,
    handler: Handler<AgentEvents[Key]>,
  ): void {
    this.emitter.on(type, handler);
  }

  emit<Key extends keyof AgentEvents>(
    type: Key,
    event: AgentEvents[Key],
  ): void {
    this.emitter.emit(type, event);
  }

  private toUserDataFormat(): ComputerUseUserData {
    const { config } = this;
    return {
      version: ShareVersion.V1,
      systemPrompt: config.systemPrompt,
      instruction: config.instruction,
      modelName: `${config.vlm.vlmModel}`,
      mode: this.mode,
      status: this.status,
      logTime: this.startTime,
      conversations: this.conversations,
    };
  }

  private emitData(
    newUserData: Omit<Partial<ComputerUseUserData>, 'conversations'> = {},
  ) {
    const newConversations = this.conversations.slice(this.lastSentIndex + 1);

    const userDataFormat = this.toUserDataFormat();
    const userData: ComputerUseUserData = {
      ...userDataFormat,
      ...newUserData,
      conversations: newConversations,
    };

    this.logger.info('[emitData] status', userData?.status);

    this.emit('data', userData);
    this.lastSentIndex = this.conversations.length - 1;
  }

  private async reasonWithGPT4o(instruction: string): Promise<string[]> {
    const result = await this.config.gpt4o.invoke({
      conversations: [{ from: 'human', value: instruction }],
    });
    return result.prediction.split('\n'); // Assuming the prediction is a newline-separated list of instructions
  }

  async runAgentLoop({
    loopWaitTime,
  }: {
    loopWaitTime: (actionType: string) => number;
  }) {
    console.log('\n=== Computer Use Agent Debug ===');
    console.log('Initial User Input:', this.config.instruction);

    const { config, logger } = this;
    const { abortController, device, vlm, instruction } = config;

    // Use GPT-4o to generate instructions instead of hardcoded array
    console.log('Before GPT4o Processing');
    const filteredInstructions = await this.reasonWithGPT4o(instruction);
    console.log('Generated Instructions:', filteredInstructions);
    console.log('============================\n');

    logger.debug('Generated simple instructions:', filteredInstructions);
    this.status = StatusEnum.RUNNING;

    for (const simpleInstruction of filteredInstructions) {
      if (this.status !== StatusEnum.RUNNING) {
        logger.warn('Agent is not in RUNNING status, breaking the loop.');
        break;
      }

      // Clear the conversation history for each new instruction
      this.conversations = [];
      this.lastSentIndex = -1;

      this.addConversation({
        from: 'human',
        value: simpleInstruction,
        timing: {
          start: Date.now(),
          end: Date.now(),
          cost: 0,
        },
      });

      let loopCnt = 0;
      let snapshotErrCnt = 0;

      logger.info(
        '[runAgentLoop] start processing instruction:',
        simpleInstruction,
      );

      this.emitData();

      try {
        while (this.status === StatusEnum.RUNNING) {
          if (abortController?.signal?.aborted) {
            logger.info('Abort signal received, ending loop.');
            this.status = StatusEnum.END;
            this.emitData();
            break;
          }

          loopCnt += 1;
          logger.info(
            `Loop iteration ${loopCnt}, snapshot error count: ${snapshotErrCnt}`,
          );
          // logger.debug('=======', MAX_LOOP_COUNT);
          if (loopCnt >= 8 || snapshotErrCnt >= 10) {
            this.status = StatusEnum.MAX_LOOP;
            this.emitData({
              errMsg:
                loopCnt >= MAX_LOOP_COUNT
                  ? 'Exceeds the maximum number of loops'
                  : 'Too many screenshot failures',
            });
            break;
          }

          let start = Date.now();
          const snapshot: ScreenshotResult = await retry(
            async () => device.screenshot(),
            {
              retries: 5,
              onRetry: (error, number) => {
                logger.warn(
                  `[snapshot_retry] Failed attempt (${number}/5)`,
                  error,
                );
              },
            },
          );

          const isValidImage = !!(
            snapshot?.base64 &&
            snapshot?.width &&
            snapshot?.height
          );
          logger.info('[isValidImage]', isValidImage);

          if (!isValidImage) {
            loopCnt -= 1;
            snapshotErrCnt += 1;
            continue;
          }

          logger.info(
            '[snapshot] width',
            snapshot.width,
            'height',
            snapshot.height,
          );

          this.addConversation({
            from: 'human',
            value: IMAGE_PLACEHOLDER,
            screenshotBase64: snapshot.base64,
            screenshotContext: {
              size: {
                width: snapshot.width,
                height: snapshot.height,
              },
            },
            timing: {
              start,
              end: Date.now(),
              cost: Date.now() - start,
            },
          });
          this.emitData();
          start = Date.now();

          const vlmParams = {
            ...processVlmParams(this.toVlmModelFormat()),
          };
          // logger.info('[vlmParams_conversations]:', vlmParams.conversations);
          // logger.info('[vlmParams_images_len]:', vlmParams.images.length);

          const vlmRes = await vlm.invoke(vlmParams, {
            abortController,
          });

          if (!vlmRes?.prediction) {
            logger.warn(
              'No prediction received, continuing to next iteration.',
            );
            continue;
          }

          const { parsed } = await device.nl2Command(vlmRes.prediction);

          let eomImage;
          if (parsed?.length && snapshot) {
            eomImage = await markClickPosition({
              ...snapshot,
              parsed,
            }).catch((e) => {
              logger.error('[markClickPosition error]:', e);
              return '';
            });
          }
          const predictionSummary = getSummary(vlmRes.prediction);
          this.addConversation({
            from: 'gpt',
            value: predictionSummary,
            timing: {
              start,
              end: Date.now(),
              cost: Date.now() - start,
            },
            screenshotContext: {
              size: {
                width: snapshot.width,
                height: snapshot.height,
              },
            },
            screenshotBase64WithElementMarker: eomImage,
            predictionParsed: parsed,
            reflections: vlmRes.reflections,
          });
          this.emitData();

          logger.info('[parsed]', parsed, '[parsed_length]', parsed.length);

          for (const prediction of parsed) {
            const actionType = prediction.action_type;

            logger.info(
              '[parsed_prediction]',
              prediction,
              '[actionType]',
              actionType,
            );

            switch (actionType) {
              case 'error_env':
              case 'call_user':
              case 'finished':
                this.status = StatusEnum.END;
                break;
              case 'max_loop':
                this.status = StatusEnum.MAX_LOOP;
                break;
              default:
                this.status = StatusEnum.RUNNING;
            }
            this.emitData();

            if (
              !['wait'].includes(actionType) &&
              !abortController?.signal?.aborted
            ) {
              await device.execute(prediction, snapshot.width, snapshot.height);
            }

            await sleep(loopWaitTime?.(actionType) ?? 1500);
          }

          logger.info(`===== End of loop iteration ${loopCnt} =====\n\n\n`);
        }
      } catch (error) {
        console.error('Error in runAgentLoop:', error);
        // this.emit('error', {
        //   ...this.toUserDataFormat(),
        //   code: -1,
        //   error: 'Service exception',
        //   stack: `${error}`,
        // });
        throw error;
      } finally {
        this.status = StatusEnum.RUNNING; // Ensure the status is set to RUNNING for the next instruction
        this.emitData();
        device?.tearDown();
        logger.info('Agent finally [this.status]', this.status);
      }
    }
    this.status = StatusEnum.END; // Set status to END after all instructions are processed
    this.emitData();
  }

  private toVlmModelFormat(): VlmRequest {
    return {
      conversations: this.conversations.map((conv, idx) => {
        if (idx === 0 && conv.from === 'human') {
          return {
            from: conv.from,
            value: `${this.config.systemPrompt}${conv.value}`,
          };
        }
        return {
          from: conv.from,
          value: conv.value,
        };
      }),
      images: this.conversations
        .filter(
          (conv): conv is Conversation & { screenshotBase64: string } =>
            conv.value === IMAGE_PLACEHOLDER && !!conv.screenshotBase64,
        )
        .map((conv) => conv.screenshotBase64),
    };
  }

  addConversation(conversation: Conversation) {
    this.conversations.push(conversation);
  }
}
