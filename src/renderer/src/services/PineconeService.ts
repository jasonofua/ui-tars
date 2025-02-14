import { Pinecone } from '@pinecone-database/pinecone';

export interface PineconeRecord {
    id: string;
    metadata: {
        name: string;
        description: string;
        instructions: string[];
        tags: string[];
    };
}

export interface PineconeConfig {
    apiKey: string;
    environment: string;
    indexName: string;
}

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
            console.log('Pinecone client initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Pinecone client:', error);
            throw error;
        }
    }

    async getRecord(id: string): Promise<PineconeRecord | null> {
        try {
            if (!this.client || !this.config || !this.index) {
                throw new Error('Pinecone client not initialized');
            }

            const response = await this.index.fetch([id]);
            console.log('Raw Pinecone response:', JSON.stringify(response, null, 2));

            if (!response.records || !response.records[id]) {
                console.log('No record found for ID:', id);
                return null;
            }

            const record = response.records[id];
            console.log('Raw record from Pinecone:', JSON.stringify(record, null, 2));

            // Validate record structure
            if (!record.metadata || !record.metadata.name) {
                console.error('Invalid record structure:', record);
                return null;
            }

            // Create a clean record
            const foundRecord: PineconeRecord = {
                id: record.id,
                metadata: {
                    name: record.metadata.name,
                    description: record.metadata.description,
                    instructions: record.metadata.instructions,
                    tags: record.metadata.tags
                }
            };

            console.log('Formatted record:', JSON.stringify(foundRecord, null, 2));
            return foundRecord;
        } catch (error) {
            console.error('Failed to get record from Pinecone:', error);
            throw error;
        }
    }
} 