import { app, BrowserWindow } from 'electron';
import { logger } from '@main/logger';

// Import API server at the top level
logger.info('[Main] Loading API module...');
import { startApiServer } from './api/index';
logger.info('[Main] API module loaded');

import { createMainWindow } from './window';

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('[Main] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize app
const initialize = async () => {
    logger.info('[Main] Starting application initialization...');

    try {
        // Start the API server first
        logger.info('[Main] Starting API server...');
        try {
            const server = await startApiServer();
            logger.info('[Main] API Server started successfully');

            // Test the API server
            try {
                const response = await fetch('http://127.0.0.1:3333/health');
                const data = await response.json();
                logger.info('[Main] API health check:', data);
            } catch (error) {
                logger.error('[Main] API health check failed:', error);
            }

            // Cleanup on app quit
            app.on('before-quit', () => {
                logger.info('[Main] Application is quitting, cleaning up...');
                if (server) {
                    server.close(() => {
                        logger.info('[Main] API server closed');
                    });
                }
            });
        } catch (apiError) {
            logger.error('[Main] Failed to start API server:', apiError);
            throw apiError;
        }

        // Then create the main window
        logger.info('[Main] Creating main window...');
        const mainWindow = await createMainWindow();
        logger.info('[Main] Main window created successfully');

    } catch (error) {
        logger.error('[Main] Initialization error:', error);
        app.quit();
        return;
    }

    logger.info('[Main] Application initialization completed');
};

// Wait for app to be ready before initializing
app.whenReady().then(() => {
    logger.info('[Main] App ready event received');
    initialize().catch(error => {
        logger.error('[Main] Failed to initialize application:', error);
        app.quit();
    });
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        try {
            createMainWindow();
        } catch (error) {
            logger.error('[Main] Failed to create window on activate:', error);
        }
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Log when app is quitting
app.on('quit', () => {
    logger.info('[Main] Application is quitting');
}); 