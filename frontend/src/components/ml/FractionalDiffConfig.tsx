import React from 'react';
import { Network } from 'lucide-react';

export interface FractionalDiffConfigProps {
    fractionalDiff: boolean;
    setFractionalDiff: (val: boolean) => void;
    fractionalDValue: number;
    setFractionalDValue: (val: number) => void;
}

const FractionalDiffConfig: React.FC<FractionalDiffConfigProps> = ({
    fractionalDiff,
    setFractionalDiff,
    fractionalDValue,
    setFractionalDValue
}) => {
    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-4 transition-all duration-300 hover:border-slate-600/50">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">Fractional Differentiation</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={fractionalDiff} 
                        onChange={(e) => setFractionalDiff(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
            </div>
            
            {fractionalDiff && (
                <div className="mt-3 bg-black/20 p-3 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-300">d-Value (Memory vs Stationarity)</label>
                        <span className="text-xs font-mono text-emerald-400">{fractionalDValue.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="1.0" 
                        step="0.05"
                        value={fractionalDValue}
                        onChange={(e) => setFractionalDValue(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500 font-medium">
                        <span>More Memory (0.1)</span>
                        <span>Full Return (1.0)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        Instead of standard returns (d=1.0) which lose price memory, fractional differentiating preserves memory while achieving stationarity. 
                        A value between 0.3 and 0.6 is optimal for most financial series.
                    </p>
                </div>
            )}
        </div>
    );
};

export default FractionalDiffConfig;
