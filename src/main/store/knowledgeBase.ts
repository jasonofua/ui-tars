import { logger } from '@main/logger';

export interface Instruction {
    id: string;
    name: string;
    description: string;
    instructions: string[];
    tags: string[];
}

const knowledgeBase: Instruction[] = [
    {
        id: 'phantom-wallet-creation',
        name: 'Create Phantom Wallet',
        description: 'Instructions for creating a new Phantom wallet from scratch',
        tags: ['wallet', 'phantom', 'crypto', 'setup'],
        instructions: [
            'Open chrome browser',
            'Visit Chrome web store. You can visit https://chromewebstore.google.com/. Sometimes you visit chrome://extensions/ which is incorrect. To do that you need to click google search bar and type https://chromewebstore.google.com/ and hit enter.',
            'In the search bar at the top of the chrome web store search phantom wallet. You need to click search bar and type phantom wallet and hit enter.',
            'Select phantom wallet extension. To do that click on phantom.app',
            'Click on add to chrome, you need to do this to install phantom wallet extension. After you click add to chrome button, you need to click add to extensions button to validate installation. If it is installed, you can skip this step.',
            "Click 'Create a new wallet' button. Once you click Create a new Wallet button, please finish.",
            'Click create a seed phrase wallet. You can find it below Continue with Email button.',
            "Write P@ssw0rd123 into Password input field and Confirm Password input field. You must write exactly same 'P@ssw0rd123'phase into both Password and Confirm Password input fields. After that, check the box marked I agree to the terms of service and click continue button. Do not go back, you need to finish if you can see Recovery Phase panel in the screen.",
            'Ask the user to reveal the phrases. to do that please wait until user clicks continue. After user clicks continue, please click get started.',
            'Hit the extensions button on the browser in the top right hand corner of the browser and pin by hitting the drawing pin button'
        ]
    },
    {
        id: 'raydium-swap',
        name: 'Swap on Raydium',
        description: 'Instructions for performing a token swap on Raydium DEX',
        tags: ['defi', 'swap', 'raydium', 'solana'],
        instructions: [
            'Open chrome browser',
            'Go to https://raydium.io/',
            'Connect Phantom wallet. To do this you need to first click blue Connect Wallet button at the right side. And it will shows the list of wallets. And you need to select Phantom. Sometimes you have trouble to click Connect Wallet Button. Just click Connect Wallet field in te web page.',
            'Click token dropdown button to select target token. You can see the drop down button at right modal below To. You need to click USDC button. Sometimes you are trying to click modal, you need to click drop down button that include USDC. The button is above the Swap button. If you can see select a token modal at the center of the page, just stop execution. After you click the button, it will show you the modal to select token. If you can see the modal, you need to finish.',
            'Search for EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm in the search bar at the top of Select a Token modal. To do this, first click the search bar (you can click the text field that says search by token or paste address) and type EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm and hit enter. Sometimes, you type extra characters. Only search provided string. You sometimes trying to paste the string, but this is wrong. You need to type it.',
            'Click $WIF token at the middle of the modal. You can see the $WIF token at the center of the modal. After modal is closed, you need to finsh. Sometimes you just close the modal by click close button. Do not do this. You must click $WIF token. Sometimes you are struggling to find token. You just need to click the center point of the window at the center of the page. That is the token called dogwifhat.',
            'Click the input field next to the source token dropdown button. You can see the dropdown button at the right modeal below From. The dropdown button is the SOL button. You need to click right empty field. After click input field, type 0.05. Or you can click Max or 50% tag at the top right coner of the Buy window.',
            'Click the Swap button. Swap button is at the bottom of the right window. If it shows confirmation modal, just confirm it to proceed.'
        ]
    }
];

export class KnowledgeBaseStore {
    private static instance: KnowledgeBaseStore;

    private constructor() { }

    static getInstance(): KnowledgeBaseStore {
        if (!KnowledgeBaseStore.instance) {
            KnowledgeBaseStore.instance = new KnowledgeBaseStore();
        }
        return KnowledgeBaseStore.instance;
    }

    private calculateRelevanceScore(query: string, item: Instruction): number {
        const normalizedQuery = query.toLowerCase();
        const queryWords = normalizedQuery.split(' ').filter(word => word.length > 2);
        let score = 0;

        // Name matching (highest priority)
        if (item.name.toLowerCase().includes(normalizedQuery)) {
            score += 100;
        }

        // Individual word matching in name
        queryWords.forEach(word => {
            if (item.name.toLowerCase().includes(word)) {
                score += 10;
            }
        });

        // Tag matching
        item.tags.forEach(tag => {
            if (normalizedQuery.includes(tag)) {
                score += 15;
            }
            queryWords.forEach(word => {
                if (tag.includes(word) || word.includes(tag)) {
                    score += 5;
                }
            });
        });

        // Description matching
        queryWords.forEach(word => {
            if (item.description.toLowerCase().includes(word)) {
                score += 3;
            }
        });

        return score;
    }

    getInstructions(query: string): Instruction | null {
        if (!query) return null;

        // Debug log the input
        console.log('=== Knowledge Base Search Debug ===');
        console.log('Search Query:', query);

        // Calculate scores for all instructions
        const scoredInstructions = knowledgeBase.map(item => {
            const score = this.calculateRelevanceScore(query, item);

            // Debug log the scoring for each item
            console.log('\nScoring for:', {
                id: item.id,
                name: item.name,
                score: score,
                details: {
                    query: query.toLowerCase(),
                    itemName: item.name.toLowerCase(),
                    tags: item.tags
                }
            });

            return {
                instruction: item,
                score: score
            };
        });

        // Debug log sorted scores
        console.log('\nSorted Scores:',
            scoredInstructions
                .sort((a, b) => b.score - a.score)
                .map(item => ({
                    id: item.instruction.id,
                    score: item.score
                }))
        );

        const bestMatch = scoredInstructions
            .sort((a, b) => b.score - a.score)
            .find(item => item.score > 20);

        // Debug log the selected match
        console.log('\nSelected Match:', bestMatch ? {
            id: bestMatch.instruction.id,
            score: bestMatch.score
        } : 'No match found');
        console.log('================================\n');

        return bestMatch ? bestMatch.instruction : null;
    }
} 