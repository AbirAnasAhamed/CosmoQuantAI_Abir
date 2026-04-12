export interface OrderBookLevel {
    price: number;
    size: number;
    total: number;
}

export interface MarketDepthData {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    walls: { price: number; type: 'buy' | 'sell'; size: number }[];
    currentPrice: number;
}

// Ensure this file is treated as a module or dedicated worker file
// The worker will receive raw string payloads, parse them, calculate walls if needed,
// sort arrays if needed, and send back the clean MarketDepthData object.

self.onmessage = (event: MessageEvent) => {
    try {
        const { type, payload } = event.data;

        if (type === 'PROCESS_MESSAGE') {
            const parsed = JSON.parse(payload);

            if (parsed.type === 'trade') {
                self.postMessage({
                    type: 'TRADE_READY',
                    data: {
                        price: parsed.currentPrice,
                        volume: parsed.recentVolume,
                        timestamp: Date.now()
                    }
                });
                return;
            }

            // In a real scenario, you might do heavy sorting or aggregation here.
            // For now, we assume backend sends bids/asks. We just parse and send back.
            // Example of offloaded work: calculating totals, sorting by price.

            // Assuming payload corresponds directly to MarketDepthData for this example
            // If backend sends raw arrays that need reduction, do it here to save main thread.

            const processedData: MarketDepthData = {
                bids: parsed.bids || [],
                asks: parsed.asks || [],
                walls: parsed.walls || [],
                currentPrice: parsed.currentPrice || 0
            };

            // Calculate totals if they aren't provided by backend (simulating heavy work)
            let bidTotal = 0;
            processedData.bids.forEach(b => {
                bidTotal += b.size;
                b.total = bidTotal; // Overwrite or add total
            });

            let askTotal = 0;
            processedData.asks.forEach(a => {
                askTotal += a.size;
                a.total = askTotal;
            });

            self.postMessage({ type: 'DATA_READY', data: processedData });
        }
    } catch (error) {
        console.error("Worker error processing market depth payload:", error);
    }
};

export { };
