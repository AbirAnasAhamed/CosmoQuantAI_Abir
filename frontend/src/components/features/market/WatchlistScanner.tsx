import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { marketDepthService } from '../../../services/marketDepthService';
import { calculateEMA, calculateBollingerBands, calculateMACD } from '../../../utils/indicators';
import { IndicatorSettings } from './IndicatorSelector';

interface WatchlistScannerProps {
    settings: IndicatorSettings;
    exchange: string;
    interval: string;
}

const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "MATIC/USDT"];

interface ScanResult {
    symbol: string;
    price: number;
    ltfTrend: string;
    htfTrend: string;
    volatility: string;
    macd: string;
    signal: string;
}

export const WatchlistScanner: React.FC<WatchlistScannerProps> = ({ settings, exchange, interval }) => {
    const [scanData, setScanData] = useState<ScanResult[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

    // Draggable state
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    // Polling Logic
    useEffect(() => {
        if (!settings.showWatchlistScanner) return;

        let isMounted = true;
        let timeoutId: NodeJS.Timeout;

        const performScan = async () => {
            if (!isMounted) return;
            setIsScanning(true);

            const results: ScanResult[] = [];
            
            // Fetch sequentially or in small batches to protect API
            for (const sym of SYMBOLS) {
                if (!isMounted) break;
                try {
                    const data = await marketDepthService.getOHLCV(sym.replace('/', ''), exchange, interval, 200);
                    if (data && data.length > 50) {
                        const closePrices = data.map((k: any) => ({
                            time: k.time,
                            close: parseFloat(k.close),
                            high: parseFloat(k.high),
                            low: parseFloat(k.low)
                        }));

                        const currentPrice = closePrices[closePrices.length - 1].close;
                        
                        // Indicators
                        const ema50 = calculateEMA(closePrices, 50);
                        const ema200 = calculateEMA(closePrices, 200);
                        const bb = calculateBollingerBands(closePrices, 20, 2.0);
                        const macd = calculateMACD(closePrices, 12, 26, 9);

                        const lastEma50 = ema50.length > 0 ? ema50[ema50.length - 1].value : currentPrice;
                        const lastEma200 = ema200.length > 0 ? ema200[ema200.length - 1].value : currentPrice;
                        const lastBB = bb.length > 0 ? bb[bb.length - 1] : { upper: currentPrice, lower: currentPrice };
                        const lastMacd = macd.length > 0 ? macd[macd.length - 1] : { histogram: 0, macd: 0, signal: 0 };

                        const ltfBull = currentPrice > lastEma50;
                        const htfBull = currentPrice > lastEma200;
                        const macdBull = lastMacd.histogram > 0;
                        
                        const bbWidth = (lastBB.upper - lastBB.lower) / lastBB.lower;
                        const volStatus = bbWidth < 0.02 ? 'SQUEEZE' : 'HIGH'; // simplistic width threshold for crypto crypto

                        let score = 0;
                        if (htfBull) score += 2; else score -= 2;
                        if (ltfBull) score += 1; else score -= 1;
                        if (macdBull) score += 1; else score -= 1;

                        let signal = 'NEUTRAL';
                        if (score >= 3) signal = 'STRONG BUY';
                        else if (score >= 1) signal = 'BUY';
                        else if (score <= -3) signal = 'STRONG SELL';
                        else if (score <= -1) signal = 'SELL';

                        results.push({
                            symbol: sym,
                            price: currentPrice,
                            ltfTrend: ltfBull ? 'BULL' : 'BEAR',
                            htfTrend: htfBull ? 'BULL' : 'BEAR',
                            volatility: volStatus,
                            macd: macdBull ? 'UP' : 'DOWN',
                            signal
                        });
                    }
                } catch (e) {
                    console.error(`Scanner failed for ${sym}`, e);
                }
                
                // artificial delay to prevent rate limit spikes
                await new Promise(r => setTimeout(r, 200)); 
            }

            if (isMounted) {
                setScanData(results);
                setLastScanTime(new Date());
                setIsScanning(false);
                // Schedule next scan in 45 seconds
                timeoutId = setTimeout(performScan, 45000);
            }
        };

        performScan();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [settings.showWatchlistScanner, exchange, interval]);

    if (!settings.showWatchlistScanner) return null;

    const getSignalColor = (sig: string) => {
        if (sig.includes('STRONG BUY')) return 'bg-green-500 text-white font-black shadow-[0_0_8px_rgba(34,197,94,0.8)]';
        if (sig.includes('BUY')) return 'bg-green-500/20 text-green-400 font-bold';
        if (sig.includes('STRONG SELL')) return 'bg-red-500 text-white font-black shadow-[0_0_8px_rgba(239,68,68,0.8)]';
        if (sig.includes('SELL')) return 'bg-red-500/20 text-red-400 font-bold';
        return 'bg-gray-500/20 text-gray-400';
    };

    const scannerElement = (
        <div 
            className={`fixed z-[9998] pointer-events-auto flex flex-col bg-[#1e222d]/95 backdrop-blur-xl border border-indigo-500/30 rounded-lg shadow-2xl w-[380px] font-sans ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{ 
                bottom: `24px`, 
                left: `24px`,
                transform: `translate(${position.x}px, ${position.y}px)` 
            }}
        >
            {/* Header */}
            <div 
                className="flex items-center justify-between bg-[#2a2e39] border-b border-indigo-500/30 p-2 cursor-move select-none rounded-t-lg"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-yellow-400 animate-bounce shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.8)]'}`} />
                    <h2 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Live Watchlist Scanner</h2>
                </div>
                <div className="text-[9px] text-gray-400 font-mono pointer-events-none">
                    {lastScanTime ? lastScanTime.toLocaleTimeString() : 'WAIT'}
                </div>
            </div>

            {/* Grid Header */}
            <div className="flex bg-[#12141a] text-[9px] font-bold text-gray-500 px-2 py-1 uppercase border-b border-gray-600/30">
                <div className="w-1/4">Symbol</div>
                <div className="w-[15%] text-center">HTF</div>
                <div className="w-[15%] text-center">LTF</div>
                <div className="w-[15%] text-center">MACD</div>
                <div className="flex-1 text-center">Signal</div>
            </div>

            {/* Grid Body */}
            <div className="flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar p-1 gap-[1px]">
                {scanData.map((row) => (
                    <div key={row.symbol} className="flex items-center bg-[#2a2e39]/60 hover:bg-[#2a2e39] transition-colors rounded px-2 py-1.5 text-[10px]">
                        <div className="w-1/4 font-bold text-white flex flex-col">
                            <span>{row.symbol.replace('/USDT', '')}</span>
                            <span className="text-[8px] text-gray-400 font-mono">${row.price < 1 ? row.price.toFixed(4) : row.price.toFixed(2)}</span>
                        </div>
                        <div className={`w-[15%] text-center font-bold ${row.htfTrend === 'BULL' ? 'text-green-500' : 'text-red-500'}`}>
                            {row.htfTrend}
                        </div>
                        <div className={`w-[15%] text-center font-bold ${row.ltfTrend === 'BULL' ? 'text-green-500' : 'text-red-500'}`}>
                            {row.ltfTrend}
                        </div>
                        <div className={`w-[15%] text-center font-bold ${row.macd === 'UP' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {row.macd}
                        </div>
                        <div className="flex-1 ml-1 flex items-center justify-center">
                            <span className={`w-full text-center py-0.5 rounded-sm text-[9px] ${getSignalColor(row.signal)}`}>
                                {row.signal}
                            </span>
                        </div>
                    </div>
                ))}
                
                {scanData.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
                        <span className="text-xs font-bold animate-pulse">Initializing Scanner Engine...</span>
                    </div>
                )}
            </div>
            
            {/* Footer */}
            <div className="bg-[#12141a] p-1.5 text-center text-[8px] text-gray-500 rounded-b-lg border-t border-gray-600/30 font-mono flex items-center justify-between px-3">
                 <span>TGT: {interval}</span>
                 <span>PULL: 45s</span>
            </div>
        </div>
    );

    return typeof window !== 'undefined' ? createPortal(scannerElement, document.body) : null;
};
