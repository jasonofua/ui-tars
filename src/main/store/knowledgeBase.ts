import { PineconeService } from './pinecone.service';
import { logger } from '@main/logger';
import { SettingStore } from './setting';

export interface KnowledgeBaseRecord {
    id: string;
    name: string;
    description: string;
    instructions: string[];
    tags: string[];
}

export class KnowledgeBase {
    private static instance: KnowledgeBase;
    private pineconeService: PineconeService;
    private initialized: boolean = false;

    private constructor() {
        this.pineconeService = PineconeService.getInstance();
    }

    static getInstance(): KnowledgeBase {
        if (!KnowledgeBase.instance) {
            KnowledgeBase.instance = new KnowledgeBase();
        }
        return KnowledgeBase.instance;
    }

    private async ensureInitialized() {
        if (!this.initialized) {
            const settings = SettingStore.getStore();
            if (!settings.pineconeApiKey || !settings.pineconeEnvironment || !settings.pineconeIndex) {
                throw new Error('Pinecone configuration is incomplete');
            }

            await this.pineconeService.initialize({
                apiKey: settings.pineconeApiKey,
                environment: settings.pineconeEnvironment,
                indexName: settings.pineconeIndex
            });
            this.initialized = true;
        }
    }

    async getInstructions(query: string): Promise<string[] | null> {
        try {
            await this.ensureInitialized();

            const results = await this.pineconeService.searchSimilar(query, 1);

            if (!results.matches || results.matches.length === 0) {
                return null;
            }

            const bestMatch = results.matches[0];
            return bestMatch.metadata.instructions;
        } catch (error) {
            logger.error('Failed to get instructions from knowledge base:', error);
            throw error;
        }
    }
}

// Create and export a singleton instance
export const knowledgeBase = KnowledgeBase.getInstance();

// Add back the store functionality in a separate class
export class KnowledgeBaseStore {
    private static instance: KnowledgeBaseStore;
    private pineconeService: PineconeService;

    private constructor() {
        this.pineconeService = PineconeService.getInstance();
    }

    static getInstance(): KnowledgeBaseStore {
        if (!KnowledgeBaseStore.instance) {
            KnowledgeBaseStore.instance = new KnowledgeBaseStore();
        }
        return KnowledgeBaseStore.instance;
    }

    async addRecord(record: KnowledgeBaseRecord): Promise<void> {
        try {
            await this.pineconeService.addRecord({
                id: record.id,
                metadata: {
                    name: record.name,
                    description: record.description,
                    instructions: record.instructions,
                    tags: record.tags
                }
            });
            logger.info(`Added record ${record.id} to knowledge base`);
        } catch (error) {
            logger.error('Failed to add record to knowledge base:', error);
            throw error;
        }
    }

    async deleteRecord(id: string): Promise<void> {
        try {
            await this.pineconeService.deleteRecord(id);
            logger.info(`Deleted record ${id} from knowledge base`);
        } catch (error) {
            logger.error('Failed to delete record from knowledge base:', error);
            throw error;
        }
    }

    async getAllRecords(): Promise<KnowledgeBaseRecord[]> {
        try {
            const results = await this.pineconeService.searchSimilar('', 10000);
            return results.matches.map(match => ({
                id: match.id,
                name: match.metadata.name,
                description: match.metadata.description,
                instructions: match.metadata.instructions,
                tags: match.metadata.tags
            }));
        } catch (error) {
            logger.error('Failed to get all records from knowledge base:', error);
            throw error;
        }
    }
} 