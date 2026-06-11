import React from 'react';
import { Shield } from 'lucide-react';

export interface ContinualLearningConfigProps {
    enableEwc: boolean;
    setEnableEwc: (val: boolean) => void;
    ewcLambda: number;
    setEwcLambda: (val: number) => void;
}

const ContinualLearningConfig: React.FC<ContinualLearningConfigProps> = ({
    enableEwc,
    setEnableEwc,
    ewcLambda,
    setEwcLambda
}) => {
    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-4 transition-all duration-300 hover:border-slate-600/50">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">Continual Learning (EWC)</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={enableEwc} 
                        onChange={(e) => setEnableEwc(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
            </div>
            
            {enableEwc && (
                <div className="mt-3 bg-black/20 p-3 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-300">EWC Penalty (Lambda)</label>
                        <span className="text-xs font-mono text-emerald-400">{ewcLambda.toFixed(1)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" 
                        max="10.0" 
                        step="0.1"
                        value={ewcLambda}
                        onChange={(e) => setEwcLambda(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500 font-medium">
                        <span>Learn Faster (0.1)</span>
                        <span>Remember Harder (10.0)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        Elastic Weight Consolidation (EWC) prevents "Catastrophic Forgetting" during auto-retraining. 
                        It computes a Fisher Information Matrix so the model doesn't forget prior market crash regimes.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ContinualLearningConfig;
