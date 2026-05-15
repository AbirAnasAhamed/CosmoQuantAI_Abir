import React from 'react';
import { motion } from 'framer-motion';
import { Globe, Github, TrendingUp } from 'lucide-react';

interface AlternativeDataSettingsProps {
    isTraining: boolean;
    selectedAltFeatures: string[];
    setSelectedAltFeatures: React.Dispatch<React.SetStateAction<string[]>>;
}

export const AlternativeDataSettings: React.FC<AlternativeDataSettingsProps> = ({
    isTraining,
    selectedAltFeatures,
    setSelectedAltFeatures
}) => {
    const ALT_DATA_SOURCES = [
        {
            id: 'fng_value',
            name: 'Fear & Greed Index',
            desc: 'Crypto market sentiment (0-100)',
            icon: TrendingUp,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/30'
        },
        {
            id: 'search_interest',
            name: 'Google Trends',
            desc: 'Search interest for the asset',
            icon: Globe,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/30'
        },
        {
            id: 'commit_count',
            name: 'GitHub Activity',
            desc: 'Daily commit frequency',
            icon: Github,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/30'
        }
    ];

    const toggleFeature = (id: string) => {
        setSelectedAltFeatures(prev => 
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        );
    };

    return (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 shadow-inner mt-4">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" /> Alternative Data (Macro & Social)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {ALT_DATA_SOURCES.map((source) => {
                    const isSelected = selectedAltFeatures.includes(source.id);
                    const Icon = source.icon;
                    return (
                        <button
                            key={source.id}
                            onClick={() => toggleFeature(source.id)}
                            disabled={isTraining}
                            className={`p-2 rounded-xl border text-left transition-all duration-300 flex items-center gap-2 ${
                                isSelected 
                                    ? `${source.bg} ${source.border} shadow-[0_0_15px_rgba(255,255,255,0.05)] scale-[1.02]` 
                                    : 'bg-black/60 border-white/5 hover:border-white/20 hover:bg-white/5'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <div className={`p-1.5 rounded-lg ${isSelected ? source.bg : 'bg-white/5'}`}>
                                <Icon className={`w-3.5 h-3.5 ${isSelected ? source.color : 'text-slate-500'}`} />
                            </div>
                            <div className="flex-1">
                                <div className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                    {source.name}
                                </div>
                            </div>
                            
                            {/* Checkbox indicator */}
                            <div className="ml-auto">
                                <div className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center transition-all ${isSelected ? `${source.border} bg-white/10` : 'border-slate-700'}`}>
                                    {isSelected && <div className={`w-1.5 h-1.5 rounded-full ${source.bg.replace('/10', '')}`} />}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
            
            <p className="text-[10px] text-slate-500 mt-4 border-t border-white/5 pt-3">
                Alternative data is fetched dynamically during training and merged on daily timestamps. This allows the model to learn from external market psychology and developer momentum.
            </p>
        </div>
    );
};
