import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { handleTaskRequest } from './taskHandler';
import { logger } from '@main/logger';
import { Server } from 'http';

// At the very top of the file
console.log('[API] Loading API module...');
logger.info('[API] Loading API module...');

const app: Express = express();
const port: number = parseInt(process.env.API_PORT || '3333', 10);
const host: string = '127.0.0.1';

logger.info(`[API] Configuring server with port ${port} and host ${host}`);

// Middleware
app.use(cors());
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