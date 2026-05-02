import React from 'react';
import { Target } from 'lucide-react';

interface TargetSelectionProps {
    predictionTarget: string;
    setPredictionTarget: (target: string) => void;
    isTraining: boolean;
}

const TargetSelection: React.FC<TargetSelectionProps> = ({ predictionTarget, setPredictionTarget, isTraining }) => {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" /> Prediction Target
            </label>
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => setPredictionTarget('classification')}
                    disabled={isTraining}
                    className={`py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                        predictionTarget === 'classification' 
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-indigo-400/50' 
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'
                    }`}
                >
                    <span className="block">Direction (Up/Down)</span>
                    <span className="block text-[10px] font-normal opacity-70 mt-0.5">Classification</span>
                </button>
                <button
                    onClick={() => setPredictionTarget('regression')}
                    disabled={isTraining}
                    className={`py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
                        predictionTarget === 'regression' 
                            ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.4)] border border-rose-400/50' 
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'
                    }`}
                >
                    <span className="block">Exact Price</span>
                    <span className="block text-[10px] font-normal opacity-70 mt-0.5">Regression</span>
                </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 ml-1 font-medium">What should the AI predict for the next candle?</p>
        </div>
    );
};

export default TargetSelection;
