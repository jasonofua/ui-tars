import { RecordMetadata } from '@pinecone-database/pinecone';

export interface PineconeRecord {
    id: string;
    values?: number[];
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