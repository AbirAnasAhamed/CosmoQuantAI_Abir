import api from './client';

export interface SentimentAnalysisResult {
    composite_score: number;
    sentiment_label: string;
    confidence: number;
    entities?: {
        coins: string[];
        orgs: string[];
        events: string[];
    } | null;
    summary?: string;
}

export const sentimentService = {
    getSentimentAnalysis: async (symbol: string, enableNer: boolean = false, model: 'vader' | 'finbert' = 'vader'): Promise<SentimentAnalysisResult> => {
        const response = await api.get<SentimentAnalysisResult>('/sentiment/analysis', {
            params: {
                symbol,
                enable_ner: enableNer,
                model
            }
        });
        return response.data;
    }
};
