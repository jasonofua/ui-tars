import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { PineconeRecord, PineconeConfig } from './pinecone.types';
import { logger } from '@main/logger';

export class PineconeService {
    private static instance: PineconeService;
    private client: Pinecone | null = null;
    private config: PineconeConfig | null = null;
    private index: any = null;
    private openai: OpenAI;

    private constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

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
            const response = await this.openai.embeddings.create({
                model: "text-embedding-3-small",
                input: text,
                encoding_format: "float"
            });

            logger.info('Generated embedding with dimensions:', response.data[0].embedding.length);
            return response.data[0].embedding;
        } catch (error) {
            logger.error('Failed to generate OpenAI embedding:', error);
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

    async deleteRecord(id: string): Promise<void> {
        if (!this.client || !this.config || !this.index) {
            throw new Error('Pinecone client not initialized');
        }

        try {
            await this.index.deleteOne(id);
            logger.info(`Successfully deleted record ${id} from Pinecone`);
        } catch (error) {
            logger.error('Failed to delete record from Pinecone:', error);
            throw error;
        }
    }

    async updateRecord(record: PineconeRecord): Promise<void> {
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

            // Pinecone upsert will update if ID exists
            await this.index.upsert([vectorRecord]);
            logger.info(`Successfully updated record ${record.id} in Pinecone`);
        } catch (error) {
            logger.error('Failed to update record in Pinecone:', error);
            throw error;
        }
    }

    async getRecord(id: string): Promise<PineconeRecord | null> {
        if (!this.client || !this.config || !this.index) {
            throw new Error('Pinecone client not initialized');
        }

        try {
            logger.info(`Fetching record with ID: ${id}`);
            const response = await this.index.fetch([id]);

            logger.info('Pinecone fetch response:', response);

            if (!response.records || !response.records[id]) {
                logger.info(`No record found with ID: ${id}`);
                return null;
            }

            const record = response.records[id];
            logger.info(`Found record: ${JSON.stringify(record.metadata)}`);

            return {
                id,
                metadata: record.metadata
            };
        } catch (error) {
            logger.error('Failed to get record from Pinecone:', error);
            throw error;
        }
    }
} 