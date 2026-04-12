import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useMarketStore } from '@/store/marketStore';
import { GoogleGenAI } from '@google/genai';
import { MOCK_ASSETS, SUPPORTED_EXCHANGES } from '@/constants';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/context/ToastContext';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import type { Asset, Exchange } from '@/types';
import { portfolioService } from '@/services/portfolioService';

const COLORS = ['#6366F1', '#8B5CF6', '#D946EF', '#F43F5E', '#F59E0B', '#10B981'];

const GlassCard: React.FC<{ children: React.ReactNode, className?: string, style?: React.CSSProperties }> = ({ children, className = "", style }) => (
    <div 
        className={`backdrop-blur-xl bg-white/5 dark:bg-slate-900/40 border border-white/10 dark:border-white/5 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] overflow-hidden ${className}`}
        style={style}
    >
        {children}
    </div>
);

const GlowingText: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = "" }) => (
    <span className={`text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/70 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] ${className}`}>
        {children}
    </span>
);

const ExchangeStatusIndicator: React.FC<{ connected: boolean }> = ({ connected }) => (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${connected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
        <span>{connected ? 'Syncing' : 'Offline'}</span>
    </div>
);

const MiniSparkline: React.FC<{ data: { time: string, value: number }[], color: string }> = ({ data, color }) => {
    if (!data || data.length < 2) return null;
    return (
        <div className="h-12 w-28 opacity-80 hover:opacity-100 transition-opacity">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

const generateSimulationData = (baseData: Asset[], scenario: 'Normal' | 'Recession' | 'High Inflation' | 'Stagflation') => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let currentValue = baseData.reduce((sum, asset) => sum + (asset.value || 0), 0) || 25000;
    const data = [{ month: 'Start', value: currentValue }];

    let trend = 0.012; 
    let volatility = 0.035;

    switch(scenario) {
        case 'Recession': trend = -0.04; volatility = 0.07; break;
        case 'High Inflation': trend = 0.008; volatility = 0.055; break;
        case 'Stagflation': trend = -0.015; volatility = 0.065; break;
    }

    for (const month of months) {
        const change = (Math.random() - 0.45 + trend) * volatility; 
        currentValue *= (1 + change);
        data.push({ month, value: Math.round(currentValue) });
    }
    return data;
};

const ConnectExchangeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    exchanges: Exchange[];
    onConnect: (exchangeId: string, apiKey: string, secretKey: string, passphrase?: string) => Promise<void>;
    onDisconnect: (exchangeId: string) => Promise<void>;
}> = ({ isOpen, onClose, exchanges, onConnect, onDisconnect }) => {
    const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (id: string) => {
        setIsSaving(true);
        try {
            await onConnect(id, apiKey, secretKey, passphrase);
            setSelectedExchange(null);
            setApiKey(''); setSecretKey(''); setPassphrase('');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300" onClick={onClose}>
            <div className="bg-slate-900 border border-white/10 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h2 className="text-2xl font-black text-white tracking-tight">Connect Data Stream</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">&times;</button>
                </div>
                <div className="p-8 space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    {exchanges.map(exchange => (
                        <div key={exchange.id} className="relative group">
                            <div className={`p-6 rounded-2xl border transition-all duration-300 ${selectedExchange === exchange.id ? 'bg-brand-primary/10 border-brand-primary' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-lg font-bold text-white uppercase tracking-widest">{exchange.name}</span>
                                        <span className="text-xs text-white/40">Secure API Endpoint</span>
                                    </div>
                                    {exchange.isConnected ? (
                                        <button onClick={() => onDisconnect(exchange.id)} className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500 hover:text-white transition-all">
                                            Disconnect
                                        </button>
                                    ) : (
                                        <button onClick={() => setSelectedExchange(selectedExchange === exchange.id ? null : exchange.id)} className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-all">
                                            {selectedExchange === exchange.id ? 'Cancel' : 'Configure'}
                                        </button>
                                    )}
                                </div>
                                {selectedExchange === exchange.id && !exchange.isConnected && (
                                    <div className="mt-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                                        <input type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-brand-primary" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Public API Key" />
                                        <input type="password" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-brand-primary" value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="Private Secret Key" />
                                        {['kucoin', 'okx', 'bitget'].includes(exchange.id.toLowerCase()) && (
                                            <input type="password" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-brand-primary" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Encrypted Passphrase" />
                                        )}
                                        <Button onClick={() => handleSubmit(exchange.id)} disabled={!apiKey || !secretKey || isSaving} className="w-full py-4 rounded-xl shadow-lg shadow-brand-primary/20">
                                            {isSaving ? 'Initiating Handshake...' : 'Establish Connection'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const PortfolioTracker: React.FC = () => {
    const { theme } = useTheme();
    const { showToast } = useToast();
    const { setGlobalSymbol, setGlobalExchange } = useMarketStore();
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [riskTolerance, setRiskTolerance] = useState(65);
    const [scenario, setScenario] = useState<'Normal' | 'Recession' | 'High Inflation' | 'Stagflation'>('Normal');
    
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [recommendations, setRecommendations] = useState<string[]>([]);
    
    const [exchanges, setExchanges] = useState<Exchange[]>(SUPPORTED_EXCHANGES);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [totalPortfolioValue, setTotalPortfolioValue] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [apiKeysMap, setApiKeysMap] = useState<Record<string, number>>({}); 

    // WebSocket for real-time prices
    useEffect(() => {
        if (assets.length === 0) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/v1/portfolio/ws/prices`;
        
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('Connected to Portfolio Price Stream');
            // Extract exchanges and symbols to watch
            const subscriptions: Record<string, string[]> = {};
            assets.forEach(asset => {
                if (asset.exchange) {
                    const ex = asset.exchange.toLowerCase();
                    if (!subscriptions[ex]) subscriptions[ex] = [];
                    subscriptions[ex].push(asset.symbol);
                }
            });
            
            if (Object.keys(subscriptions).length > 0) {
                socket.send(JSON.stringify({ action: 'subscribe', exchanges: subscriptions }));
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'portfolio_price_update') {
                    const exchange = data.exchange;
                    const priceUpdates = data.prices;

                    setAssets(currentAssets => {
                        let totalNewValue = 0;
                        const updated = currentAssets.map(asset => {
                            if (asset.exchange?.toLowerCase() === exchange && priceUpdates[asset.symbol]) {
                                const newPrice = priceUpdates[asset.symbol].price || asset.price;
                                const newVal = newPrice * asset.amount;
                                totalNewValue += newVal;
                                return { ...asset, price: newPrice, value: newVal };
                            }
                            totalNewValue += asset.value;
                            return asset;
                        });
                        setTotalPortfolioValue(totalNewValue);
                        return updated;
                    });
                }
            } catch (err) {
                console.error('WS Message Parse Error:', err);
            }
        };

        socket.onclose = () => console.log('Portfolio Price Stream Closed');
        socket.onerror = (err) => console.error('WS Error:', err);

        return () => socket.close();
    }, [assets.length]); // Re-connect if asset list changes significantly

    const fetchPortfolioData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [keysData, balancesData] = await Promise.all([
                portfolioService.fetchApiKeys(),
                portfolioService.fetchBalances()
            ]);

            const connectedSet = new Set(keysData.map((k: any) => k.exchange.toLowerCase()));
            const keysMapping: Record<string, number> = {};
            keysData.forEach((k: any) => { if (k.id) keysMapping[k.exchange.toLowerCase()] = k.id; });
            
            setApiKeysMap(keysMapping);
            
            setExchanges(prev => {
                let updated = prev.map(ex => ({ ...ex, isConnected: connectedSet.has(ex.id.toLowerCase()) }));
                keysData.forEach((k: any) => {
                    if (!updated.find(ex => ex.id.toLowerCase() === k.exchange.toLowerCase())) {
                        updated.push({
                            id: k.exchange,
                            name: k.exchange.charAt(0).toUpperCase() + k.exchange.slice(1),
                            logo: null, 
                            isConnected: true
                        });
                    }
                });
                return updated;
            });

            const mappedAssets = (balancesData.assets || []).map((a: any) => {
                const mockAsset = MOCK_ASSETS.find(m => m.symbol === a.symbol);
                return { ...a, logo: null }; // Removed exchange logos as requested
            });
            
            setAssets(mappedAssets);
            setTotalPortfolioValue(balancesData.total_portfolio_value || 0);
        } catch (error) {
            console.error('Error fetching portfolio:', error);
            showToast('Failed to sync data stream', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchPortfolioData();
    }, [fetchPortfolioData]);

    const handleConnect = async (exchangeId: string, apiKey: string, secretKey: string, passphrase?: string) => {
        try {
            await portfolioService.addApiKey({ name: `${exchangeId} Stream`, exchange: exchangeId, api_key: apiKey, secret_key: secretKey, passphrase });
            showToast(`Encrypted connection to ${exchangeId} established`, 'success');
            await fetchPortfolioData();
        } catch (error) {
            showToast(`Connection to ${exchangeId} rejected`, 'error');
        }
    };

    const handleDisconnect = async (exchangeId: string) => {
        try {
            const keyId = apiKeysMap[exchangeId.toLowerCase()];
            if (keyId) {
                await portfolioService.deleteApiKey(keyId);
                showToast(`Session terminated for ${exchangeId}`, 'success');
                await fetchPortfolioData();
            }
        } catch (error) {
            showToast(`Termination failed`, 'error');
        }
    };

    const portfolio24hChange = useMemo(() => {
        const totalValue24hAgo = assets.reduce((sum, asset) => sum + (asset.price24h * asset.amount), 0);
        return totalPortfolioValue - totalValue24hAgo;
    }, [assets, totalPortfolioValue]);
    
    const portfolio24hChangePercent = useMemo(() => {
        const totalValue24hAgo = assets.reduce((sum, asset) => sum + (asset.price24h * asset.amount), 0);
        return totalValue24hAgo ? (portfolio24hChange / totalValue24hAgo) * 100 : 0;
    }, [assets, portfolio24hChange]);
    
    const allocationData = useMemo(() => {
        if (assets.length === 0) return [{ name: 'Empty', value: 1 }];
        return assets.map(a => ({ name: a.symbol, value: a.value })).filter(a => a.value > 0);
    }, [assets]);

    const simulationData = useMemo(() => generateSimulationData(assets.length ? assets : (MOCK_ASSETS as any), scenario), [assets, scenario]);
    const simulationResult = useMemo(() => {
        const startValue = simulationData[0].value;
        const endValue = simulationData[simulationData.length - 1].value;
        const minValue = Math.min(...simulationData.map(d => d.value));
        return {
            projectedReturn: startValue ? ((endValue - startValue) / startValue) * 100 : 0,
            maxDrawdown: startValue ? ((startValue - minValue) / startValue) * 100 : 0,
        };
    }, [simulationData]);

    const handleOptimize = useCallback(async () => {
        setIsOptimizing(true);
        setRecommendations([]);
        const riskProfile = riskTolerance < 33 ? 'Conservative' : riskTolerance > 66 ? 'Aggressive' : 'Moderate';
        const portfolioString = assets.map(a => `${a.symbol}: ${((a.value / totalPortfolioValue) * 100).toFixed(1)}%`).join(', ');

        const prompt = `Analyze crypto portfolio: ${portfolioString}. Risk Profile: ${riskProfile}. Provide 3 futuristic, high-alpha optimization steps. Keep it professional and technical.`;
        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY as string || process.env.API_KEY as string });
            const response = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
            setRecommendations(response.text.split(/[-*]/).map(s => s.trim()).filter(Boolean));
            showToast('AI Synthesis complete', 'success');
        } catch (error) {
            showToast('AI Subsystem Unavailable', 'error');
            setRecommendations(["**Optimization Analysis:** Unable to compute correlation matrix at this time."]);
        } finally {
            setIsOptimizing(false);
        }
    }, [assets, riskTolerance, totalPortfolioValue, showToast]);

    if (isLoading && assets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="relative h-24 w-24">
                    <div className="absolute inset-0 rounded-full border-4 border-white/5 border-t-white animate-spin"></div>
                    <div className="absolute inset-4 rounded-full border-4 border-white/5 border-b-white animate-spin-reverse"></div>
                </div>
                <p className="text-white/40 font-mono tracking-widest uppercase text-xs animate-pulse">Establishing Secure Stream...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20 overflow-x-hidden">
            <ConnectExchangeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                exchanges={exchanges}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
            />

            {/* Dynamic Mesh Background Overlay */}
            <div className="fixed inset-0 pointer-events-none -z-10 group">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-float"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-500/10 blur-[120px] rounded-full animate-float-delayed"></div>
            </div>

            {/* Hero Visualization */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                <GlassCard className="xl:col-span-8 p-10 relative group">
                    <div className="absolute top-0 right-0 p-8">
                         <Button variant="secondary" className="bg-white/5 hover:bg-white/10 text-white border-white/10 backdrop-blur-md rounded-2xl px-6 py-3 transition-all transform hover:scale-105" onClick={() => setIsModalOpen(true)}>
                            + Add Data Stream
                         </Button>
                    </div>

                    <div className="space-y-1">
                        <p className="text-white/40 uppercase tracking-[0.3em] text-[10px] font-black">Aggregated Delta Value</p>
                        <h1 className="text-6xl md:text-8xl font-black text-white leading-tight">
                            <GlowingText>${totalPortfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</GlowingText>
                        </h1>
                        <div className={`flex items-center gap-4 mt-6 ${portfolio24hChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2">
                                <span className="font-black">{portfolio24hChange >= 0 ? '↗' : '↘'} {Math.abs(portfolio24hChangePercent).toFixed(2)}%</span>
                            </div>
                            <span className="text-sm font-bold text-white/40 tracking-wider">
                                24H YIELD: <span className="text-white/80">${Math.abs(portfolio24hChange).toLocaleString()}</span>
                            </span>
                        </div>
                    </div>

                    <div className="mt-12 h-[300px] w-full">
                        {assets.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={assets[0]?.history || []}>
                                    <defs>
                                        <linearGradient id="glowGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#fff" stopOpacity={0.2}/>
                                            <stop offset="100%" stopColor="#fff" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1.5rem', backdropFilter: 'blur(10px)' }} 
                                        itemStyle={{ color: '#fff', fontSize: '12px' }}
                                    />
                                    <Area type="monotone" dataKey="value" strokeWidth={4} stroke="#fff" fill="url(#glowGradient)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-white/10 font-mono italic">Awaiting connection parameters...</div>
                        )}
                    </div>
                </GlassCard>

                <div className="xl:col-span-4 space-y-8">
                     <GlassCard className="p-8 h-full">
                        <div className="flex justify-between items-center mb-10">
                            <h3 className="text-sm font-black text-white/20 uppercase tracking-[0.4em]">Asset Weighting</h3>
                        </div>
                        <div className="h-[280px]">
                            {allocationData.length > 0 && allocationData[0].name !== 'Empty' ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={allocationData} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={8} dataKey="value">
                                            {allocationData.map((_, i) => <Cell key={`c-${i}`} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '1rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-white/10 uppercase text-[10px] tracking-widest font-black">Zero Holdings detected</div>
                            )}
                        </div>
                        <div className="mt-8 space-y-3">
                             {allocationData.slice(0, 4).map((entry, index) => entry.name !== 'Empty' && (
                                <div key={entry.name} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                        <span className="text-xs font-bold text-white/60 tracking-widest uppercase">{entry.name}</span>
                                    </div>
                                    <span className="text-xs font-black text-white font-mono">{((entry.value / totalPortfolioValue) * 100).toFixed(1)}%</span>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </div>
            </div>

            {/* Active Channels Row */}
            <div className="flex flex-wrap gap-4 staggered-fade-in group">
                 {exchanges.filter(e => e.isConnected).map(exchange => (
                     <div key={exchange.id} className="glass-morphism-static px-6 py-4 rounded-2xl flex items-center gap-6 bg-white/5 border border-white/5 hover:border-white/20 transition-all cursor-default">
                        <span className="text-xs font-black text-white uppercase tracking-[0.3em]">{exchange.name}</span>
                        <ExchangeStatusIndicator connected={exchange.isConnected} />
                    </div>
                 ))}
                 {exchanges.filter(e => e.isConnected).length === 0 && (
                    <div className="w-full text-center p-8 border-2 border-dashed border-white/5 rounded-[2rem] text-white/20 uppercase text-xs font-black tracking-[0.5em]">No active streams established</div>
                 )}
            </div>

            {/* Futuristic Holdings Matrix */}
            <GlassCard className="p-0">
                <div className="p-10 border-b border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-[0.5em]">Inventory Matrix</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] text-white/30 uppercase tracking-[0.3em] bg-white/5">
                                <th className="p-10 font-black">Identity</th>
                                <th className="p-10 font-black text-right">Valuation</th>
                                <th className="p-10 font-black text-right">Volume</th>
                                <th className="p-10 font-black text-right">Aggregated</th>
                                <th className="p-10 font-black text-right w-40">Trajectory</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {assets.length === 0 && (
                                <tr><td colSpan={5} className="p-20 text-center text-white/10 uppercase tracking-widest font-black italic">Awaiting inventory data...</td></tr>
                            )}
                            {assets.map(asset => {
                                const change24h = asset.price24h ? (asset.price - asset.price24h) / asset.price24h * 100 : 0;
                                return (
                                    <tr key={asset.id} onClick={() => { setSelectedAsset(asset); setGlobalSymbol(asset.symbol); if(asset.exchange) setGlobalExchange(asset.exchange.toLowerCase()); }} className={`group cursor-pointer hover:bg-white/10 transition-colors ${selectedAsset?.id === asset.id ? 'bg-white/5' : ''}`}>
                                        <td className="p-10">
                                            <div className="flex flex-col">
                                                <span className="text-xl font-black text-white tracking-widest uppercase">{asset.symbol}</span>
                                                <span className="text-[10px] text-white/40 font-bold uppercase">{asset.name || asset.symbol}</span>
                                            </div>
                                        </td>
                                        <td className="p-10 text-right font-mono font-bold text-white/80">${asset.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                        <td className="p-10 text-right font-mono text-white/50">{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                                        <td className="p-10 text-right">
                                            <div className="flex flex-col">
                                                <span className="text-lg font-black text-white font-mono">${asset.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                <span className={`text-[10px] font-black ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {change24h >= 0 ? '↗' : '↘'} {Math.abs(change24h).toFixed(2)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-10 text-right">
                                            {asset.history?.length > 1 ? <MiniSparkline data={asset.history} color={change24h >= 0 ? '#10B981' : '#F43F5E'} /> : '-'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* Neural Synthesis & Simulations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <GlassCard className="p-10 flex flex-col group">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="p-4 bg-indigo-500/10 rounded-[1.5rem] text-indigo-400 border border-indigo-500/20">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                        </div>
                        <h3 className="text-xl font-black text-white uppercase tracking-[0.5em]">Risk Simulation</h3>
                    </div>
                    
                    <div className="space-y-10 flex-grow">
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Tolerance Matrix</label>
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${riskTolerance > 66 ? 'bg-rose-500/20 text-rose-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                                    {riskTolerance < 33 ? 'Conservative' : riskTolerance > 66 ? 'Aggressive' : 'Hyper-Growth'}
                                </span>
                            </div>
                            <input type="range" min="0" max="100" value={riskTolerance} onChange={(e) => setRiskTolerance(Number(e.target.value))} className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white" />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4 block">Event Horizon Scenarios</label>
                            <div className="flex flex-wrap gap-2">
                                 {(['Normal', 'Recession', 'High Inflation', 'Stagflation'] as const).map(s => (
                                    <button key={s} onClick={() => setScenario(s)} className={`px-5 py-3 text-[10px] font-black rounded-2xl border transition-all duration-300 uppercase tracking-widest ${scenario === s ? 'bg-white text-slate-950 border-white' : 'bg-transparent border-white/5 text-white/60 hover:border-white/20'}`}>
                                        {s}
                                    </button>
                                 ))}
                            </div>
                        </div>

                        <div className="p-8 bg-white/5 rounded-[2rem] border border-white/5 grid grid-cols-2 gap-8">
                             <div>
                                 <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-2">Alpha Projection</p>
                                 <p className={`text-4xl font-black ${simulationResult.projectedReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                     {simulationResult.projectedReturn >= 0 ? '+' : ''}{simulationResult.projectedReturn.toFixed(1)}%
                                 </p>
                             </div>
                             <div>
                                 <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-2">Entropy Risk</p>
                                 <p className="text-4xl font-black text-rose-500">-{simulationResult.maxDrawdown.toFixed(1)}%</p>
                             </div>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="p-10 relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-transparent to-rose-500/10 border-indigo-500/20">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="p-4 bg-emerald-500/10 rounded-[1.5rem] text-emerald-400 border border-emerald-500/20 animate-pulse">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white uppercase tracking-[0.5em]">AI Architect</h3>
                            <p className="text-[10px] font-bold text-white/30 tracking-widest uppercase mt-1">Sourcing Neural Context</p>
                        </div>
                    </div>
                    
                    <div className="min-h-[250px] mb-10 relative">
                        {isOptimizing ? (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 gap-6">
                                <div className="w-16 h-16 relative">
                                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                                    <div className="absolute inset-2 rounded-full border-2 border-rose-500/20 border-b-rose-500 animate-spin-reverse"></div>
                                </div>
                                <p className="text-white/40 font-black uppercase tracking-[0.3em] text-[10px]">Processing Synthesis...</p>
                            </div>
                        ) : recommendations.length > 0 ? (
                            <div className="space-y-4">
                                {recommendations.map((rec, index) => (
                                    <div key={index} className="flex gap-4 p-5 bg-white/5 rounded-[1.5rem] border border-white/5 transform hover:scale-[1.02] transition-transform">
                                         <span className="text-brand-primary font-black text-lg">0{index + 1}</span>
                                         <p className="text-sm text-white/80 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: rec.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }}></p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-10 border-2 border-dashed border-white/5 rounded-[2.5rem] gap-4">
                                <p className="text-white/20 uppercase font-black tracking-widest text-[10px]">Neural engine standby</p>
                                <p className="text-xs text-white/40 max-w-xs leading-relaxed">Initiate optimization analysis to synthesize portfolio-specific alpha recommendations based on current volatility exposure.</p>
                            </div>
                        )}
                    </div>

                    <Button onClick={handleOptimize} disabled={isOptimizing || assets.length === 0} className="w-full py-6 rounded-[2rem] bg-indigo-600 hover:bg-indigo-500 shadow-2xl shadow-indigo-500/30 text-xs font-black uppercase tracking-[0.3em]">
                        {isOptimizing ? 'Synthesizing...' : 'Execute Synthesis'}
                    </Button>
                </GlassCard>
            </div>
        </div>
    );
};

export default PortfolioTracker;
