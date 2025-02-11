import { Pinecone } from '@pinecone-database/pinecone';
import axios from 'axios';
import { PineconeRecord, PineconeConfig } from './pinecone.types';
import { logger } from '@main/logger';

export class PineconeService {
    private static instance: PineconeService;
    private client: Pinecone | null = null;
    private config: PineconeConfig | null = null;
    private index: any = null;

    private constructor() { }

    static getInstance(): PineconeService {
        if (!PineconeService.instance) {
            PineconeService.instance = new PineconeService();
        }
        return PineconeService.instance;
    }

    async initialize(config: PineconeConfig) {
        try {
            this.config = config;
            this.client = new Pinecone({
                apiKey: config.apiKey
            });

            this.index = this.client.index(config.indexName);
            await this.client.listIndexes();
            logger.info('Pinecone client initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Pinecone client:', error);
            throw error;
        }
    }

    private async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await axios.post(
                process.env.VLM_BASE_URL as string,
                {
                    inputs: text,
                    parameters: {
                        truncate: true
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.VLM_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            logger.info('Embedding response:', response.data);

            return response.data;
        } catch (error) {
            logger.error('Failed to generate embedding:', error);
            if (axios.isAxiosError(error)) {
                logger.error('Response data:', error.response?.data);
                logger.error('Request URL:', error.config?.url);
                logger.error('Request payload:', error.config?.data);
            }
            throw error;
        }
    }

    async addRecord(record: PineconeRecord) {
        if (!this.client || !this.config || !this.index) {
            throw new Error('Pinecone client not initialized');
        }

        try {
            const textToEmbed = `${record.metadata.name} ${record.metadata.description} ${record.metadata.instructions.join(' ')}`;
            const vector = await this.generateEmbedding(textToEmbed);

            const vectorRecord = {
                id: record.id,
                values: vector,
                metadata: record.metadata
            };

            await this.index.upsert([vectorRecord]);
            logger.info(`Successfully added record ${record.id} to Pinecone`);
        } catch (error) {
            logger.error('Failed to add record to Pinecone:', error);
            throw error;
        }
    }

    async searchSimilar(query: string, topK: number = 5) {
        if (!this.client || !this.config || !this.index) {
            throw new Error('Pinecone client not initialized');
        }

        try {
            const queryVector = await this.generateEmbedding(query);

            const results = await this.index.query({
                vector: queryVector,
                topK,
                includeMetadata: true
            });

            return results;
        } catch (error) {
            logger.error('Failed to search Pinecone:', error);
            throw error;
        }
    }
} 