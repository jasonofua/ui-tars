import { Request, Response } from 'express';
import { store } from '@main/store/create';
import { StatusEnum, Message } from '@ui-tars/shared/types';
import { logger } from '@main/logger';
import { runAgent } from '@main/store/runAgent';
import { KnowledgeBase } from '@main/store/knowledgeBase';

export interface TaskRequest {
    task: string;
}

export const handleTaskRequest = async (req: Request, res: Response) => {
    try {
        const { task } = req.body as TaskRequest;

        if (!task) {
            return res.status(400).json({
                error: 'Task description is required'
            });
        }

        logger.info('[API] Received task:', task);

        // Get the store's setState and getState functions
        const { setState, getState } = store;

        // Create the message in the correct Message format
        const newMessage: Message = {
            from: 'human',
            value: task
        };

        // Initialize the conversation with the task
        setState((state) => ({
            ...state,
            status: StatusEnum.INIT,
            messages: [newMessage],
            abortController: new AbortController(),
            thinking: true,
            currentTask: task,
            error: null,
            taskQueue: [],
            isRunning: true
        }));

        // Send immediate response since the task is queued
        res.status(200).json({
            status: 'accepted',
            message: 'Task received and processing'
        });

        try {
            // Get instructions from knowledge base
            logger.info('[API] Getting instructions from knowledge base...');
            const knowledgeBase = KnowledgeBase.getInstance();
            const instructions = await knowledgeBase.getInstructions(task);

            if (!instructions) {
                throw new Error('No instructions found in knowledge base');
            }

            // Set the instructions in state
            setState((state) => ({
                ...state,
                instructions: instructions.join('\n')
            }));

            // Let runAgent handle the execution
            logger.info('[API] Running agent...');
            await runAgent(setState, getState);

            logger.info('[API] Task processing completed');

            // Update final state
            setState((state) => ({
                ...state,
                thinking: false,
                isRunning: false,
                status: StatusEnum.END
            }));

        } catch (processError) {
            logger.error('[API] Error during task processing:', processError);

            setState((state) => ({
                ...state,
                thinking: false,
                isRunning: false,
                status: StatusEnum.INIT,
                error: processError instanceof Error ? processError.message : 'Unknown error'
            }));
        }

    } catch (error) {
        logger.error('[API] Task Error:', error);

        store.setState((state) => ({
            ...state,
            thinking: false,
            isRunning: false,
            status: StatusEnum.INIT,
            error: error instanceof Error ? error.message : 'Unknown error'
        }));

        return res.status(500).json({
            error: 'Failed to process task',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}; 