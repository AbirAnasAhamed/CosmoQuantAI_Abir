import React, { useState } from 'react';
import { Settings, Play, BarChart2, Clock, Zap, AlertTriangle, ArrowRight } from 'lucide-react';
import apiClient from '@/services/client';
import Button from '@/components/common/Button';
import OrderTimeline from './OrderTimeline';

const SmartExecutionWidget: React.FC = () => {
    const [strategy, setStrategy] = useState<'TWAP' | 'VWAP'>('TWAP');
    const [amount, setAmount] = useState<string>('1.0');
    const [duration, setDuration] = useState<number>(60); // minutes
    const [slippage, setSlippage] = useState<number>(0.5);
    const [previewSlices, setPreviewSlices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Config Options
    const durations = [
        { label: '30M', value: 30 },
        { label: '1H', value: 60 },
        { label: '4H', value: 240 },
        { label: '12H', value: 720 },
        { label: '24H', value: 1440 },
    ];

    const handlePreview = async () => {
        setIsLoading(true);
        try {
            // Using the real endpoint we created
            const { data } = await apiClient.post('/trading/sor/preview', {
                symbol: "BTC/USDT", // Hardcoded for now or passed as prop
                amount: parseFloat(amount),
                side: "buy", // Default to buy for the widget demo
                strategy: strategy,
                duration_minutes: duration,
                params: {
                    min_order_size: 0.001,
                    slippage_tolerance: slippage
                }
            });

            // Map the response to our timeline format
            const slices = data.schedule.map((order: any) => ({
                order_index: order.order_index,
                scheduled_time: order.scheduled_time,
                quantity: order.quantity,
                status: 'scheduled'
            }));

            setPreviewSlices(slices);
        } catch (error) {
            console.error("Preview failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!confirm(`Are you sure you want to execute this ${strategy} algorithmic order?`)) return;

        try {
            await apiClient.post('/trading/sor/execute', {
                symbol: "BTC/USDT",
                amount: parseFloat(amount),
                side: "buy",
                strategy: strategy,
                duration_minutes: duration
            });
            alert("Algo Started! Orders executing in background.");
            setPreviewSlices([]); // Clear preview on success
        } catch (error) {
            alert("Execution failed");
        }
    };

    return (
        <div className="bg-white dark:bg-brand-darkest border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-xl animate-fade-in-up">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/5 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-brand-primary/10 rounded-lg">
                        <Zap size={18} className="text-brand-primary" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">Institutional Execution</h3>
                        <p className="text-[10px] text-gray-400 font-mono">SMART ORDER ROUTING</p>
                    </div>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 text-purple-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    Algo Active
                </div>
            </div>

            <div className="p-5 space-y-6">
                {/* 1. Strategy Selector */}
                <div>
                    <label className="text-xs font-semibold text-gray-500 mb-2 block uppercase tracking-wider">Strategy</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setStrategy('TWAP')}
                            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all group ${strategy === 'TWAP'
                                ? 'bg-blue-500/10 border-blue-500 text-blue-500 ring-1 ring-blue-500/50'
                                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 hover:border-blue-500/30 hover:bg-white/10'
                                }`}
                        >
                            <Clock size={20} className={strategy === 'TWAP' ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-400'} />
                            <div className="text-center">
                                <span className="text-xs font-bold block">TWAP</span>
                                <span className="text-[9px] opacity-70">Time Weighted</span>
                            </div>
                        </button>
                        <button
                            onClick={() => setStrategy('VWAP')}
                            className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all group ${strategy === 'VWAP'
                                ? 'bg-purple-500/10 border-purple-500 text-purple-500 ring-1 ring-purple-500/50'
                                : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 hover:border-purple-500/30 hover:bg-white/10'
                                }`}
                        >
                            <BarChart2 size={20} className={strategy === 'VWAP' ? 'text-purple-500' : 'text-gray-400 group-hover:text-purple-400'} />
                            <div className="text-center">
                                <span className="text-xs font-bold block">VWAP</span>
                                <span className="text-[9px] opacity-70">Volume Weighted</span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* 2. Parameters */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Total Amount (BTC)</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Slippage Tolerance</label>
                        <div className="flex items-center gap-2 h-[42px] px-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg">
                            <input
                                type="range"
                                min="0.1"
                                max="5"
                                step="0.1"
                                value={slippage}
                                onChange={(e) => setSlippage(parseFloat(e.target.value))}
                                className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                            />
                            <span className="text-xs font-mono w-10 text-right">{slippage}%</span>
                        </div>
                    </div>
                </div>

                {/* Duration Pills */}
                <div>
                    <label className="text-xs font-semibold text-gray-500 mb-2 block">Execution Window</label>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {durations.map((d) => (
                            <button
                                key={d.label}
                                onClick={() => setDuration(d.value)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${duration === d.value
                                        ? 'bg-brand-primary text-white border-brand-primary'
                                        : 'bg-transparent text-gray-500 border-gray-200 dark:border-white/10 hover:border-brand-primary/50'
                                    }`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 3. Action Buttons */}
                <Button
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2 py-3"
                    onClick={handlePreview}
                    disabled={isLoading}
                >
                    {isLoading ? 'Calculating...' : (
                        <>
                            <Settings size={16} /> Analyze Market Impact
                        </>
                    )}
                </Button>

                {/* 4. Timeline Preview */}
                {previewSlices.length > 0 && (
                    <div className="animate-fade-in-up">
                        <div className="flex items-center justify-between mb-2 mt-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase">Execution Map</h4>
                            <span className="text-[10px] text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full">
                                {previewSlices.length} Slices
                            </span>
                        </div>
                        <div className="bg-gray-50 dark:bg-black/20 rounded-xl p-4 max-h-[250px] overflow-y-auto scrollbar-thin border border-gray-200 dark:border-white/5">
                            <OrderTimeline slices={previewSlices} />
                        </div>

                        <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-white/10">
                            <div className="flex justify-between items-center mb-4 text-xs">
                                <span className="text-gray-500">Avg. Execution Price Est.</span>
                                <span className="font-mono font-bold">$96,420.50</span>
                            </div>
                            <Button
                                className="w-full py-4 text-base font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-purple-500/20 active:scale-[0.98] transition-all"
                                onClick={handleExecute}
                            >
                                Execute Algo Strategy
                            </Button>
                        </div>
                    </div>
                )}

                {previewSlices.length === 0 && !isLoading && (
                    <div className="text-center p-6 border border-dashed border-gray-200 dark:border-white/10 rounded-xl">
                        <div className="w-10 h-10 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                            <ArrowRight size={18} />
                        </div>
                        <p className="text-xs text-gray-500">Preview execution to see order breakdown</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SmartExecutionWidget;
