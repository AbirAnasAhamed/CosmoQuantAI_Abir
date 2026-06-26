import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, Target, Zap, Activity, ShieldAlert, CheckSquare, Square, Search, Loader2 } from 'lucide-react';

import { PLP_MODULES } from '@/constants/mlFeatures';
export const GET_DEFAULT_MANDATORY_PLP_FEATURES = () => {
    const defaultFeatures: string[] = [];
    PLP_MODULES.forEach(mod => {
        mod.features.forEach(feat => {
            if (feat.mandatory) defaultFeatures.push(feat.id);
        });
    });
    return defaultFeatures;
};

interface PredatoryLiquidityPipelineProps {
    selectedFeatures: string[];
    onToggleFeature: (featureId: string) => void;
    onSetMultipleFeatures: (featureIds: string[]) => void;
    isTraining: boolean;
    isRetrainMode?: boolean;
    initialLoadedFeatures?: string[];
}

const PredatoryLiquidityPipeline: React.FC<PredatoryLiquidityPipelineProps> = ({
    selectedFeatures,
    onToggleFeature,
    onSetMultipleFeatures,
    isTraining,
    isRetrainMode = false,
    initialLoadedFeatures = []
}) => {
    const [expandedModule, setExpandedModule] = useState<string | null>('liquidity_cluster');
    const [isSuggesting, setIsSuggesting] = useState(false);

    const handleSelectAll = (moduleId: string, features: {id: string}[], isAllSelected: boolean) => {
        if (isTraining) return;
        
        let newSelection = [...selectedFeatures];
        if (isAllSelected) {
            // Remove all non-mandatory features from this module
            const moduleFeatureIds = features.map(f => f.id);
            const mandatoryIds = PLP_MODULES.find(m => m.id === moduleId)?.features.filter(f => f.mandatory).map(f => f.id) || [];
            
            newSelection = newSelection.filter(id => !moduleFeatureIds.includes(id) || mandatoryIds.includes(id));
        } else {
            // Add all
            features.forEach(f => {
                if (!newSelection.includes(f.id)) newSelection.push(f.id);
            });
        }
        onSetMultipleFeatures(newSelection);
    };

    const handleAutoSuggest = async () => {
        if (isTraining) return;
        setIsSuggesting(true);
        
        // Mocking the auto-suggestion logic
        setTimeout(() => {
            // Pick 17 features: The 5 mandatory ones + 12 randomly selected high-impact ones
            const mandatoryIds = GET_DEFAULT_MANDATORY_PLP_FEATURES();
            const allOtherIds = PLP_MODULES.flatMap(m => m.features).filter(f => !f.mandatory).map(f => f.id);
            
            // Randomly shuffle and take 12
            const shuffled = allOtherIds.sort(() => 0.5 - Math.random());
            const selected12 = shuffled.slice(0, 12);
            
            onSetMultipleFeatures([...mandatoryIds, ...selected12]);
            setIsSuggesting(false);
        }, 1500);
    };

    return (
        <div className="mt-6 p-1 rounded-3xl bg-gradient-to-b from-rose-500/20 to-purple-900/20 shadow-[0_0_30px_rgba(225,29,72,0.15)] relative overflow-hidden">
            {/* Ambient Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-600/10 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/10 blur-[100px] rounded-full pointer-events-none"></div>
            
            <div className="bg-[#0A0A0A]/90 backdrop-blur-xl rounded-[22px] border border-rose-500/20 p-5 relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h3 className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-purple-500 flex items-center gap-3 uppercase">
                            <Target className="w-5 h-5 text-rose-500" />
                            Predatory Liquidity Pipeline (PLP)
                        </h3>
                        <p className="text-xs text-slate-400 mt-1.5 font-medium max-w-xl">
                            Advanced feature engineering engine mapping institutional stop-hunts, liquidation cascades, and margin squeeze dynamics in real-time.
                        </p>
                    </div>
                    
                    <button
                        onClick={handleAutoSuggest}
                        disabled={isTraining || isSuggesting}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg ${isSuggesting ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 cursor-wait' : 'bg-gradient-to-r from-rose-600 to-orange-600 text-white hover:shadow-[0_0_20px_rgba(225,29,72,0.4)] border border-rose-400/50 hover:scale-105'}`}
                    >
                        {isSuggesting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Live Market...</>
                        ) : (
                            <><Search className="w-4 h-4" /> Auto-Suggest Top 17</>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-3 mb-5 px-3 py-2 bg-rose-950/30 border border-rose-500/10 rounded-xl">
                    <div className="text-xs font-bold bg-rose-500/20 text-rose-400 px-3 py-1 rounded-full border border-rose-500/30">
                        {selectedFeatures.length} / {PLP_MODULES.reduce((acc, mod) => acc + mod.features.length, 0)} Features Selected
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium">
                        (Open Interest & Funding Rate variables are mandatory for accurate prediction)
                    </p>
                </div>

                <div className="space-y-3">
                    {PLP_MODULES.map((module) => {
                        const isExpanded = expandedModule === module.id;
                        const Icon = module.icon;
                        const moduleFeatureIds = module.features.map(f => f.id);
                        const selectedInModule = moduleFeatureIds.filter(id => selectedFeatures.includes(id));
                        const isAllSelected = selectedInModule.length === moduleFeatureIds.length;

                        // Dynamic color classes based on module.color
                        const borderColors: Record<string, string> = { rose: 'border-rose-500/30', orange: 'border-orange-500/30', red: 'border-red-500/30', purple: 'border-purple-500/30', pink: 'border-pink-500/30', cyan: 'border-cyan-500/30' };
                        const bgColors: Record<string, string> = { rose: 'bg-rose-500/10', orange: 'bg-orange-500/10', red: 'bg-red-500/10', purple: 'bg-purple-500/10', pink: 'bg-pink-500/10', cyan: 'bg-cyan-500/10' };
                        const textColors: Record<string, string> = { rose: 'text-rose-400', orange: 'text-orange-400', red: 'text-red-400', purple: 'text-purple-400', pink: 'text-pink-400', cyan: 'text-cyan-400' };

                        return (
                            <div key={module.id} className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded ? `${borderColors[module.color]} ${bgColors[module.color]}` : 'border-white/5 bg-black/40 hover:border-white/10'}`}>
                                <div 
                                    className="flex items-center justify-between p-4 cursor-pointer"
                                    onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl ${isExpanded ? `bg-${module.color}-500/20 ${textColors[module.color]}` : 'bg-white/5 text-slate-400'}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className={`text-sm font-bold ${isExpanded ? 'text-white' : 'text-slate-300'}`}>{module.name}</h4>
                                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">{module.desc}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] font-bold text-slate-400 bg-black/50 px-2 py-1 rounded-lg">
                                            {selectedInModule.length} / {moduleFeatureIds.length}
                                        </span>
                                        <svg className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div 
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-4 pt-0 border-t border-white/5 mt-2">
                                                <div className="flex justify-end mb-3">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleSelectAll(module.id, module.features, isAllSelected); }}
                                                        disabled={isTraining}
                                                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${isAllSelected ? 'bg-white/10 text-white border-white/20' : `${textColors[module.color]} ${bgColors[module.color]} ${borderColors[module.color]}`}`}
                                                    >
                                                        {isAllSelected ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
                                                        {isAllSelected ? 'Deselect All' : 'Select All'}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                    {module.features.map(feat => {
                                                        const isSelected = selectedFeatures.includes(feat.id);
                                                        return (
                                                            <button
                                                                key={feat.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (feat.mandatory && isSelected) {
                                                                        // Cannot unselect mandatory features
                                                                        return;
                                                                    }
                                                                    onToggleFeature(feat.id);
                                                                }}
                                                                disabled={isTraining}
                                                                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all duration-200 ${
                                                                    isSelected 
                                                                        ? `${bgColors[module.color]} ${borderColors[module.color]}` 
                                                                        : 'bg-[#0A0A0A] border-white/5 hover:border-white/20'
                                                                } ${feat.mandatory && isSelected ? 'cursor-not-allowed opacity-90' : ''}`}
                                                            >
                                                                <div className={`w-4 h-4 mt-0.5 rounded flex-shrink-0 border flex items-center justify-center transition-colors relative ${
                                                                    isSelected ? (isRetrainMode && initialLoadedFeatures.includes(feat.id) ? `bg-${module.color}-500 border-${module.color}-400` : `bg-${module.color}-500 border-${module.color}-500`) : 'border-slate-600'
                                                                }`}>
                                                                    {isSelected && <svg className="w-3 h-3 text-white relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                                    {isRetrainMode && initialLoadedFeatures.includes(feat.id) && isSelected && (
                                                                        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-white rounded-full animate-ping z-20"></div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <span className={`text-[11px] font-bold block leading-tight ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                                                        {feat.name}
                                                                    </span>
                                                                    {feat.mandatory && (
                                                                        <span className={`text-[9px] font-black uppercase mt-1 inline-block px-1.5 py-0.5 rounded bg-${module.color}-900/50 ${textColors[module.color]}`}>
                                                                            Mandatory
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default PredatoryLiquidityPipeline;
