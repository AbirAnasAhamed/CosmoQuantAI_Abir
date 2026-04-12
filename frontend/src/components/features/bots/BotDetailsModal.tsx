import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Cpu, X } from 'lucide-react';
import { useBotStatus } from '@/hooks/useBotStatus';
import BotLogViewer from '@/components/features/bots/BotLogViewer';
import type { ActiveBot } from '@/types';

interface BotDetailsModalProps {
    bot: ActiveBot;
    onClose: () => void;
}

const BotDetailsModal: React.FC<BotDetailsModalProps> = ({ bot: initialBot, onClose }) => {
    const { liveBot: bot } = useBotStatus(initialBot);
    const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'logs'>('overview');

    return createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-slate-900/90 border border-white/10 w-full max-w-4xl rounded-3xl shadow-2xl h-[80vh] flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
                {/* Glow Effects */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-xl ${bot.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-400'}`}>
                            <Cpu size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">{bot.name}</h2>
                            <p className="text-xs text-gray-400 font-mono mt-0.5 opacity-60">ID: {bot.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5 px-6 bg-black/20">
                    {['overview', 'config', 'logs'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === tab ? 'border-cyan-500 text-cyan-400 bg-white/5' : 'border-transparent text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-slate-950/50 flex flex-col relative">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="p-8 space-y-6 overflow-y-auto animate-in slide-in-from-bottom-2 duration-300">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Unrealized PnL</p>
                                    <p className={`text-3xl font-bold font-mono ${bot.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {bot.pnl >= 0 ? '+' : ''}${Math.abs(bot.pnl).toFixed(2)}
                                    </p>
                                </div>
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-emerald-500/80 uppercase font-bold mb-2">Total Realized</p>
                                    <p className={`text-3xl font-bold font-mono ${(bot.totalPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {(bot.totalPnl ?? 0) >= 0 ? '+' : ''}${Math.abs(bot.totalPnl ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Strategy</p>
                                    <p className="text-lg font-bold text-white truncate" title={bot.strategy}>
                                        {bot.strategy}
                                    </p>
                                </div>
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Market</p>
                                    <p className="text-xl font-bold text-cyan-400">{bot.market}</p>
                                </div>
                                <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Timeframe</p>
                                    <p className="text-xl font-bold text-white">{bot.timeframe}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Configuration Tab */}
                    {activeTab === 'config' && (
                        <div className="p-6 overflow-y-auto h-full">
                            <div className="bg-black/50 p-6 rounded-2xl border border-white/10 font-mono text-sm overflow-x-auto shadow-inner h-full custom-scrollbar">
                                <pre className="text-emerald-400">
                                    {JSON.stringify(bot, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    {/* Logs Tab */}
                    {activeTab === 'logs' && (
                        <div className="flex-1 p-0 h-full overflow-hidden">
                            <BotLogViewer botId={bot.id} botName={bot.name} className="h-full border-0 rounded-none shadow-none bg-transparent" />
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default BotDetailsModal;
