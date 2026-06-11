import React from 'react';
import { CopyPlus } from 'lucide-react';

export interface DataAugmentationConfigProps {
    augmentationStrategy: string;
    setAugmentationStrategy: (val: string) => void;
    augmentationFactor: number;
    setAugmentationFactor: (val: number) => void;
}

const DataAugmentationConfig: React.FC<DataAugmentationConfigProps> = ({
    augmentationStrategy,
    setAugmentationStrategy,
    augmentationFactor,
    setAugmentationFactor
}) => {
    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-4 transition-all duration-300 hover:border-slate-600/50">
            <div className="flex items-center gap-2 mb-3">
                <CopyPlus className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">Data Augmentation</h4>
            </div>
            
            <div className="mb-3">
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Generation Strategy</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                        { id: 'none', label: 'None' },
                        { id: 'jitter', label: 'Jittering (Noise)' },
                        { id: 'block_bootstrap', label: 'Block Bootstrap' },
                        { id: 'timegan', label: 'TimeGAN (Synthetic)' }
                    ].map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => setAugmentationStrategy(opt.id)}
                            className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${augmentationStrategy === opt.id ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {augmentationStrategy !== 'none' && (
                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-300">Augmentation Factor</label>
                        <span className="text-xs font-mono text-emerald-400">{augmentationFactor}x</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="1"
                        value={augmentationFactor}
                        onChange={(e) => setAugmentationFactor(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500 font-medium">
                        <span>Min (1x)</span>
                        <span>Max (5x)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                        Multiply the training dataset size by generating synthetic samples. Helps prevent overfitting in deep learning models.
                    </p>
                </div>
            )}
        </div>
    );
};

export default DataAugmentationConfig;
