import React, { useState } from 'react';
import { Sliders, ChevronDown, ChevronUp } from 'lucide-react';

interface AdvancedHyperparametersProps {
    learningRate: number;
    setLearningRate: (val: number) => void;
    maxDepth: number;
    setMaxDepth: (val: number) => void;
    isTraining: boolean;
}

const AdvancedHyperparameters: React.FC<AdvancedHyperparametersProps> = ({ 
    learningRate, setLearningRate, maxDepth, setMaxDepth, isTraining 
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                type="button"
            >
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    Advanced Hyperparameters
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            
            {isOpen && (
                <div className="p-4 pt-0 border-t border-white/5 mt-2 grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Learning Rate</label>
                        <input 
                            type="number" 
                            step="0.01"
                            min="0.001"
                            max="1.0"
                            value={learningRate} 
                            onChange={e => setLearningRate(parseFloat(e.target.value))}
                            disabled={isTraining}
                            className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all shadow-inner disabled:opacity-50"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Max Depth</label>
                        <input 
                            type="number" 
                            min="1"
                            max="50"
                            value={maxDepth} 
                            onChange={e => setMaxDepth(parseInt(e.target.value))}
                            disabled={isTraining}
                            className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all shadow-inner disabled:opacity-50"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdvancedHyperparameters;
