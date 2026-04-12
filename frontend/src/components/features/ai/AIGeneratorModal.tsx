
import React, { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { Sparkles, X, BrainCircuit, TrendingUp, ShieldCheck, Clock, Zap } from 'lucide-react';
import { strategyService, AIStrategyConfig } from '@/services/strategyService';
import Button from '@/components/common/Button';
import { useToast } from '@/context/ToastContext';

interface AIGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (config: AIStrategyConfig) => void;
}

const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({ isOpen, onClose, onApply }) => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<AIStrategyConfig | null>(null);
    const { showToast } = useToast();

    const handleGenerate = async () => {
        if (!prompt.trim()) return showToast('Please describe your strategy', 'error');

        setLoading(true);
        try {
            const result = await strategyService.generateStrategyFromPrompt(prompt);
            setConfig(result);
        } catch (error) {
            console.error(error);
            showToast('Failed to generate strategy', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleApply = () => {
        if (config) {
            onApply(config);
            // আমরা এখানে onClose কল করছি না কারণ প্যারেন্ট কম্পোনেন্ট সেটা হ্যান্ডেল করবে (বা একই ফাংশনে করা ভালো)
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-[70]">
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md" aria-hidden="true" />

            <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-violet-500/20 shadow-2xl overflow-hidden relative animate-in fade-in zoom-in-95 duration-300">

                    {/* Header with Magic Gradient */}
                    <div className="p-6 border-b border-white/5 bg-gradient-to-r from-violet-900/20 to-fuchsia-900/20 backdrop-blur-xl flex justify-between items-center">
                        <Dialog.Title className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400 flex items-center gap-3">
                            <Sparkles className="animate-pulse text-fuchsia-400" /> AI Strategy Architect
                        </Dialog.Title>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X /></button>
                    </div>

                    <div className="p-8 space-y-6">
                        {/* Input Section */}
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-gray-300 uppercase tracking-wider block">Describe Your Goal</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="E.g., Create a risky scalping strategy for ETH with high leverage..."
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all outline-none resize-none"
                            />
                        </div>

                        {/* Generate Button */}
                        <div className="flex justify-end">
                            <Button
                                onClick={handleGenerate}
                                disabled={loading}
                                className={`w-full py-4 text-lg font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/20 transition-all ${loading ? 'opacity-70 cursor-wait' : ''}`}
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2 justify-center">
                                        <BrainCircuit className="animate-spin" /> Analyzing Markets...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2 justify-center">
                                        <Zap fill="currentColor" /> Generate Strategy
                                    </span>
                                )}
                            </Button>
                        </div>

                        {/* Preview Section */}
                        {config && (
                            <div className="mt-8 animate-in slide-in-from-bottom-5">
                                <div className="p-6 bg-white/5 rounded-2xl border border-white/10 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-violet-500 to-fuchsia-500" />

                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-xl font-bold text-white mb-1">{config.strategy_name}</h3>
                                            <p className="text-xs text-gray-400">{config.description}</p>
                                        </div>
                                        <div className="bg-violet-500/20 px-3 py-1 rounded-full border border-violet-500/30 text-violet-300 text-xs font-bold uppercase">
                                            AI Generated
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                            <TrendingUp size={16} className="text-cyan-400 mb-2" />
                                            <span className="text-[10px] text-gray-500 uppercase">Leverage</span>
                                            <span className="text-lg font-bold text-white">{config.leverage}x</span>
                                        </div>
                                        <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                            <ShieldCheck size={16} className="text-emerald-400 mb-2" />
                                            <span className="text-[10px] text-gray-500 uppercase">Stop Loss</span>
                                            <span className="text-lg font-bold text-white">{config.stop_loss}%</span>
                                        </div>
                                        <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                            <TrendingUp size={16} className="text-rose-400 mb-2" />
                                            <span className="text-[10px] text-gray-500 uppercase">Take Profit</span>
                                            <span className="text-lg font-bold text-white">{config.take_profit}%</span>
                                        </div>
                                        <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                            <Clock size={16} className="text-amber-400 mb-2" />
                                            <span className="text-[10px] text-gray-500 uppercase">Timeframe</span>
                                            <span className="text-lg font-bold text-white">{config.timeframe}</span>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <Button variant="secondary" onClick={() => setConfig(null)} size="sm">Discard</Button>
                                        <Button onClick={handleApply} size="sm" className="bg-white text-black hover:bg-gray-200">
                                            Apply to Editor
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </Dialog.Panel>
            </div>
        </Dialog>
    );
};

export default AIGeneratorModal;
