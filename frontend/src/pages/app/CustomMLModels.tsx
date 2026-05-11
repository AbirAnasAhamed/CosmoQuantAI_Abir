
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mlModelsService } from '@/services/mlModelsService';
import { toast } from 'react-hot-toast';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { LstmIcon, RandomForestIcon, ArimaIcon, OtherModelIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from '@/constants';
import type { CustomMLModel, ModelVersion } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, AreaChart, Area, LineChart, Line } from 'recharts';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
// --- Visual Components ---

const NeuralMeshBackground = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 dark:opacity-20"
            style={{
                backgroundImage: 'radial-gradient(#6366F1 1px, transparent 1px)',
                backgroundSize: '30px 30px'
            }}>
        </div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
    </div>
);

const MetricBadge: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div className="flex flex-col items-center justify-center p-2 bg-white/5 border border-white/10 rounded-lg min-w-[80px]">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</span>
        <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
    </div>
);

const StatusPill: React.FC<{ status: ModelVersion['status'] }> = ({ status }) => {
    let color = 'bg-gray-500';
    let textColor = 'text-gray-200';
    let icon = <ClockIcon className="w-3 h-3" />;
    let animate = '';

    if (status === 'Ready') {
        color = 'bg-emerald-500';
        textColor = 'text-emerald-400';
        icon = <CheckCircleIcon className="w-3 h-3" />;
    } else if (status === 'Processing') {
        color = 'bg-amber-500';
        textColor = 'text-amber-400';
        icon = <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" /></svg>;
        animate = 'animate-pulse';
    } else if (status === 'Error') {
        color = 'bg-rose-500';
        textColor = 'text-rose-400';
        icon = <ExclamationCircleIcon className="w-3 h-3" />;
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full bg-opacity-10 border border-opacity-20 ${color.replace('bg-', 'border-')} ${color.replace('bg-', 'bg-')}`}>
            <span className={`${textColor}`}>{icon}</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${textColor} ${animate}`}>{status}</span>
        </div>
    );
};

// --- Modals ---

const UploadModelModal: React.FC<{
    onClose: () => void;
    onUpload: (data: { modelName?: string; modelType?: CustomMLModel['modelType']; file: File; description: string; version: number }, existingModelId?: string) => void;
    existingModel?: CustomMLModel;
}> = ({ onClose, onUpload, existingModel }) => {
    const isNewVersionMode = !!existingModel;
    const [modelName, setModelName] = useState(existingModel?.name || '');
    const [modelType, setModelType] = useState<CustomMLModel['modelType']>(existingModel?.modelType || 'LSTM');
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');

    const nextVersion = isNewVersionMode ? (Math.max(...existingModel.versions.map(v => v.version)) + 0.1).toFixed(1) : '1.0';

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (file && description && (modelName || isNewVersionMode)) {
            onUpload({
                modelName: isNewVersionMode ? undefined : modelName,
                modelType: isNewVersionMode ? undefined : modelType,
                file: file,
                description,
                version: parseFloat(nextVersion),
            }, existingModel?.id);
            onClose();
        }
    };

    const inputBaseClasses = "w-full bg-[#050505]/50 border border-gray-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all placeholder-gray-500";

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-backdrop-fade-in" onClick={onClose}>
            <div className="bg-[#000000] w-full max-w-lg rounded-3xl shadow-2xl border border-gray-800 flex flex-col overflow-hidden animate-modal-content-slide-down relative" onClick={e => e.stopPropagation()}>
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary via-purple-500 to-brand-primary"></div>

                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse"></span>
                        {isNewVersionMode ? `New Version: ${existingModel.name}` : 'Initialize New Model'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    {!isNewVersionMode && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Model Identifier</label>
                                <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="e.g. AlphaSeeker" className={inputBaseClasses} required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Architecture</label>
                                <select value={modelType} onChange={(e) => setModelType(e.target.value as any)} className={inputBaseClasses}>
                                    <optgroup label="Indicator & Tabular Engines">
                                        <option>Random Forest</option> <option>XGBoost</option> <option>LightGBM</option> <option>CatBoost</option>
                                    </optgroup>
                                    <optgroup label="Trend & Sequence Memory">
                                        <option>LSTM</option> <option>GRU</option>
                                    </optgroup>
                                    <optgroup label="Micro-Pattern & Scalping">
                                        <option>1D-CNN</option> <option>DeepLOB</option> <option>Transformer</option>
                                    </optgroup>
                                    <optgroup label="Autonomous Agents">
                                        <option>PPO-RL</option>
                                    </optgroup>
                                    <optgroup label="Other">
                                        <option>ARIMA</option> <option>Other</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/10 border-dashed">
                        <label className="block text-xs font-bold text-brand-primary uppercase tracking-wider mb-2 text-center">Upload Binary / Weights</label>
                        <div className="flex flex-col items-center justify-center gap-3">
                            <label htmlFor="file-upload" className="cursor-pointer px-6 py-3 bg-brand-primary text-white rounded-full text-sm font-bold hover:bg-brand-primary-hover transition-all shadow-lg shadow-brand-primary/20">
                                Choose File
                                <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
                            </label>
                            <span className="text-xs font-mono text-gray-400">{file?.name || "Supports .pkl, .h5, .onnx, .pt"}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Version Notes (v{nextVersion})</label>
                        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe changes, e.g. 'Increased epoch count'" className={inputBaseClasses} required />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                        <Button type="button" variant="secondary" onClick={onClose}>Abort</Button>
                        <Button type="submit" variant="primary" className="shadow-lg shadow-brand-primary/20">Deploy to Registry</Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ExplainabilityView: React.FC<{ data: any; algorithm?: string }> = ({ data, algorithm }) => {
    if (!data || Object.keys(data).length === 0) {
        return <div className="text-center py-10 text-gray-500 font-bold">No explainability data available for this version. Please retrain.</div>;
    }

    if (algorithm === 'PPO-RL' || data.total_return_pct !== undefined) {
        return (
            <div className="space-y-6 animate-fade-in pb-10">
                <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-6 shadow-inner">
                    <h3 className="text-sm font-bold text-purple-400 mb-6 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        RL Agent Performance Metrics
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="bg-black/40 border border-white/5 rounded-lg p-4 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Total Return</p>
                            <p className={`text-xl font-mono font-bold ${data.total_return_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{data.total_return_pct?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-4 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Win Rate</p>
                            <p className="text-xl font-mono font-bold text-emerald-400">{data.win_rate?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-4 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Sharpe Ratio</p>
                            <p className="text-xl font-mono font-bold text-blue-400">{data.sharpe_ratio?.toFixed(2)}</p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-4 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">Trades Executed</p>
                            <p className="text-xl font-mono font-bold text-purple-400">{data.trades_count}</p>
                        </div>
                    </div>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h4 className="text-white font-bold text-sm mb-2">Deep Policy Network (PPO)</h4>
                    <p className="text-xs text-gray-400 max-w-lg mx-auto leading-relaxed">
                        Reinforcement Learning models do not use traditional feature importance or decision trees. 
                        They learn optimal trading policies through continuous trial and error (reward maximization).
                        <br/><br/>
                        To visualize the agent's actual trading behavior, please refer to the <strong>Equity Curve</strong> generated in the Training Studio logs.
                    </p>
                </div>
            </div>
        );
    }

    const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B'];

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* 1. Feature Importance */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2"><svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> Feature Importance</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.featureImportance} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} width={120} />
                            <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#111', borderColor: '#333', borderRadius: '8px'}} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {data.featureImportance?.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 2. Partial Dependence (PDP) */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">Partial Dependence Plot</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.pdpData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorY" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="x" tick={{fill: '#6B7280', fontSize: 10}} tickLine={false} axisLine={false}/>
                                <YAxis tick={{fill: '#6B7280', fontSize: 10}} tickLine={false} axisLine={false}/>
                                <RechartsTooltip contentStyle={{backgroundColor: '#111', borderColor: '#333', borderRadius: '8px'}}/>
                                <Area type="monotone" dataKey="y" stroke="#14B8A6" fillOpacity={1} fill="url(#colorY)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Actual vs Predicted */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">Actual vs Predicted (Test Set)</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.timeSeriesData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                <XAxis dataKey="time" hide />
                                <YAxis domain={['auto', 'auto']} tick={{fill: '#6B7280', fontSize: 10}} tickLine={false} axisLine={false}/>
                                <RechartsTooltip contentStyle={{backgroundColor: '#111', borderColor: '#333', borderRadius: '8px'}}/>
                                <Line type="monotone" dataKey="actual" stroke="#6B7280" strokeWidth={2} dot={false} name="Actual" />
                                <Line type="monotone" dataKey="predicted" stroke="#6366F1" strokeWidth={2} strokeDasharray="3 3" dot={false} name="Predicted" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 4. Confusion Matrix */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col">
                    <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">Confusion Matrix</h3>
                    <div className="flex-1 flex items-center justify-center">
                        <div className="grid grid-cols-4 gap-1 w-full max-w-[240px]">
                            <div className="col-span-1"></div>
                            {data.confusionMatrix?.classes.map((c: string) => <div key={`col-${c}`} className="text-center text-[10px] text-gray-500 font-bold">{c}</div>)}
                            
                            {data.confusionMatrix?.matrix.map((row: number[], i: number) => (
                                <React.Fragment key={`row-${i}`}>
                                    <div className="text-right text-[10px] text-gray-500 font-bold pr-2 flex items-center justify-end">{data.confusionMatrix.classes[i]}</div>
                                    {row.map((val: number, j: number) => {
                                        const intensity = val / 100;
                                        return (
                                            <div key={`cell-${i}-${j}`} className="aspect-square flex items-center justify-center rounded text-sm font-mono font-bold" style={{ backgroundColor: i===j ? `rgba(16, 185, 129, ${0.1 + intensity*0.9})` : `rgba(239, 68, 68, ${0.1 + intensity*0.5})`, color: intensity > 0.5 ? 'white' : '#9CA3AF' }}>
                                                {val}
                                            </div>
                                        )
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 5. SHAP Summary */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">SHAP Summary (Impact)</h3>
                    <div className="space-y-4">
                        {['Level2_Imbalance', 'Volume_Profile', 'RSI_14'].map(feature => {
                            const dots = data.shapSummary?.filter((s:any) => s.feature === feature) || [];
                            return (
                                <div key={feature} className="flex items-center gap-2">
                                    <div className="w-28 text-[10px] text-gray-400 truncate text-right font-bold">{feature}</div>
                                    <div className="flex-1 relative h-6 bg-white/5 rounded">
                                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600"></div>
                                        {dots.map((d:any, i:number) => {
                                            const left = 50 + (d.impact * 500); 
                                            const color = d.value === 'High' ? '#EF4444' : '#3B82F6';
                                            return (
                                                <div key={i} className="absolute top-1.5 w-3 h-3 rounded-full opacity-80" style={{ left: `${Math.min(Math.max(left, 0), 95)}%`, backgroundColor: color }}></div>
                                            )
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-800">
                            <span>Negative</span>
                            <span>Value: <span className="text-blue-500">Low</span> / <span className="text-red-500">High</span></span>
                            <span>Positive</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 6. Decision Tree */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 h-80 flex flex-col">
                <h3 className="text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">Decision Tree Logic</h3>
                <div className="flex-1 border border-white/5 rounded-lg overflow-hidden bg-[#050505]">
                    <ReactFlow 
                        nodes={data.decisionTree?.nodes.map((n:any) => ({
                            id: n.id,
                            position: { 
                                x: n.id === '1' ? 250 : n.id === '2' ? 100 : n.id === '3' ? 400 : n.id === '4' ? 0 : n.id === '5' ? 250 : 500, 
                                y: n.id === '1' ? 20 : ['2','3'].includes(n.id) ? 120 : 220 
                            },
                            data: { label: n.label },
                            style: { background: n.type === 'leaf' ? (n.color === 'green' ? '#10B981' : n.color==='red'?'#EF4444':'#6B7280') : '#1E1B4B', color: '#fff', border: '1px solid #4338CA', borderRadius: '8px', padding: '8px 10px', fontSize: '10px', fontWeight: 'bold', width: 140, textAlign: 'center' }
                        })) || []}
                        edges={data.decisionTree?.edges.map((e:any) => ({
                            id: `e${e.source}-${e.target}`,
                            source: e.source,
                            target: e.target,
                            label: e.label,
                            labelStyle: { fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' },
                            style: { stroke: '#4B5563' },
                            animated: true
                        })) || []}
                        fitView
                        attributionPosition="bottom-right"
                    >
                        <Background color="#333" gap={16} />
                        <Controls className="bg-white/10 border-white/20 fill-white" showInteractive={false} />
                    </ReactFlow>
                </div>
            </div>

        </div>
    );
};

const ModelDetailsModal: React.FC<{
    modelId: string;
    modelName: string;
    onClose: () => void;
}> = ({ modelId, modelName, onClose }) => {
    const [config, setConfig] = useState<any>(null);
    const [explainData, setExplainData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'config'|'explain'>('config');

    React.useEffect(() => {
        setLoading(true);
        Promise.all([
            mlModelsService.getModelConfig(modelId),
            mlModelsService.getModelExplainability(modelId).catch(() => ({}))
        ]).then(([configRes, explainRes]) => {
            setConfig(configRes);
            setExplainData(explainRes);
            setLoading(false);
        }).catch(err => {
            console.error("Failed to load details", err);
            setLoading(false);
        });
    }, [modelId]);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-backdrop-fade-in" onClick={onClose}>
            <div className="bg-[#0A0A0A] w-full max-w-2xl rounded-3xl shadow-2xl border border-gray-800 flex flex-col overflow-hidden relative animate-modal-content-slide-down" onClick={e => e.stopPropagation()}>
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600"></div>

                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-white/5">
                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Training Details: <span className="text-cyan-400">{modelName}</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">&times;</button>
                </div>

                <div className="flex border-b border-gray-800 bg-[#0A0A0A]">
                    <button onClick={() => setActiveTab('config')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-all ${activeTab === 'config' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Configuration</button>
                    <button onClick={() => setActiveTab('explain')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-all ${activeTab === 'explain' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>Model Insights</button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar bg-[#0A0A0A]">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500"></div>
                        </div>
                    ) : activeTab === 'config' ? (
                        config ? (
                            <div className="space-y-6">
                                {/* General Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Target Asset</p>
                                        <p className="text-sm font-mono text-white">{config.symbol || 'N/A'}</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Timeframe</p>
                                        <p className="text-sm font-mono text-white">{config.timeframe || 'N/A'}</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Algorithm</p>
                                        <p className="text-sm font-mono text-purple-400 font-bold">{config.algorithm || 'N/A'}</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Epochs/Trees</p>
                                        <p className="text-sm font-mono text-white">{config.config?.epochs || 'N/A'}</p>
                                    </div>
                                </div>

                                {/* Features */}
                                {config.config?.indicators && config.config.indicators.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-400 mb-3 border-b border-gray-800 pb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                                            Technical Indicators (OHLCV)
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {config.config.indicators.map((ind: string) => (
                                                <span key={ind} className="px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg text-xs font-bold shadow-sm">
                                                    {ind}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* L2 Features */}
                                {config.config?.l2_features && config.config.l2_features.length > 0 && (
                                    <div className="mt-6">
                                        <h3 className="text-sm font-bold text-gray-400 mb-3 border-b border-gray-800 pb-2 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                                            Orderbook Features (L2)
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {config.config.l2_features.map((feat: string) => (
                                                <span key={feat} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold shadow-sm">
                                                    {feat}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(!config.config?.indicators?.length && !config.config?.l2_features?.length) && (
                                    <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-800 rounded-xl">
                                        No detailed feature information available for this model. (It might have been uploaded manually or trained without custom features).
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-red-400 font-bold">Failed to load configuration.</div>
                        )
                    ) : (
                        <ExplainabilityView data={explainData} algorithm={config?.algorithm} />
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Model Card ---

const ModelCard: React.FC<{
    model: CustomMLModel;
    onDelete: (id: string) => void;
    onUploadVersion: (model: CustomMLModel) => void;
    onSetActiveVersion: (modelId: string, versionId: string) => void;
    onRetrain: (modelId: string) => void;
    onViewDetails: (modelId: string, modelName: string) => void;
    animationDelay: number;
}> = ({ model, onDelete, onUploadVersion, onSetActiveVersion, onRetrain, onViewDetails, animationDelay }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const modelIcons: Record<CustomMLModel['modelType'], React.ReactNode> = {
        'LSTM': <LstmIcon className="w-8 h-8" />,
        'Random Forest': <RandomForestIcon className="w-8 h-8" />,
        'XGBoost': <OtherModelIcon className="w-8 h-8" />,
        'LightGBM': <OtherModelIcon className="w-8 h-8" />,
        'CatBoost': <OtherModelIcon className="w-8 h-8" />,
        'GRU': <OtherModelIcon className="w-8 h-8" />,
        '1D-CNN': <OtherModelIcon className="w-8 h-8" />,
        'DeepLOB': <OtherModelIcon className="w-8 h-8" />,
        'Transformer': <OtherModelIcon className="w-8 h-8" />,
        'PPO-RL': <OtherModelIcon className="w-8 h-8" />,
        'ARIMA': <ArimaIcon className="w-8 h-8" />,
        'Other': <OtherModelIcon className="w-8 h-8" />,
    };

    const activeVersion = model.versions.find(v => v.id === model.activeVersionId);

    // Real Metrics from API
    const rawAccuracy = activeVersion?.accuracy;
    const accuracyDisplay = rawAccuracy !== undefined && rawAccuracy !== null ? `${(rawAccuracy * 100).toFixed(1)}%` : '--';
    
    const rawF1 = activeVersion?.f1_score;
    const f1Display = rawF1 !== undefined && rawF1 !== null ? rawF1.toFixed(4) : '--';

    const rawLatency = activeVersion?.latency;
    const latencyDisplay = rawLatency !== undefined && rawLatency !== null ? `${Math.round(rawLatency)}ms` : '--';

    return (
        <div
            className="relative group bg-white dark:bg-[#0A0A0A]/80 backdrop-blur-md border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden hover:border-brand-primary/50 transition-all duration-500 animate-fade-in-slide-up shadow-lg hover:shadow-2xl hover:shadow-brand-primary/10"
            style={{ animationDelay: `${animationDelay}ms` }}
        >
            {/* Top Glow */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="p-6 relative z-10">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-brand-primary shadow-inner">
                            {modelIcons[model.modelType]}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-primary transition-colors">{model.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-white/5 rounded text-[10px] font-bold uppercase text-gray-500 border border-gray-200 dark:border-white/10">{model.modelType}</span>
                                <span className="text-xs text-gray-400 font-mono">v{activeVersion?.version.toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); onDelete(model.id); }} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>

                {/* Performance HUD */}
                <div className="bg-gray-50 dark:bg-[#000000] rounded-xl p-4 border border-gray-200 dark:border-gray-800 mb-6 relative overflow-hidden">
                    {/* Scanline */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%] opacity-30"></div>

                    <div className="flex justify-between items-center relative z-10">
                        <MetricBadge label="Accuracy" value={accuracyDisplay} color="text-emerald-400" />
                        <MetricBadge label="F1 Score" value={f1Display} color="text-blue-400" />
                        <MetricBadge label="Latency" value={latencyDisplay} color="text-purple-400" />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <StatusPill status={activeVersion?.status || 'Error'} />
                    <div className="flex gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewDetails(model.id, model.name); }}
                            className="px-3 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm border border-gray-500/20 flex items-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Details
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onRetrain(model.id); }}
                            className="px-4 py-1.5 bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm hover:shadow-brand-primary/20 flex items-center gap-2"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Retrain
                        </button>
                    </div>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-brand-primary transition-colors uppercase tracking-wider"
                    >
                        {isExpanded ? 'Hide History' : 'View History'}
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                </div>
            </div>

            {/* Expandable History Panel */}
            <div className={`bg-gray-50 dark:bg-black/20 border-t border-gray-200 dark:border-gray-800 transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="p-4 space-y-2 overflow-y-auto max-h-80 custom-scrollbar">
                    {model.versions.map(version => (
                        <div key={version.id} className="group/row flex items-center justify-between p-3 rounded-lg hover:bg-white dark:hover:bg-white/5 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-white/10">
                            <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-8 rounded-full ${version.id === model.activeVersionId ? 'bg-brand-primary' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">v{version.version.toFixed(1)}</span>
                                        {version.id === model.activeVersionId && <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 rounded">ACTIVE</span>}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate w-32">{version.description}</p>
                                </div>
                            </div>

                            {version.status === 'Ready' && version.id !== model.activeVersionId ? (
                                <Button size="sm" variant="secondary" className="text-[10px] h-7 px-2" onClick={() => onSetActiveVersion(model.id, version.id)}>Activate</Button>
                            ) : (
                                <span className="text-[10px] text-gray-400 font-mono">{version.uploadDate}</span>
                            )}
                        </div>
                    ))}
                    <button
                        onClick={() => onUploadVersion(model)}
                        className="w-full py-2 mt-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-500 hover:text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5 transition-all"
                    >
                        + Upload New Version
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main Page ---

import { AppView } from '@/types';

const CustomMLModels: React.FC<{ onNavigate?: (view: AppView, section?: string) => void }> = ({ onNavigate }) => {
    const queryClient = useQueryClient();
    const [modalState, setModalState] = useState<{ isOpen: boolean; modelToUpdate?: CustomMLModel }>({ isOpen: false });
    const [detailsModalState, setDetailsModalState] = useState<{ isOpen: boolean; modelId: string; modelName: string }>({ isOpen: false, modelId: '', modelName: '' });

    // Fetch models
    const { data: models = [], isLoading } = useQuery({
        queryKey: ['mlModels'],
        queryFn: mlModelsService.getModels,
        // Smart Polling: Only poll every 5s IF there's any model version currently "Processing"
        refetchInterval: (query) => {
            const currentModels = query.state.data || [];
            const isProcessing = currentModels.some((m: CustomMLModel) => 
                m.versions.some((v: ModelVersion) => v.status === 'Processing')
            );
            return isProcessing ? 5000 : false;
        },
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => mlModelsService.createModel(data.modelName!, data.modelType!, data.version, data.description, data.file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mlModels'] });
            toast.success('Model created and uploading!');
        },
        onError: () => toast.error('Failed to create model'),
    });

    const uploadVersionMutation = useMutation({
        mutationFn: ({ modelId, data }: { modelId: string; data: any }) => mlModelsService.uploadVersion(modelId, data.version, data.description, data.file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mlModels'] });
            toast.success('New version uploaded!');
        },
        onError: () => toast.error('Failed to upload version'),
    });

    const setVersionMutation = useMutation({
        mutationFn: ({ modelId, versionId }: { modelId: string; versionId: string }) => mlModelsService.setActiveVersion(modelId, versionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mlModels'] });
            toast.success('Active version updated');
        },
        onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to set active version'),
    });

    const deleteMutation = useMutation({
        mutationFn: mlModelsService.deleteModel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mlModels'] });
            toast.success('Model deleted');
        },
        onError: () => toast.error('Failed to delete model'),
    });

    const handleUpload = (data: { modelName?: string; modelType?: CustomMLModel['modelType']; file: File; description: string; version: number }, existingModelId?: string) => {
        if (existingModelId) { // Uploading a new version
            uploadVersionMutation.mutate({ modelId: existingModelId, data });
        } else { // Uploading a new model
            createMutation.mutate(data);
        }
    };

    const handleDelete = (modelId: string) => {
        if (window.confirm("Are you sure you want to delete this model?")) {
            deleteMutation.mutate(modelId);
        }
    };

    const handleSetActiveVersion = (modelId: string, versionId: string) => {
        setVersionMutation.mutate({ modelId, versionId });
    };

    const handleRetrain = (modelId: string) => {
        if (onNavigate) {
            onNavigate(AppView.MODEL_TRAINING_STUDIO, modelId);
        } else {
            toast.error("Navigation not available");
        }
    };

    const handleViewDetails = (modelId: string, modelName: string) => {
        setDetailsModalState({ isOpen: true, modelId, modelName });
    };

    return (
        <div className="relative min-h-[calc(100vh-140px)]">
            <NeuralMeshBackground />

            {modalState.isOpen && <UploadModelModal onClose={() => setModalState({ isOpen: false })} onUpload={handleUpload} existingModel={modalState.modelToUpdate} />}
            {detailsModalState.isOpen && <ModelDetailsModal modelId={detailsModalState.modelId} modelName={detailsModalState.modelName} onClose={() => setDetailsModalState({ ...detailsModalState, isOpen: false })} />}

            <div className="relative z-10 flex flex-col gap-8">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-lg border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-brand-primary to-purple-600 rounded-xl shadow-lg shadow-brand-primary/20 text-white">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Quant Model Registry</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">Manage predictive models, track version efficacy, and deploy to Bot Lab.</p>
                        </div>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => setModalState({ isOpen: true })}
                        className="shadow-xl shadow-brand-primary/30 hover:scale-105 transition-transform px-6 py-3 rounded-xl font-bold flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                        Initialize New Model
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                    {isLoading ? (
                        <div className="col-span-full flex justify-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
                        </div>
                    ) : (
                        <>
                            {models.map((model, index) => (
                                <ModelCard
                                    key={model.id}
                                    model={model}
                                    onDelete={handleDelete}
                                    onUploadVersion={(m) => setModalState({ isOpen: true, modelToUpdate: m })}
                                    onSetActiveVersion={handleSetActiveVersion}
                                    onRetrain={handleRetrain}
                                    onViewDetails={handleViewDetails}
                                    animationDelay={index * 100}
                                />
                            ))}

                            {/* Add New Placeholder */}
                            <button
                                onClick={() => setModalState({ isOpen: true })}
                                className="group relative border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center p-10 text-center hover:border-brand-primary hover:bg-brand-primary/5 transition-all duration-300 min-h-[300px]"
                            >
                                <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-inner">
                                    <svg className="w-8 h-8 text-gray-400 group-hover:text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400 group-hover:text-brand-primary transition-colors">Deploy New Model</h3>
                                <p className="text-xs text-gray-400 mt-2 max-w-[200px]">Upload .h5, .pkl or .onnx files to integrate custom logic.</p>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomMLModels;

