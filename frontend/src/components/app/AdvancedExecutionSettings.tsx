import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Activity, Clock } from 'lucide-react';

interface AdvancedExecutionSettingsProps {
    isTraining: boolean;
    executionStrategy: string;
    setExecutionStrategy: (val: string) => void;
    icebergSlices: number;
    setIcebergSlices: (val: number) => void;
    twapDuration: number;
    setTwapDuration: (val: number) => void;
}

export const AdvancedExecutionSettings: React.FC<AdvancedExecutionSettingsProps> = ({
    isTraining,
    executionStrategy,
    setExecutionStrategy,
    icebergSlices,
    setIcebergSlices,
    twapDuration,
    setTwapDuration
}) => {
    return (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-inner mt-4">
            <div className="flex items-center justify-between mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Activity className="w-4 h-4 text-emerald-400" /> Advanced Execution Strategy
                </label>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 uppercase tracking-wider">
                    {executionStrategy.toUpperCase()}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                    { id: 'standard', label: 'Standard', desc: 'Market/Limit Order', icon: Activity },
                    { id: 'iceberg', label: 'Iceberg', desc: 'Hidden Slices', icon: Layers },
                    { id: 'twap', label: 'TWAP', desc: 'Time-Weighted', icon: Clock }
                ].map((strat) => {
                    const isSelected = executionStrategy === strat.id;
                    const Icon = strat.icon;
                    return (
                        <button
                            key={strat.id}
                            onClick={() => setExecutionStrategy(strat.id)}
                            disabled={isTraining}
                            className={`p-3 rounded-xl border text-left transition-all duration-300 flex flex-col items-start gap-1.5 ${
                                isSelected 
                                    ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] scale-[1.02]' 
                                    : 'bg-black/60 border-white/5 hover:border-emerald-500/30 hover:bg-white/5'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                            <div>
                                <div className={`text-xs font-bold ${isSelected ? 'text-emerald-300' : 'text-slate-300'}`}>
                                    {strat.label}
                                </div>
                                <div className="text-[9px] text-slate-500">{strat.desc}</div>
                            </div>
                        </button>
                    );
                })}
            </div>

            <AnimatePresence mode="wait">
                {executionStrategy === 'iceberg' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 overflow-hidden"
                    >
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-semibold text-emerald-300">Total Slices</label>
                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                {icebergSlices} slices
                            </span>
                        </div>
                        <input
                            type="range"
                            min={2}
                            max={50}
                            step={1}
                            value={icebergSlices}
                            onChange={(e) => setIcebergSlices(parseInt(e.target.value))}
                            disabled={isTraining}
                            className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-2">
                            The algorithm will split the total order quantity into {icebergSlices} smaller hidden parts to minimize market impact.
                        </p>
                    </motion.div>
                )}

                {executionStrategy === 'twap' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-4 overflow-hidden"
                    >
                        <div className="flex justify-between items-center mb-3">
                            <label className="text-xs font-semibold text-emerald-300">Execution Duration (Minutes)</label>
                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                                {twapDuration} min
                            </span>
                        </div>
                        <input
                            type="range"
                            min={5}
                            max={120}
                            step={5}
                            value={twapDuration}
                            onChange={(e) => setTwapDuration(parseInt(e.target.value))}
                            disabled={isTraining}
                            className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-2">
                            The algorithm will distribute the order execution evenly over {twapDuration} minutes.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
