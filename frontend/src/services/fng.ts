import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export interface FearAndGreedData {
    value: number;
    value_classification: string;
    timestamp: number;
    time_until_update?: string;
    error?: string;
}

export const getFearAndGreedIndex = async (): Promise<FearAndGreedData> => {
    try {
        const response = await axios.get(`${API_URL}/fng/latest`);
        return response.data;
    } catch (error) {
        console.error('Error fetching Fear & Greed Index:', error);
        return {
            value: 50,
            value_classification: 'Neutral',
            timestamp: Date.now() / 1000,
            error: 'Failed to fetch data',
        };
    }
};
