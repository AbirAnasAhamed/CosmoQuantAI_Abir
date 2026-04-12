
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Card from '@/components/common/Card';
import { generateUnusualVolumeSpike } from '@/constants'; // Keep this mock for now as backend doesn't provider it yet
import type { UnusualVolumeSpike } from '@/types';
import { useBlockTradeSocket } from '@/hooks/useBlockTradeSocket';
import { useBlockTradeConfig } from '@/hooks/useBlockTradeConfig';
import { BlockTrade } from '@/types/blockTrade';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    Button,
    FormControl,
    FormLabel,
    Input,
    useDisclosure,
    Tooltip,
    Badge
} from '@chakra-ui/react';
import { SettingsIcon } from '@chakra-ui/icons';

// --- Types ---
type UnusualVolumeSpikeWithStatus = UnusualVolumeSpike & { isUpdated?: boolean };

// --- Icons ---
const EyeIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
);

const LightningIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
);

const ShieldIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
    </svg>
);

const formatValue = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
};

// --- Components ---

const LiquidityRadar: React.FC<{ isActive: boolean }> = ({ isActive }) => (
    <div className={`relative w-8 h-8 rounded-full border-2 border-brand-primary/30 flex items-center justify-center ${isActive ? 'animate-pulse' : ''}`}>
        <div className={`absolute inset-0 rounded-full border border-brand-primary/50 ${isActive ? 'animate-ping' : ''}`}></div>
        <div className="w-2 h-2 bg-brand-primary rounded-full"></div>
        {isActive && (
            <div className={`absolute w-full h-1/2 bg-gradient-to-b from-transparent to-brand-primary/20 top-1/2 left-0 animate-spin origin-top`} style={{ animationDuration: '2s' }}></div>
        )}
    </div>
);

const TradeRow: React.FC<{ trade: BlockTrade; maxTradeValue: number; isNew: boolean }> = ({ trade, maxTradeValue, isNew }) => {
    const isWhale = trade.is_whale;
    const widthPercent = Math.min((trade.value / maxTradeValue) * 100, 100);

    let barColor = 'bg-gray-500/10';
    // Backend doesn't send condition 'At Ask' etc yet, infer from side
    if (trade.side === 'buy') barColor = 'bg-emerald-500/10';
    if (trade.side === 'sell') barColor = 'bg-rose-500/10';

    const timeString = new Date(trade.timestamp).toLocaleTimeString([], { hour12: false });

    return (
        <div className={`relative group flex items-center justify-between py-3 px-4 border-b border-brand-border-light/50 dark:border-brand-border-dark/50 hover:bg-gray-50 dark:hover:bg-brand-darkest/30 transition-all duration-300 overflow-hidden ${isNew ? 'animate-flash-blue' : ''}`}>
            {/* Volume Bar Background */}
            <div
                className={`absolute top-0 bottom-0 left-0 transition-all duration-500 ${barColor}`}
                style={{ width: `${widthPercent}%` }}
            ></div>

            {/* Content */}
            <div className="relative z-10 flex items-center gap-4 w-1/3">
                <span className="text-xs font-mono text-gray-400">{timeString}</span>
                <div className="flex items-center gap-2">
                    <span className={`font-bold text-base ${isWhale ? 'text-amber-400' : 'text-slate-900 dark:text-white'}`}>{trade.symbol}</span>
                    {isWhale && <span className="text-[10px] font-bold bg-amber-400/20 text-amber-400 px-1.5 rounded border border-amber-400/30">WHALE</span>}
                </div>
            </div>

            <div className="relative z-10 w-1/3 text-right">
                <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{trade.amount.toLocaleString()} @ </span>
                <span className={`text-sm font-mono font-semibold ${trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {trade.price.toLocaleString()}
                </span>
            </div>

            <div className="relative z-10 w-1/3 flex justify-end items-center gap-3">
                <span className="font-mono font-bold text-slate-900 dark:text-white">{formatValue(trade.value)}</span>
                <Tooltip label={trade.exchange} placement="top">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border truncate max-w-[80px] ${trade.side === 'buy' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' :
                            'border-rose-500/30 text-rose-500 bg-rose-500/10'
                        }`}>
                        {trade.exchange}
                    </span>
                </Tooltip>
            </div>
        </div>
    );
};

// Reusing DarkPoolRow style for Whale/On-Chain Movements
const WhaleMovementRow: React.FC<{ trade: BlockTrade; isNew: boolean }> = ({ trade, isNew }) => (
    <div className={`flex justify-between items-center p-3 border-l-4 border-purple-500 bg-slate-50 dark:bg-slate-900/50 mb-2 rounded-r-lg shadow-sm transition-all hover:translate-x-1 ${isNew ? 'animate-fade-in-right' : ''}`}>
        <div>
            <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white">{trade.symbol}</span>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 rounded border border-purple-500/30 uppercase">Whale Alert</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{new Date(trade.timestamp).toLocaleTimeString()} • {trade.exchange}</p>
        </div>
        <div className="text-right">
            <p className="font-bold text-purple-400">{formatValue(trade.value)}</p>
            <p className="text-xs text-gray-500">Amt: {trade.amount.toLocaleString()}</p>
        </div>
    </div>
);

const BlockTradeDetector: React.FC = () => {
    // Hooks
    const { trades: liveTrades, isConnected } = useBlockTradeSocket();
    const { config, updateConfig, isLoading: isConfigLoading } = useBlockTradeConfig();

    // Config Modal
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [minBlockValueInput, setMinBlockValueInput] = useState('');
    const [whaleValueInput, setWhaleValueInput] = useState('');

    // Mock Unusual Volume (Keep existing mock logic for now)
    const [unusualVolume, setUnusualVolume] = useState<UnusualVolumeSpikeWithStatus[]>(() => {
        const uniqueSpikes: UnusualVolumeSpikeWithStatus[] = [];
        const usedTickers = new Set<string>();
        let attempts = 0;
        
        while (uniqueSpikes.length < 5 && attempts < 20) {
            const spike = generateUnusualVolumeSpike();
            if (!usedTickers.has(spike.ticker)) {
                usedTickers.add(spike.ticker);
                uniqueSpikes.push({ ...spike, isUpdated: false });
            }
            attempts++;
        }
        return uniqueSpikes;
    });
    const timersRef = useRef<number[]>([]);

    useEffect(() => {
        // Only run unusual volume mock
        const unusualVolumeInterval = setInterval(() => {
            setUnusualVolume(prev => {
                const newSpike = generateUnusualVolumeSpike();
                const existingIndex = prev.findIndex(s => s.ticker === newSpike.ticker);
                let newState: UnusualVolumeSpikeWithStatus[];

                if (existingIndex > -1) {
                    newState = prev.map(s => ({ ...s, isUpdated: false }));
                    newState[existingIndex] = { ...newSpike, isUpdated: true };
                } else {
                    newState = [{ ...newSpike, isUpdated: true }, ...prev.map(s => ({ ...s, isUpdated: false }))].slice(0, 10);
                }

                const timerId = window.setTimeout(() => {
                    setUnusualVolume(current => current.map(s => s.ticker === newSpike.ticker ? { ...s, isUpdated: false } : s));
                }, 1000);
                timersRef.current.push(timerId);

                return newState;
            });
        }, 4000);

        return () => {
            clearInterval(unusualVolumeInterval);
            timersRef.current.forEach(clearTimeout);
        };
    }, []);

    // Sync config state when loaded
    useEffect(() => {
        if (config) {
            setMinBlockValueInput(config.min_block_value.toString());
            setWhaleValueInput(config.whale_value.toString());
        }
    }, [config]);

    const handleUpdateConfig = async () => {
        await updateConfig({
            min_block_value: parseFloat(minBlockValueInput),
            whale_value: parseFloat(whaleValueInput)
        });
        onClose();
    };

    // Derived Data
    // We assume the hook returns trades sorted by latest first.
    // We need to determine "isNew" for animation. 
    // Since the hook returns a new array reference on update, we can assume the first item is new if the length changed or id changed.
    // Simpler approach: verify using timestamp from last render.

    // Actually, simply using the index 0 as "new" for animation is a decent approximation if updates are frequent, 
    // but better to track IDs.
    // For this implementation, we will pass `isNew={index === 0}` as a simple visual cue for the very latest trade,
    // although this re-animates on every re-render. A better way is tracking last processed ID.

    const maxTradeValue = useMemo(() => Math.max(...liveTrades.map(t => t.value), 1000), [liveTrades]);
    const whaleTrades = useMemo(() => liveTrades.filter(t => t.is_whale), [liveTrades]);
    const totalFlow = useMemo(() => liveTrades.reduce((acc, t) => acc + t.value, 0), [liveTrades]);
    const largeTradeCount = whaleTrades.length;

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col gap-6 overflow-hidden">

            {/* Config Modal */}
            <Modal isOpen={isOpen} onClose={onClose} isCentered>
                <ModalOverlay />
                <ModalContent bg="gray.800" color="white">
                    <ModalHeader>Scanner Settings</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <FormControl mb={4}>
                            <FormLabel>Minimum Block Trade Value ($)</FormLabel>
                            <Input
                                value={minBlockValueInput}
                                onChange={(e) => setMinBlockValueInput(e.target.value)}
                                type="number"
                            />
                        </FormControl>
                        <FormControl>
                            <FormLabel>Whale Alert Threshold ($)</FormLabel>
                            <Input
                                value={whaleValueInput}
                                onChange={(e) => setWhaleValueInput(e.target.value)}
                                type="number"
                            />
                        </FormControl>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
                        <Button colorScheme="blue" onClick={handleUpdateConfig} isLoading={isConfigLoading}>
                            Save Changes
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Header / Sonar Panel */}
            <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-6 staggered-fade-in">
                <Card className="flex items-center justify-between !p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white border-slate-700">
                    <div className="flex items-center gap-4">
                        <LiquidityRadar isActive={isConnected} />
                        <div>
                            <h2 className="text-lg font-bold">Liquidity Scanner</h2>
                            <p className="text-xs text-slate-400 font-mono">{isConnected ? 'SCANNING LIT MARKETS...' : 'CONNECTING...'}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Session Flow</p>
                        <p className="text-xl font-mono font-bold text-brand-primary">{formatValue(totalFlow)}</p>
                    </div>
                </Card>

                <Card className="flex items-center justify-between !p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-400/10 rounded-lg text-amber-500">
                            <EyeIcon />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Whale Watch</h3>
                            <p className="text-xs text-gray-500">Trades &gt; {config ? formatValue(config.whale_value) : '$500k'}</p>
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{largeTradeCount}</p>
                </Card>

                <div className="flex gap-2">
                    <button onClick={onOpen} className="flex-1 rounded-xl border font-bold transition-all bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center gap-2">
                        <SettingsIcon /> Settings
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">

                {/* Left: Lit Market Block Trades */}
                <div className="lg:col-span-2 flex flex-col min-h-0 staggered-fade-in" style={{ animationDelay: '100ms' }}>
                    <Card className="flex-1 flex flex-col !p-0 border-0 shadow-xl overflow-hidden bg-white dark:bg-brand-dark">
                        <div className="p-4 border-b border-brand-border-light dark:border-brand-border-dark flex justify-between items-center bg-gray-50 dark:bg-brand-darkest/30">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <LightningIcon className="text-yellow-500" />
                                Live Block Tape
                            </h3>
                            <div className="flex items-center gap-2">
                                <Badge colorScheme={isConnected ? 'green' : 'red'}>{isConnected ? 'LIVE' : 'OFFLINE'}</Badge>
                                {config && <span className="text-xs font-mono text-gray-500">MIN: {formatValue(config.min_block_value)}</span>}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                            <div className="absolute inset-0">
                                {liveTrades.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-gray-500">
                                        Waiting for block trades...
                                    </div>
                                ) : (
                                    liveTrades.map((trade, index) => {
                                        const tradeKey = `${trade.exchange}-${trade.symbol}-${trade.timestamp}-${trade.price}-${trade.amount}-${index}`;
                                        return (
                                            <TradeRow
                                                key={tradeKey}
                                                trade={trade}
                                                maxTradeValue={maxTradeValue}
                                                isNew={index === 0}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right: Whale Movements (formerly Dark Pool) & Unusual Volume */}
                <div className="flex flex-col gap-6 min-h-0 staggered-fade-in" style={{ animationDelay: '200ms' }}>

                    {/* Whale Movements Section */}
                    <Card className="flex-1 flex flex-col !p-0 border-purple-500/20 overflow-hidden bg-[#0F172A] dark:bg-[#0F172A] relative">
                        {/* Background pattern for "Dark" feel */}
                        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#A855F7 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>

                        <div className="p-4 border-b border-purple-500/20 flex justify-between items-center relative z-10 bg-purple-900/10">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <ShieldIcon className="text-purple-400" />
                                Whale Movements
                            </h3>
                            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar relative z-10">
                            {whaleTrades.length === 0 ? (
                                <div className="text-center text-gray-500 text-sm mt-10">No recent whales detected.</div>
                            ) : (
                                whaleTrades.map((trade, index) => {
                                    const tradeKey = `whale-${trade.exchange}-${trade.symbol}-${trade.timestamp}-${trade.price}-${trade.amount}-${index}`;
                                    return <WhaleMovementRow key={tradeKey} trade={trade} isNew={index === 0} />;
                                })
                            )}
                        </div>
                    </Card>

                    {/* Unusual Volume Section (Still Mock) */}
                    <Card className="h-1/3 flex flex-col !p-0 overflow-hidden">
                        <div className="p-4 border-b border-brand-border-light dark:border-brand-border-dark bg-gray-50 dark:bg-brand-darkest/30">
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Volume Anomalies (Alpha)</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="text-gray-500 dark:text-gray-400">
                                        <th className="p-2 font-medium">Ticker</th>
                                        <th className="p-2 font-medium text-right">Vol Ratio</th>
                                        <th className="p-2 font-medium text-right">Last</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unusualVolume.map(spike => (
                                        <tr key={spike.ticker} className={`border-b border-brand-border-light/30 dark:border-brand-border-dark/30 last:border-0 ${spike.isUpdated ? 'animate-flash-blue' : ''}`}>
                                            <td className="p-2 font-bold text-slate-900 dark:text-white">{spike.ticker}</td>
                                            <td className="p-2 text-right font-mono text-brand-warning">{spike.volumeRatio.toFixed(1)}x</td>
                                            <td className="p-2 text-right font-mono text-gray-400">${spike.lastPrice.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BlockTradeDetector;
