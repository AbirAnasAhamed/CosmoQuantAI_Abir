import React, { useState, useEffect } from 'react';
import { X, Save, Layers, Activity, Zap, BarChart2, TrendingUp, Info } from 'lucide-react';
import Button from '@/components/common/Button';
import client from '@/services/client';
import { useToast } from '@/context/ToastContext';

interface StrategyBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const StrategyBuilderModal: React.FC<StrategyBuilderModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { showToast } = useToast();
    const [catalog, setCatalog] = useState<any>(null);
    const [selectedCategory, setSelectedCategory] = useState("Trend Following");
    const [selectedStrategy, setSelectedStrategy] = useState<any>(null);

    // Form State
    const [name, setName] = useState('');
    const [params, setParams] = useState<any>({});

    // 1. Load Catalog from Backend
    useEffect(() => {
        if (isOpen) {
            client.get('/strategies/catalog')
                .then(res => {
                    setCatalog(res.data);
                    // Default selection
                    if (res.data["Trend Following"]) {
                        selectStrategyTemplate(res.data["Trend Following"][0]);
                    }
                })
                .catch(err => console.error("Failed to load catalog", err));
        }
    }, [isOpen]);

    // 2. Handle Strategy Selection
    const selectStrategyTemplate = (strat: any) => {
        setSelectedStrategy(strat);
        setName(strat.name + " Custom"); // Default Name

        // Set Default Params based on type
        if (strat.type === 'crossover') setParams({ fast: 10, slow: 30 });
        else if (strat.type === 'oscillator') setParams({ period: 14, lower: 30, upper: 70 });
        else if (strat.type === 'signal') setParams({ period: 14 });
        else setParams({ period: 20, dev: 2.0 }); // Custom default
    };

    const handleSubmit = async () => {
        if (!name) return showToast('Please enter a strategy name', 'error');

        try {
            await client.post('/strategies/builder', {
                name,
                type: selectedStrategy.type,
                indicator: selectedStrategy.ind,
                params
            });
            showToast('Strategy Created Successfully!', 'success');
            onSuccess();
            onClose();
        } catch (error) {
            showToast('Failed to create strategy', 'error');
        }
    };

    if (!isOpen) return null;

    // Icons Mapping
    const getIcon = (cat: string) => {
        if (cat.includes("Trend")) return <TrendingUp size={16} />;
        if (cat.includes("Momentum")) return <Activity size={16} />;
        if (cat.includes("Volatility")) return <Zap size={16} />;
        if (cat.includes("Volume")) return <BarChart2 size={16} />;
        return <Layers size={16} />;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl h-[600px] rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col animate-fade-in-up">

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-slate-800/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Layers className="text-brand-primary" size={20} /> Strategy Library
                        </h3>
                        <p className="text-xs text-gray-500">Select a template from the world's best strategies</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500 transition-colors p-2">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">

                    {/* Sidebar: Categories */}
                    <div className="w-1/4 bg-gray-50 dark:bg-slate-800/30 border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
                        <div className="p-3 space-y-1">
                            {catalog && Object.keys(catalog).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 transition-all ${selectedCategory === cat
                                            ? 'bg-brand-primary text-white shadow-md'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    {getIcon(cat)}
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Content: Strategy Grid */}
                    <div className="w-2/4 p-6 overflow-y-auto bg-white dark:bg-slate-900">
                        <h4 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">{selectedCategory} Strategies</h4>
                        <div className="grid grid-cols-1 gap-3">
                            {catalog && catalog[selectedCategory]?.map((strat: any) => (
                                <div
                                    key={strat.name}
                                    onClick={() => selectStrategyTemplate(strat)}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-lg ${selectedStrategy?.name === strat.name
                                            ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-brand-primary/50'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h5 className="font-bold text-slate-800 dark:text-slate-200">{strat.name}</h5>
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                                            {strat.ind}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 leading-relaxed">{strat.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Panel: Configuration */}
                    <div className="w-1/4 bg-gray-50 dark:bg-slate-800/30 border-l border-gray-200 dark:border-gray-800 p-5 flex flex-col">
                        <h4 className="text-xs font-bold text-gray-400 mb-4 uppercase">Configuration</h4>

                        {selectedStrategy ? (
                            <div className="space-y-4 flex-1">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Strategy Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                                    />
                                </div>

                                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <h5 className="text-[10px] font-bold text-brand-primary mb-3 uppercase flex items-center gap-1">
                                        <Info size={10} /> Parameters
                                    </h5>
                                    <div className="space-y-3">
                                        {Object.keys(params).map((key) => (
                                            <div key={key}>
                                                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{key}</label>
                                                <input
                                                    type="number"
                                                    value={params[key]}
                                                    onChange={(e) => setParams({ ...params, [key]: parseFloat(e.target.value) })}
                                                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded p-1.5 text-sm"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-auto pt-4">
                                    <Button onClick={handleSubmit} className="w-full py-3 shadow-lg shadow-brand-primary/20">
                                        Create Strategy
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center">
                                <Activity size={32} className="mb-2 opacity-20" />
                                <p className="text-xs">Select a strategy from the list to configure</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
