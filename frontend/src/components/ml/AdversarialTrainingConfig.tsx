import React from 'react';
import { Skull } from 'lucide-react';

export interface AdversarialTrainingConfigProps {
    enableAdversarial: boolean;
    setEnableAdversarial: (val: boolean) => void;
    adversarialEpsilon: number;
    setAdversarialEpsilon: (val: number) => void;
}

const AdversarialTrainingConfig: React.FC<AdversarialTrainingConfigProps> = ({
    enableAdversarial,
    setEnableAdversarial,
    adversarialEpsilon,
    setAdversarialEpsilon
}) => {
    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-4 transition-all duration-300 hover:border-slate-600/50">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 text-rose-400" />
                    <h4 className="text-sm font-bold text-white">Adversarial Training</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={enableAdversarial} 
                        onChange={(e) => setEnableAdversarial(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                </label>
            </div>
            
            {enableAdversarial && (
                <div className="mt-3 bg-black/20 p-3 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-300">Perturbation Epsilon</label>
                        <span className="text-xs font-mono text-rose-400">{adversarialEpsilon.toFixed(3)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.001" 
                        max="0.100" 
                        step="0.001"
                        value={adversarialEpsilon}
                        onChange={(e) => setAdversarialEpsilon(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500 font-medium">
                        <span>Low Noise (0.001)</span>
                        <span>High Noise (0.100)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        Trains the model against Fast Gradient Sign Method (FGSM) attacks. 
                        It artificially creates "worst-case" market data during training so the model survives flash crashes and stop-hunts.
                    </p>
                </div>
            )}
        </div>
    );
};

export default AdversarialTrainingConfig;
