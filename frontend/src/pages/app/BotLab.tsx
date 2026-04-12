import React, { useState, useEffect } from 'react';
import { useMarketStore } from '@/store/marketStore';
import Button from '@/components/common/Button';
import type { ActiveBot, BacktestResult } from '@/types';
import { useToast } from '@/context/ToastContext';
import { botService } from '@/services/botService';
import BotSettingsModal from './BotSettingsModal';
import BotLabModal from './BotLabModal';
import { runBacktestApi, getBacktestStatus } from '@/services/backtester';
import BotCard from '@/components/features/bots/BotCard';
import BotDetailsModal from '@/components/features/bots/BotDetailsModal';
import BacktestResultModal from '@/components/features/backtest/BacktestResultModal';
import BotLabHeader from '@/components/features/bots/BotLabHeader';
import { Hammer, Plus, ChevronDown } from 'lucide-react';
import VisualStrategyBuilderModal from './VisualStrategyBuilderModal';
import DEXExecutionWidget from '@/components/features/bots/DEXExecutionWidget';

const BotLab: React.FC = () => {
    const [isCreating, setIsCreating] = useState(false);
    const { globalSymbol } = useMarketStore();
    const [isVisualBuilderOpen, setIsVisualBuilderOpen] = useState(false);
    const [bots, setBots] = useState<ActiveBot[]>([]);
    const { showToast } = useToast();
    const [backtestingBotId, setBacktestingBotId] = useState<string | null>(null);
    const [isBacktestModalOpen, setIsBacktestModalOpen] = useState(false);
    const [selectedBot, setSelectedBot] = useState<ActiveBot | null>(null);
    const [selectedDetailBot, setSelectedDetailBot] = useState<ActiveBot | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [settingsBot, setSettingsBot] = useState<ActiveBot | null>(null);
    const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Server-side stats state
    const [stats, setStats] = useState({ total_pnl: 0, average_win_rate: 0, active_bots: 0, total_bots: 0 });

    useEffect(() => { loadBots(false); }, []);

    const loadBots = async (isLoadMore = false) => {
        try {
            const limit = 20;
            const currentOffset = isLoadMore ? offset : 0;

            const botsPromise = botService.getAllBots(currentOffset, limit);
            // Only fetch stats on initial load to avoid unnecessary calls
            const statsPromise = !isLoadMore ? botService.getBotStats() : Promise.resolve(null);

            const [newBots, statsData] = await Promise.all([
                botsPromise,
                statsPromise
            ]);

            if (isLoadMore) {
                setBots(prev => [...prev, ...newBots]);
            } else {
                setBots(newBots);
                if (statsData) setStats(statsData);
            }

            setOffset(currentOffset + limit);
            // If we received fewer bots than the limit, we've reached the end
            setHasMore(newBots.length === limit);

        } catch (error) {
            console.error(error);
            showToast("Failed to load bots", "error");
        }
    };

    const handleRunBacktest = async (bot: ActiveBot) => {
        if (backtestingBotId) return;
        setBacktestingBotId(bot.id);
        showToast(`Initiating Quantum Analysis for ${bot.name}...`, 'info');

        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(endDate.getMonth() - 3);

            const payload = {
                symbol: bot.market,
                timeframe: bot.timeframe || '1h',
                strategy: bot.strategy,
                initial_cash: bot.trade_value || 10000,
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                params: bot.config?.strategyParams || {},
                commission: 0.001,
                slippage: 0
            };

            const initialRes = await runBacktestApi(payload);
            const taskId = initialRes.task_id;

            const interval = setInterval(async () => {
                try {
                    const statusRes = await getBacktestStatus(taskId);
                    if (statusRes.status === 'Completed') {
                        clearInterval(interval);
                        setBacktestingBotId(null);
                        if (statusRes.result?.error) {
                            showToast(`Simulation Error: ${statusRes.result.error}`, 'error');
                        } else {
                            const raw = statusRes.result;
                            const metrics = raw.advanced_metrics || {};
                            setBacktestResult({
                                id: `bt_${Date.now()}`,
                                market: bot.market,
                                strategy: bot.strategy,
                                date: new Date().toISOString().split('T')[0],
                                profitPercent: raw.profit_percent ?? 0,
                                profit_percent: raw.profit_percent ?? 0, // Legacy support
                                maxDrawdown: metrics.max_drawdown ?? 0,
                                winRate: metrics.win_rate ?? 0,
                                sharpeRatio: metrics.sharpe ?? 0,
                                totalTrades: raw.total_trades ?? 0,
                                finalValue: raw.final_value ?? 0,
                                equity_curve: Array.isArray(raw.equity_curve)
                                    ? raw.equity_curve.map((val: any, index: number) => ({
                                        name: typeof val === 'object' ? (val.name || index.toString()) : index.toString(),
                                        value: typeof val === 'object' ? val.value : val
                                    }))
                                    : []
                            });
                            setSelectedBot(bot);
                            setIsBacktestModalOpen(true);
                            showToast('Simulation Complete', 'success');
                        }
                    } else if (statusRes.status === 'Failed') {
                        clearInterval(interval);
                        setBacktestingBotId(null);
                        showToast(`Simulation Failed`, 'error');
                    }
                } catch (e) {
                    clearInterval(interval);
                    setBacktestingBotId(null);
                }
            }, 1000);
        } catch (error) {
            setBacktestingBotId(null);
            showToast('Failed to start simulation', 'error');
        }
    };

    const handleSaveVisualStrategy = async (name: string, config: any) => {
        showToast(`Compiling and deploying strategy "${name}"...`, 'info');
        try {
            const botPayload = {
                name: name,
                market: globalSymbol || 'BTC/USDT',
                strategy: 'Custom Visual Protocol',
                pnl: 0,
                pnlPercent: 0,
                status: 'active',
                isRegimeAware: true,
                config: config,
            };

            const newBot = await botService.createBot(botPayload);
            setBots(prev => [newBot, ...prev]);
            setIsVisualBuilderOpen(false);
            showToast(`Strategy "${name}" deployed successfully.`, 'success');
        } catch (error) {
            console.error('Failed to create bot:', error);
            showToast(`Failed to deploy strategy "${name}". Please try again.`, 'error');
        }
    };

    const handleToggleStatus = async (id: string, currentStatus?: string) => {
        const bot = bots.find(b => b.id === id);
        if (!bot) return;

        // Use real-time status from Child (WebSocket) if available, otherwise fallback to local state
        const statusToUse = currentStatus || bot.status;
        const action = statusToUse === 'active' ? 'stop' : 'start';

        try {
            // Optimistic Update
            setBots(prev => prev.map(b => b.id === id ? { ...b, status: action === 'start' ? 'active' : 'inactive' } : b));

            await botService.controlBot(id, action);
            showToast(`${bot.name} ${action === 'start' ? 'Online' : 'Offline'}`, 'success');
        } catch (error) {
            console.error("Toggle Error:", error);
            loadBots(); // Revert/Refresh on error
            showToast("Command failed", "error");
        }
    };

    const handleDeleteBot = async (id: string) => {
        const bot = bots.find(b => b.id === id);
        if (bot?.status === 'active' && !window.confirm("⚠️ WARNING: Unit is ACTIVE. Terminate anyway?")) return;
        if (!window.confirm("Confirm deletion?")) return;
        try {
            await botService.deleteBot(id);
            setBots(prev => prev.filter(b => b.id !== id));
            showToast("Unit decommissioned", "success");
        } catch (e) { showToast("Decommission failed", "error"); }
    };

    const [isDeFiOpen, setIsDeFiOpen] = useState(false);

    return (
        <div className="h-screen flex flex-col animate-fade-in relative overflow-hidden">
            {/* Background Decor */}
            <div className="fixed inset-0 z-[-1] pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-900/10 blur-[120px]"></div>
                <div className="absolute bottom-[0%] right-[0%] w-[40%] h-[40%] rounded-full bg-violet-900/10 blur-[120px]"></div>
            </div>

            {isCreating && <BotLabModal isOpen={isCreating} onClose={() => setIsCreating(false)} onSuccess={() => { loadBots(); setIsCreating(false); }} />}
            {isVisualBuilderOpen && <VisualStrategyBuilderModal onClose={() => setIsVisualBuilderOpen(false)} onSave={handleSaveVisualStrategy} />}

            {isDeFiOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={(e) => e.target === e.currentTarget && setIsDeFiOpen(false)}>
                    <div className="relative max-w-lg w-full transform transition-all scale-100">
                        <div className="absolute -top-8 right-0 text-white/50 hover:text-white cursor-pointer" onClick={() => setIsDeFiOpen(false)}>
                            Close
                        </div>
                        <DEXExecutionWidget />
                    </div>
                </div>
            )}

            {selectedDetailBot && (
                <BotDetailsModal
                    bot={selectedDetailBot}
                    onClose={() => setSelectedDetailBot(null)}
                />
            )}

            {isBacktestModalOpen && selectedBot && backtestResult && (
                <BacktestResultModal
                    bot={selectedBot}
                    result={backtestResult}
                    onClose={() => setIsBacktestModalOpen(false)}
                />
            )}

            <div className="flex-none p-4 md:p-8 pb-0 space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-end gap-4 staggered-fade-in">
                    <div>
                        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">Bot Laboratory</h2>
                        <p className="text-sm text-gray-400 mt-2 font-light">
                            Advanced Algorithm Management Interface <span className="text-cyan-500 font-mono text-xs px-2 py-0.5 bg-cyan-950/30 rounded border border-cyan-500/20">v2.4.0</span>
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setIsDeFiOpen(true)} className="flex items-center gap-2 border-white/10 hover:border-orange-500 hover:text-orange-400 hover:bg-orange-950/20">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                            DeFi Direct
                        </Button>
                        <Button variant="outline" onClick={() => setIsVisualBuilderOpen(true)} className="flex items-center gap-2 border-white/10 hover:border-violet-500 hover:text-violet-400 hover:bg-violet-950/20">
                            <Hammer size={16} /> Visual Builder
                        </Button>
                        <Button variant="primary" onClick={() => setIsCreating(true)} className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 border-none shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]">
                            <Plus size={18} /> New Unit
                        </Button>
                    </div>
                </div>

                <BotLabHeader bots={bots} stats={stats} onOpenCreate={() => setIsCreating(true)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 px-4 md:px-8 pb-8">
                {bots.map((bot, index) => (
                    <BotCard
                        key={bot.id}
                        bot={bot}
                        index={index}
                        isLoading={backtestingBotId === bot.id}
                        onRunBacktest={handleRunBacktest}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDeleteBot}
                        onDetails={setSelectedDetailBot}
                        onSettings={bot => { setSettingsBot(bot); setIsSettingsModalOpen(true); }}
                    />
                ))}

                {!hasMore && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="group relative h-full min-h-[320px] border border-dashed border-white/10 hover:border-cyan-500/50 rounded-3xl flex flex-col items-center justify-center text-center hover:bg-cyan-500/5 transition-all duration-300"
                    >
                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-xl group-hover:bg-cyan-500 group-hover:text-black text-gray-500">
                            <Plus size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-500 group-hover:text-cyan-400 transition-colors">Initialize New Unit</h3>
                        <p className="text-xs text-gray-600 group-hover:text-cyan-500/70 mt-2 max-w-[200px]">Access global market strategies</p>
                    </button>
                )}
            </div>

            {hasMore && (
                <div className="flex justify-center pb-12">
                    <Button
                        variant="secondary"
                        onClick={() => loadBots(true)}
                        className="bg-slate-800/50 hover:bg-slate-700/50 border-white/10 text-gray-400 hover:text-white px-8 py-3 rounded-full flex items-center gap-2 transition-all shadow-lg hover:shadow-cyan-500/10"
                    >
                        Load More Bots <ChevronDown size={16} />
                    </Button>
                </div>
            )}

            <BotSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                bot={settingsBot}
                onUpdate={bot => {
                    setBots(prev => prev.map(b => b.id === bot.id ? bot : b));
                    if (selectedBot?.id === bot.id) setSelectedBot(bot);
                }}
            />
        </div>
    );
};

export default BotLab;
