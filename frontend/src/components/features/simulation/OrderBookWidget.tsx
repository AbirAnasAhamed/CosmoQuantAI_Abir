import React, { useMemo } from 'react';

interface OrderBookLevel {
    price: number;
    volume: number;
    total: number;
    depth: number; // Percentage relative to max volume in view
}

interface OrderBookWidgetProps {
    bids: number[][]; // [[price, vol], ...]
    asks: number[][]; // [[price, vol], ...]
    currentPrice: number;
    symbol: string;
}

const OrderBookWidget: React.FC<OrderBookWidgetProps> = ({ bids, asks, currentPrice, symbol }) => {

    const processedBids = useMemo(() => {
        let total = 0;
        const maxVol = Math.max(...bids.map(b => b[1]), ...asks.map(a => a[1]), 1); // Avoid div by zero
        return bids.map(([price, vol]) => {
            total += vol;
            return { price, volume: vol, total, depth: (vol / maxVol) * 100 };
        });
    }, [bids, asks]);

    const processedAsks = useMemo(() => {
        let total = 0;
        const maxVol = Math.max(...bids.map(b => b[1]), ...asks.map(a => a[1]), 1);
        // Asks usually sorted low to high (best ask first). 
        // We received them as [[price, vol]...]. Assuming generator sorts them or we sort them now.
        // Generator sends: Price + spread ... Price + spread + step. So usually low to high.
        return asks.map(([price, vol]) => {
            total += vol;
            return { price, volume: vol, total, depth: (vol / maxVol) * 100 };
        }).reverse(); // Display highest price at top for typical vertical order book? 
        // Actually typical vertical order book:
        // ASKS (High -> Low)
        // PRICE
        // BIDS (High -> Low)
        // Let's stick to that.
    }, [bids, asks]);

    // Check if we need to sort Asks before reversing? 
    // Generator: `current_ask += step`. So index 0 is lowest ask (best ask). Index N is highest ask.
    // So if we reverse, we get Highest Ask -> Lowest Ask (Best). This aligns with:
    // Top of component -> Highest Ask
    // ...
    // Bottom of Asks -> Lowest Ask (Best)
    // --- SPREAD ---
    // Top of Bids -> Highest Bid (Best)
    // ...
    // Bottom of Bids -> Lowest Bid

    return (
        <div className="flex flex-col h-full bg-slate-900 text-xs font-mono select-none overflow-hidden">
            <div className="flex justify-between px-2 py-1 border-b border-slate-800 text-slate-500 bg-slate-800/50">
                <span>Price ({symbol.split('/')[1]})</span>
                <span>Amount</span>
            </div>

            {/* Asks (Red) - Top Half */}
            <div className="flex-1 overflow-hidden flex flex-col justify-end">
                {processedAsks.map((level, i) => (
                    <div key={`ask-${level.price}`} className="flex justify-between items-center px-2 py-0.5 relative group hover:bg-slate-800 cursor-pointer transition-colors">
                        <span className="text-red-500 z-10">{level.price.toFixed(2)}</span>
                        <span className="text-slate-300 z-10">{level.volume.toFixed(0)}</span>

                        {/* Depth Bar */}
                        <div
                            className="absolute top-0 right-0 h-full bg-red-500/10 transition-all duration-300"
                            style={{ width: `${level.depth}%` }}
                        />
                    </div>
                ))}
            </div>

            {/* Current Price / Spread Indicator */}
            <div className="py-1 text-center font-bold text-lg bg-slate-800 border-y border-slate-700 text-white my-1">
                {currentPrice.toFixed(2)} <span className="text-xs text-slate-400 font-normal">USD</span>
            </div>

            {/* Bids (Green) - Bottom Half */}
            <div className="flex-1 overflow-hidden">
                {processedBids.map((level, i) => (
                    <div key={`bid-${level.price}`} className="flex justify-between items-center px-2 py-0.5 relative group hover:bg-slate-800 cursor-pointer transition-colors">
                        <span className="text-green-500 z-10">{level.price.toFixed(2)}</span>
                        <span className="text-slate-300 z-10">{level.volume.toFixed(0)}</span>
                        {/* Depth Bar */}
                        <div
                            className="absolute top-0 right-0 h-full bg-green-500/10 transition-all duration-300"
                            style={{ width: `${level.depth}%` }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OrderBookWidget;
