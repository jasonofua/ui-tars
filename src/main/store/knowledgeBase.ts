import { PineconeService } from './pinecone.service';
import { logger } from '@main/logger';

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

    private constructor() {
        this.pineconeService = PineconeService.getInstance();
    }

    static getInstance(): KnowledgeBase {
        if (!KnowledgeBase.instance) {
            KnowledgeBase.instance = new KnowledgeBase();
        }
        return KnowledgeBase.instance;
    }

    async getInstructions(query: string): Promise<KnowledgeBaseRecord | null> {
        try {
            const results = await this.pineconeService.searchSimilar(query, 1);

            if (!results.matches || results.matches.length === 0) {
                return null;
            }

            const bestMatch = results.matches[0];

            return {
                id: bestMatch.id,
                name: bestMatch.metadata.name,
                description: bestMatch.metadata.description,
                instructions: bestMatch.metadata.instructions,
                tags: bestMatch.metadata.tags
            };
        } catch (error) {
            logger.error('Failed to search knowledge base:', error);
            throw error;
        }
    }
} 