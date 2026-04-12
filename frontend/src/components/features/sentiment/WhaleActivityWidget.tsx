import React, { useState, useEffect } from 'react';
import Card from "@/components/common/Card";
import Button from "@/components/common/Button";
import { ExternalLink, RefreshCw, Wallet, Radio, Anchor, Zap } from 'lucide-react';
import axios from 'axios';

interface WhaleAlert {
    hash: string;
    symbol: string;
    volume: number;
    price: number;
    timestamp: string;
    exchange: string;
}

export const WhaleActivityWidget: React.FC = () => {
    const [threshold, setThreshold] = useState<number>(10); // in Millions
    const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const tRes = await axios.get(`${API_URL}/whale-alerts/threshold`);
            if (tRes.data.threshold) {
                setThreshold(tRes.data.threshold / 1_000_000);
            }
            const aRes = await axios.get(`${API_URL}/whale-alerts/recent`);
            setAlerts(aRes.data);
        } catch (error) {
            console.error("Failed to fetch whale data", error);
        }
    };

    const handleUpdateThreshold = async () => {
        setUpdating(true);
        try {
            await axios.post(`${API_URL}/whale-alerts/threshold`, {
                amount_usd: threshold * 1_000_000
            });
            await fetchData();
        } catch (error) {
            console.error("Failed to update threshold", error);
        } finally {
            setUpdating(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
            maximumFractionDigits: 1
        }).format(val);
    };

    return (
        <Card className="w-full h-[380px] p-0 border border-slate-700/50 bg-[#0B0F19] shadow-2xl overflow-hidden relative group">
            {/* Dynamic Background Mesh */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none"></div>
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-[100px] opacity-10 bg-blue-600 transition-colors duration-1000" />

            {/* Header with Neon Border */}
            <div className="relative px-5 py-4 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                        <Anchor className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-100 tracking-wide uppercase">Whale Watch</h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-blue-300 font-mono">
                            <Radio className="h-3 w-3" /> ON-CHAIN RADAR
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <span className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">LIVE</span>
                    </span>
                    <span className="text-[9px] text-slate-600 mt-0.5">Threshold: ${threshold}M</span>
                </div>
            </div>

            <div className="p-5 flex flex-col h-[calc(100%-65px)]">

                {/* Controls - Compact */}
                <div className="flex items-center gap-2 mb-4 p-2 bg-slate-900/60 rounded-lg border border-slate-700/50">
                    <div className="flex-1 flex items-center gap-2 pl-2">
                        <label className="text-[10px] text-slate-400 uppercase font-semibold">Min Value:</label>
                        <div className="flex items-center">
                            <span className="text-blue-400 font-bold text-sm">$</span>
                            <input
                                type="number"
                                value={threshold}
                                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                className="h-6 bg-transparent border-b border-slate-700 text-slate-200 w-12 text-sm text-center focus:outline-none focus:border-blue-500 mx-1"
                            />
                            <span className="text-xs text-slate-500 font-bold">M</span>
                        </div>
                    </div>
                    <Button
                        onClick={handleUpdateThreshold}
                        disabled={updating}
                        className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 h-7 px-3 text-xs rounded-md transition-all"
                    >
                        {updating ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Update"}
                    </Button>
                </div>

                {/* Alerts List */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Zap className="h-3 w-3" /> Detected Movements
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {alerts.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600/50 text-xs gap-2">
                                <Wallet className="h-8 w-8 opacity-20" />
                                <span>No whales &gt; ${threshold}M</span>
                            </div>
                        ) : (
                            alerts.map((alert, idx) => (
                                <div key={idx} className="group/item relative flex items-center justify-between p-2.5 rounded-lg border border-slate-800/60 bg-slate-900/40 hover:bg-slate-800 hover:border-blue-500/30 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all duration-200">
                                    <div className="flex items-start gap-3">
                                        <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 mt-0.5">
                                            <Wallet className="h-3.5 w-3.5 text-blue-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                                {alert.volume.toFixed(2)} <span className="text-slate-500 font-normal">{alert.symbol}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wide font-mono">
                                                {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right flex flex-col items-end">
                                        <span className="text-xs font-mono font-bold text-blue-300">
                                            {formatCurrency(alert.price * alert.volume)}
                                        </span>
                                        <a
                                            href={`https://etherscan.io/`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[9px] text-slate-600 hover:text-blue-400 flex items-center gap-1 mt-0.5 transition-colors group-hover/item:text-blue-400/80"
                                        >
                                            View Tx <ExternalLink className="h-2 w-2" />
                                        </a>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};
