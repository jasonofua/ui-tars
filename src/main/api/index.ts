import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { handleTaskRequest } from './taskHandler';
import { logger } from '@main/logger';
import { Server } from 'http';
import { captureScreenshot } from '@main/utils/screenshot';
import { activeScreenshotIntervals } from '@main/store/screenshot';

// At the very top of the file
console.log('[API] Loading API module...');
logger.info('[API] Loading API module...');

const app: Express = express();
const port: number = parseInt(process.env.API_PORT || '3333', 10);
const host: string = '0.0.0.0';

logger.info(`[API] Configuring server with port ${port} and host ${host}`);

// Middleware
app.use(cors({
    origin: '*', // Allow all origins in dev
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Debug middleware to log all requests
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`[API] ${req.method} ${req.url}`);
    next();
});

// Basic health check endpoint
app.get('/health', (req: Request, res: Response) => {
    logger.info('[API] Health check requested');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Task endpoint
app.post('/v1/task', handleTaskRequest);

// Screenshot endpoints
app.post('/v1/screenshot/start', async (req: Request, res: Response) => {
    try {
        const { taskId, interval = 5000 } = req.body; // interval in milliseconds

        // Stop any existing interval for this taskId
        if (activeScreenshotIntervals.has(taskId)) {
            clearInterval(activeScreenshotIntervals.get(taskId));
        }

        // Create a WebSocket connection for this task if needed
        // For now, we'll just save screenshots to a buffer

        // Start periodic screenshots
        const intervalId = setInterval(async () => {
            try {
                const screenshot = await captureScreenshot();
                // You could emit this via WebSocket, save to disk, or store in memory
                logger.info(`[Screenshot] Captured for task ${taskId}, size: ${screenshot.length} bytes`);
            } catch (error) {
                logger.error(`[Screenshot] Error capturing for task ${taskId}:`, error);
            }
        }, interval);

        activeScreenshotIntervals.set(taskId, intervalId);

        res.json({
            status: 'success',
            message: 'Screenshot monitoring started',
            taskId
        });

    } catch (error) {
        logger.error('[Screenshot] Error starting monitoring:', error);
        res.status(500).json({
            error: 'Failed to start screenshot monitoring',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

app.post('/v1/screenshot/stop', (req: Request, res: Response) => {
    const { taskId } = req.body;

    if (activeScreenshotIntervals.has(taskId)) {
        clearInterval(activeScreenshotIntervals.get(taskId));
        activeScreenshotIntervals.delete(taskId);
        res.json({ status: 'success', message: 'Screenshot monitoring stopped' });
    } else {
        res.status(404).json({ error: 'No active monitoring found for this task' });
    }
});

// Get latest screenshot
app.get('/v1/screenshot/:taskId', async (req: Request, res: Response) => {
    try {
        const screenshot = await captureScreenshot();
        res.contentType('image/jpeg');
        res.send(screenshot);
    } catch (error) {
        logger.error('[Screenshot] Error getting screenshot:', error);
        res.status(500).json({
            error: 'Failed to capture screenshot',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Cleanup on server shutdown
process.on('SIGTERM', () => {
    // Clear all intervals
    for (const [taskId, intervalId] of activeScreenshotIntervals) {
        clearInterval(intervalId);
        activeScreenshotIntervals.delete(taskId);
    }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('[API] Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message
    });
});

const findAvailablePort = async (startPort: number): Promise<number> => {
    const server = require('net').createServer();

    return new Promise((resolve, reject) => {
        let port = startPort;

        const tryPort = () => {
            server.listen(port, host, () => {
                server.once('close', () => {
                    resolve(port);
                });
                server.close();
            });

            server.on('error', () => {
                port++;
                tryPort();
            });
        };

        tryPort();
    });
};

export const startApiServer = async (): Promise<Server> => {
    logger.info('[API] Attempting to start API server...');

    const port = await findAvailablePort(3333);
    logger.info(`[API] Using port ${port}`);

    return new Promise((resolve, reject) => {
        try {
            logger.info('[API] Creating server instance...');
            const server = app.listen(port, host);

            server.on('listening', () => {
                const addr = server.address();
                const addressInfo = typeof addr === 'string'
                    ? addr
                    : `${addr?.address}:${addr?.port}`;
                logger.info(`[API] Server is listening on ${addressInfo}`);
                resolve(server);
            });

            server.on('error', (error: NodeJS.ErrnoException) => {
                logger.error('[API] Server error:', {
                    code: error.code,
                    message: error.message,
                    stack: error.stack
                });

                if (error.code === 'EADDRINUSE') {
                    logger.error(`[API] Port ${port} is already in use`);
                }
                reject(error);
            });

        } catch (error) {
            logger.error('[API] Failed to initialize server:', error);
            reject(error);
        }
    });
};

logger.info('[API] API module loaded successfully');

export { app }; 