import React, { useState } from 'react';
import { Activity, Clock, BarChart2, Play, Eye } from 'lucide-react';
import apiClient from '@/services/client';
import Button from '@/components/common/Button';

interface ScheduleItem {
    scheduled_time: string;
    quantity: number;
    order_index: number;
    total_parts: number;
    strategy: string;
}

const SmartOrderForm: React.FC<{ symbol: string; activeSide: 'buy' | 'sell' }> = ({ symbol, activeSide }) => {
    const [strategy, setStrategy] = useState<'TWAP' | 'VWAP'>('TWAP');
    const [duration, setDuration] = useState<number>(60); // minutes
    const [amount, setAmount] = useState<string>('');
    const [previewSchedule, setPreviewSchedule] = useState<ScheduleItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);

    const handlePreview = async () => {
        if (!amount || parseFloat(amount) <= 0) return;
        setIsLoading(true);
        try {
            const { data } = await apiClient.post('/trading/sor/preview', {
                symbol,
                amount: parseFloat(amount),
                side: activeSide,
                strategy,
                duration_minutes: duration,
                params: { min_order_size: 0.1 } // Example param
            });
            setPreviewSchedule(data.schedule);
        } catch (error) {
            console.error("Preview failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!amount || parseFloat(amount) <= 0) return;
        setIsExecuting(true);
        try {
            await apiClient.post('/trading/sor/execute', {
                symbol,
                amount: parseFloat(amount),
                side: activeSide,
                strategy,
                duration_minutes: duration
            });
            alert(`Smart Order (${strategy}) Started! Child orders will execute over ${duration}m.`);
            setPreviewSchedule([]);
            setAmount('');
        } catch (error) {
            alert("Execution Failed");
            console.error(error);
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="space-y-4 p-1 animate-fade-in">
            {/* Strategy Select */}
            <div>
                <label className="text-xs font-semibold text-gray-500 mb-2 block uppercase tracking-wider">Algorithm Strategy</label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setStrategy('TWAP')}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${strategy === 'TWAP'
                            ? 'bg-blue-500/10 border-blue-500 text-blue-500'
                            : 'bg-white dark:bg-black/20 border-gray-200 dark:border-white/10 text-gray-400 hover:border-blue-500/50'
                            }`}
                    >
                        <Clock size={20} />
                        <span className="text-xs font-bold">TWAP</span>
                    </button>
                    <button
                        onClick={() => setStrategy('VWAP')}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${strategy === 'VWAP'
                            ? 'bg-purple-500/10 border-purple-500 text-purple-500'
                            : 'bg-white dark:bg-black/20 border-gray-200 dark:border-white/10 text-gray-400 hover:border-purple-500/50'
                            }`}
                    >
                        <BarChart2 size={20} />
                        <span className="text-xs font-bold">VWAP</span>
                    </button>
                </div>
            </div>

            {/* Duration Slider */}
            <div>
                <div className="flex justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</label>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-white">{duration} min</span>
                </div>
                <input
                    type="range"
                    min="10"
                    max="480"
                    step="10"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>10m</span>
                    <span>4h</span>
                    <span>8h</span>
                </div>
            </div>

            {/* Total Amount */}
            <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wider">Total Amount ({symbol.split('/')[0]})</label>
                <div className="relative">
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-white dark:bg-brand-darkest border border-brand-border-light dark:border-white/10 rounded-lg px-3 py-3 text-sm text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-brand-primary outline-none"
                        placeholder="0.00"
                    />
                    <span className="absolute right-3 top-3 text-xs text-gray-500 font-mono">{symbol.split('/')[0]}</span>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
                <Button variant="secondary" onClick={handlePreview} disabled={isLoading} className="flex items-center justify-center gap-2">
                    <Eye size={16} /> Preview
                </Button>
                <Button
                    variant={activeSide === 'buy' ? 'success' : 'danger'}
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="flex items-center justify-center gap-2"
                >
                    <Play size={16} /> Execute
                </Button>
            </div>

            {/* Preview Panel */}
            {previewSchedule.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/5 animate-fade-in-up">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                        <Activity size={12} /> Execution Schedule
                    </h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                        {previewSchedule.map((order, idx) => (
                            <div key={idx} className="flex justify-between text-xs font-mono p-1.5 rounded hover:bg-white/5">
                                <span className="text-gray-400">#{order.order_index} {new Date(order.scheduled_time).toLocaleTimeString()}</span>
                                <span className={activeSide === 'buy' ? 'text-emerald-500' : 'text-rose-500'}>
                                    {order.quantity}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SmartOrderForm;
