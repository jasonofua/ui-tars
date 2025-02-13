/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createStore } from 'zustand/vanilla';
import { createDispatch } from 'zutron/main';

import { StatusEnum } from '@ui-tars/shared/types';
import { Conversation } from '@ui-tars/shared/types/data';

import * as env from '@main/env';
import {
  LauncherWindow,
  closeSettingsWindow,
  createSettingsWindow,
  showWindow,
} from '@main/window/index';

import { closeScreenMarker } from './ScreenMarker';
import { runAgent } from './runAgent';
import { SettingStore } from './setting';
import { AppState, DispatchResult } from './types';
import { PineconeService } from './pinecone.service';
import { logger } from '@main/logger';

export const store = createStore<AppState>(
  (set, get) =>
    ({
      theme: 'light',
      restUserData: null,
      instructions: '',
      status: StatusEnum.INIT,
      messages: [],
      settings: null,
      getSetting: (key) => SettingStore.get(key),
      ensurePermissions: {},

      abortController: null,
      thinking: false,

      // dispatch for renderer
      OPEN_SETTINGS_WINDOW: () => {
        createSettingsWindow();
      },

      CLOSE_SETTINGS_WINDOW: () => {
        closeSettingsWindow();
      },

      OPEN_LAUNCHER: () => {
        LauncherWindow.getInstance().show();
      },

      CLOSE_LAUNCHER: () => {
        LauncherWindow.getInstance().blur();
        LauncherWindow.getInstance().hide();
      },

      GET_SETTINGS: () => {
        const settings = SettingStore.getStore();
        set({ settings });
      },

      SET_SETTINGS: (state) => {
        SettingStore.setStore(state);
        set({ settings: SettingStore.getStore() });
      },

      GET_ENSURE_PERMISSIONS: async () => {
        if (env.isMacOS) {
          const { ensurePermissions } = await import(
            '@main/utils/systemPermissions'
          );
          set({ ensurePermissions: ensurePermissions() });
        } else {
          set({
            ensurePermissions: {
              screenCapture: true,
              accessibility: true,
            },
          });
        }
      },

      RUN_AGENT: async () => {
        if (get().thinking) {
          return;
        }

        set({ abortController: new AbortController(), thinking: true });

        await runAgent(set, get);

        set({ thinking: false });
      },
      STOP_RUN: () => {
        set({ status: StatusEnum.END, thinking: false });
        showWindow();
        get().abortController?.abort();

        closeScreenMarker();
      },
      SET_INSTRUCTIONS: (instructions) => {
        set({
          instructions,
        });
      },
      SET_MESSAGES: (messages: Conversation[]) => set({ messages }),
      CLEAR_HISTORY: () => {
        set({ status: StatusEnum.END, messages: [], thinking: false });
      },
      ADD_PINECONE_RECORD: async (record) => {
        try {
          const settings = SettingStore.getStore();
          if (!settings.pineconeApiKey || !settings.pineconeEnvironment || !settings.pineconeIndex) {
            throw new Error('Pinecone configuration is incomplete');
          }

          const pineconeService = PineconeService.getInstance();
          await pineconeService.initialize({
            apiKey: settings.pineconeApiKey,
            environment: settings.pineconeEnvironment,
            indexName: settings.pineconeIndex,
          });

          await pineconeService.addRecord(record);
          return true;
        } catch (error) {
          logger.error('Failed to add record to Pinecone:', error);
          throw error;
        }
      },
      UPDATE_PINECONE_RECORD: async (record) => {
        try {
          const settings = SettingStore.getStore();
          if (!settings.pineconeApiKey || !settings.pineconeEnvironment || !settings.pineconeIndex) {
            throw new Error('Pinecone configuration is incomplete');
          }

          const pineconeService = PineconeService.getInstance();
          await pineconeService.initialize({
            apiKey: settings.pineconeApiKey,
            environment: settings.pineconeEnvironment,
            indexName: settings.pineconeIndex,
          });

          await pineconeService.updateRecord(record);
          return true;
        } catch (error) {
          logger.error('Failed to update record in Pinecone:', error);
          throw error;
        }
      },
      GET_PINECONE_RECORD: async (id: string): Promise<DispatchResult> => {
        try {
          const settings = SettingStore.getStore();
          if (!settings.pineconeApiKey || !settings.pineconeEnvironment || !settings.pineconeIndex) {
            throw new Error('Pinecone configuration is incomplete');
          }

          const pineconeService = PineconeService.getInstance();
          await pineconeService.initialize({
            apiKey: settings.pineconeApiKey,
            environment: settings.pineconeEnvironment,
            indexName: settings.pineconeIndex,
          });

          logger.info('Getting record from Pinecone:', id);
          const record = await pineconeService.getRecord(id);
          logger.info('Got record from store:', JSON.stringify(record, null, 2));

          // Return null if no record found
          if (!record) {
            logger.info('No record found, returning null payload');
            return { payload: null };
          }

          // Create a clean record object
          const cleanRecord = {
            id: record.id,
            metadata: {
              name: record.metadata.name,
              description: record.metadata.description,
              instructions: record.metadata.instructions,
              tags: record.metadata.tags
            }
          };

          logger.info('Returning clean record to renderer:', JSON.stringify(cleanRecord, null, 2));
          return { payload: cleanRecord };

        } catch (error) {
          logger.error('Failed to get record from Pinecone:', error);
          throw error;
        }
      },
      DELETE_PINECONE_RECORD: async (id: string): Promise<boolean> => {
        try {
          const settings = SettingStore.getStore();
          if (!settings.pineconeApiKey || !settings.pineconeEnvironment || !settings.pineconeIndex) {
            throw new Error('Pinecone configuration is incomplete');
          }

          const pineconeService = PineconeService.getInstance();
          await pineconeService.initialize({
            apiKey: settings.pineconeApiKey,
            environment: settings.pineconeEnvironment,
            indexName: settings.pineconeIndex,
          });

          logger.info('Deleting record from Pinecone:', id);
          await pineconeService.deleteRecord(id);
          logger.info('Successfully deleted record:', id);

          return true;
        } catch (error) {
          logger.error('Failed to delete record from Pinecone:', error);
          throw error;
        }
      },
    }) satisfies AppState,
);

export const dispatch = createDispatch(store);
