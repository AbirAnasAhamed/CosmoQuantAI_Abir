
import React, { useState, useEffect, useMemo } from 'react';
import { BtcLogo, EthLogo, SolLogo, BinanceLogo, AptosLogo, SeiLogo, SuiLogo, UsdtLogo, MOCK_CRYPTO_NEWS } from '@/constants';

interface TickerItemProps {
    coin: any;
    onClick?: () => void;
}

// A generic style for the ticker items
const TickerItem: React.FC<TickerItemProps> = ({ coin, onClick }) => (
    <div
        className={`flex items-center mx-4 py-2 transition-opacity ${onClick ? 'cursor-pointer hover:opacity-70' : ''}`}
        onClick={onClick}
    >
        {coin.logo}
        <span className="ml-2 font-semibold text-sm text-slate-800 dark:text-slate-200">{coin.symbol}</span>
        <span className="ml-3 font-mono text-sm text-slate-700 dark:text-slate-300">
            ${coin.price > 100 ? coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : coin.price.toFixed(4)}
        </span>
        <span className={`ml-2 font-mono text-xs font-semibold ${coin.change >= 0 ? 'text-brand-success' : 'text-brand-danger'}`}>
            {coin.change >= 0 ? '▲' : '▼'} {Math.abs(coin.change).toFixed(2)}%
        </span>
    </div>
);

// Special styled item for HomePage overlay
const TickerItemOverlay: React.FC<TickerItemProps> = ({ coin, onClick }) => (
    <div
        className={`flex items-center mx-4 py-2 px-4 rounded-lg bg-white/10 dark:bg-black/20 backdrop-blur-sm border border-white/10 dark:border-white/5 transition-colors ${onClick ? 'cursor-pointer hover:bg-white/20' : ''}`}
        onClick={onClick}
    >
        {coin.logo}
        <span className="ml-2 font-semibold text-sm text-slate-800 dark:text-slate-200">{coin.symbol}</span>
        <span className="ml-3 font-mono text-sm text-slate-700 dark:text-slate-300">
            ${coin.price > 100 ? coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : coin.price.toFixed(4)}
        </span>
        <span className={`ml-2 font-mono text-xs font-semibold ${coin.change >= 0 ? 'text-brand-success' : 'text-brand-danger'}`}>
            {coin.change >= 0 ? '▲' : '▼'} {Math.abs(coin.change).toFixed(2)}%
        </span>
    </div>
);

interface MarketTickerProps {
    variant?: 'default' | 'overlay';
    onCoinClick?: (symbol: string) => void;
}

const MarketTicker: React.FC<MarketTickerProps> = ({ variant = 'default', onCoinClick }) => {
    // Basic Logo Map
    const LOGO_MAP: Record<string, React.ReactNode> = {
        'BTC': <BtcLogo className="h-5 w-5" />,
        'ETH': <EthLogo className="h-5 w-5" />,
        'SOL': <SolLogo className="h-5 w-5" />,
        'BNB': <BinanceLogo className="h-5 w-5" />,
        'APT': <AptosLogo className="h-5 w-5" />,
        'SEI': <SeiLogo className="h-5 w-5" />,
        'SUI': <SuiLogo className="h-5 w-5" />,
        'DOGE': <UsdtLogo className="h-5 w-5 text-yellow-500" />,
        'ADA': <UsdtLogo className="h-5 w-5 text-blue-500" />,
        'XRP': <UsdtLogo className="h-5 w-5 text-gray-500" />,
        'DOT': <UsdtLogo className="h-5 w-5 text-pink-500" />,
        'AVAX': <UsdtLogo className="h-5 w-5 text-red-500" />,
        'MATIC': <UsdtLogo className="h-5 w-5 text-purple-500" />,
        'LINK': <UsdtLogo className="h-5 w-5 text-blue-400" />,
        'UNI': <UsdtLogo className="h-5 w-5 text-pink-400" />,
        'TRX': <UsdtLogo className="h-5 w-5 text-red-600" />,
        'LTC': <UsdtLogo className="h-5 w-5 text-gray-400" />,
        'SHIB': <UsdtLogo className="h-5 w-5 text-orange-600" />,
    };

    const [coins, setCoins] = useState<any[]>([]);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let retryTimeout: NodeJS.Timeout;

        const connect = () => {
            // Robust WebSocket URL construction
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Robust WebSocket URL construction: Use window.location.host to leverage the Vite proxy (port 3000)
            const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('✅ Market Ticker connected to Global WS');
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    if (message.type === 'market_overview' && Array.isArray(message.data)) {
                        const newCoins = message.data.map((item: any) => {
                            const symbol = item.symbol.split('/')[0]; // BTC/USDT -> BTC
                            return {
                                id: symbol,
                                logo: LOGO_MAP[symbol] || <UsdtLogo className="h-5 w-5 text-slate-400" />,
                                symbol: symbol,
                                price: parseFloat(item.price),
                                change: parseFloat(item.changePercent)
                            };
                        });
                        setCoins(newCoins);
                    }
                } catch (e) {
                    console.error("Ticker Parse Error:", e);
                }
            };

            socket.onclose = () => {
                // console.log('Ticker WS closed, retrying...');
                retryTimeout = setTimeout(connect, 3000);
            };

            socket.onerror = (err) => {
                // console.error("Ticker WS Error:", err);
                socket?.close();
            };
        };

        connect();

        return () => {
            clearTimeout(retryTimeout);
            if (socket) socket.close();
        };
    }, []);

    // Fallback to initial mock if no data yet (optional, but better to show nothing or loading)
    // Actually, let's just render what we have. If empty, maybe show skeleton or nothing.

    // Duplicate for seamless scroll only if we have enough items
    const tickerItems = coins.length > 5 ? [...coins, ...coins] : coins;
    const ItemComponent = variant === 'overlay' ? TickerItemOverlay : TickerItem;

    if (coins.length === 0) return <div className="h-10 w-full animate-pulse bg-gray-100 dark:bg-white/5 mx-4 rounded"></div>;

    return (
        <div className="w-full overflow-hidden">
            <div className="animate-marquee-slow hover:pause-animation" style={{ animationDuration: '500s' }}>
                <div className="flex whitespace-nowrap">
                    {tickerItems.map((coin, index) => (
                        <ItemComponent
                            key={`${coin.id}-${index}`}
                            coin={coin}
                            onClick={onCoinClick ? () => onCoinClick(coin.symbol) : undefined}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MarketTicker;
