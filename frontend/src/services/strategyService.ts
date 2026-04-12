import client from "./client";

export interface AIStrategyConfig {
    strategy_name: string;
    description: string;
    leverage: number;
    stop_loss: number;
    take_profit: number;
    timeframe: string;
    amount_per_trade: number;
}

export const strategyService = {
    getAllStrategies: async (): Promise<string[]> => {
        try {
            // এটি ব্যাকএন্ডের /api/v1/strategies/list এন্ডপয়েন্টে কল করবে
            const response = await client.get("/strategies/list");
            return response.data;
        } catch (error) {
            console.error("Failed to fetch strategies:", error);
            // যদি ফেইল করে, অন্তত বেসিকগুলো রিটার্ন করবে
            return ["RSI Strategy", "MACD Trend", "Bollinger Bands"];
        }
    },

    generateStrategyFromPrompt: async (prompt: string): Promise<AIStrategyConfig> => {
        const response = await client.post("/strategies/generate", { prompt });
        return response.data;
    }
};
