import { desktopCapturer } from 'electron';
import sharp from 'sharp';
import { logger } from '@main/logger';

export async function captureScreenshot(): Promise<Buffer> {
    try {
        // Get all screens
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1920, height: 1080 }
        });

        // Get the primary display
        const primaryDisplay = sources[0];

        if (!primaryDisplay) {
            throw new Error('No display found');
        }

        // Get the thumbnail
        const thumbnail = primaryDisplay.thumbnail;

        // Convert to buffer and optimize
        const buffer = await sharp(thumbnail.toPNG())
            .jpeg({ quality: 80 }) // Convert to JPEG for smaller size
            .toBuffer();

        return buffer;
    } catch (error) {
        logger.error('[Screenshot] Error capturing screenshot:', error);
        throw error;
    }
} 