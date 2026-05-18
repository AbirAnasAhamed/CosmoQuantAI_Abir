
import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mlModelsService } from '@/services/mlModelsService';
import { mlTrainingService } from '@/services/mlTrainingService';
import { toast } from 'react-hot-toast';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { LstmIcon, RandomForestIcon, ArimaIcon, OtherModelIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from '@/constants';
import type { CustomMLModel, ModelVersion } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, AreaChart, Area, LineChart, Line } from 'recharts';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { Layers } from 'lucide-react';
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
    let colorClass = 'bg-gray-500/10 border-gray-500/20 text-gray-400 shadow-[0_0_10px_rgba(107,114,128,0.1)]';
    let icon = <ClockIcon className="w-3.5 h-3.5" />;
    let animate = '';

    if (status === 'Ready') {
        colorClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] hover:border-emerald-400/50';
        icon = <CheckCircleIcon className="w-3.5 h-3.5 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]" />;
    } else if (status === 'Processing') {
        colorClass = 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] hover:border-amber-400/50';
        icon = <svg className="animate-spin w-3.5 h-3.5 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" /></svg>;
        animate = 'animate-pulse';
    } else if (status === 'Error') {
        colorClass = 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(243,24,113,0.2)] hover:shadow-[0_0_25px_rgba(243,24,113,0.4)] hover:border-rose-400/50';
        icon = <ExclamationCircleIcon className="w-3.5 h-3.5 drop-shadow-[0_0_5px_rgba(243,24,113,0.8)]" />;
    }

    return (
        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border backdrop-blur-md transition-all duration-500 cursor-default ${colorClass}`}>
            <span>{icon}</span>
            <span className={`text-[11px] font-bold uppercase tracking-widest drop-shadow-sm ${animate}`}>{status}</span>
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

// --- Signal Modal ---

type SignalResult = {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    price: number;
    symbol: string;
    algorithm: string;
    timestamp: string;
    features_used?: number;
    dataset_type?: string;
};

const SignalModal: React.FC<{
    result: SignalResult;
    modelName: string;
    onClose: () => void;
}> = ({ result, modelName, onClose }) => {
    const cfgMap = {
        BUY: {
            outerGlow:   'shadow-emerald-500/30',
            ring:        'from-emerald-400 to-teal-300',
            ringBg:      'bg-emerald-500/10',
            border:      'border-emerald-500/30',
            text:        'text-emerald-400',
            badge:       'bg-emerald-500/20 border-emerald-500/40',
            accent:      'from-emerald-500 via-teal-400 to-emerald-600',
            label:       'BUY',
            icon:        '▲',
            glow:        'rgba(16,185,129,0.15)',
        },
        SELL: {
            outerGlow:   'shadow-rose-500/30',
            ring:        'from-rose-400 to-pink-300',
            ringBg:      'bg-rose-500/10',
            border:      'border-rose-500/30',
            text:        'text-rose-400',
            badge:       'bg-rose-500/20 border-rose-500/40',
            accent:      'from-rose-500 via-pink-400 to-rose-600',
            label:       'SELL',
            icon:        '▼',
            glow:        'rgba(244,63,94,0.15)',
        },
        HOLD: {
            outerGlow:   'shadow-amber-500/30',
            ring:        'from-amber-400 to-yellow-300',
            ringBg:      'bg-amber-500/10',
            border:      'border-amber-500/30',
            text:        'text-amber-400',
            badge:       'bg-amber-500/20 border-amber-500/40',
            accent:      'from-amber-500 via-yellow-400 to-amber-600',
            label:       'HOLD',
            icon:        '■',
            glow:        'rgba(245,158,11,0.15)',
        },
    };
    
    // Fallback for custom signals (like Auto-Encoder anomaly strings)
    const signalUpper = result.signal.toUpperCase();
    const isCrash = signalUpper.includes('CRASH');
    const isPump = signalUpper.includes('PUMP');
    const cfg = cfgMap[result.signal as keyof typeof cfgMap] || {
        outerGlow:   isCrash ? 'shadow-rose-500/30' : isPump ? 'shadow-emerald-500/30' : 'shadow-cyan-500/30',
        ring:        isCrash ? 'from-rose-400 to-pink-300' : isPump ? 'from-emerald-400 to-teal-300' : 'from-cyan-400 to-blue-300',
        ringBg:      isCrash ? 'bg-rose-500/10' : isPump ? 'bg-emerald-500/10' : 'bg-cyan-500/10',
        border:      isCrash ? 'border-rose-500/30' : isPump ? 'border-emerald-500/30' : 'border-cyan-500/30',
        text:        isCrash ? 'text-rose-400' : isPump ? 'text-emerald-400' : 'text-cyan-400',
        badge:       isCrash ? 'bg-rose-500/20 border-rose-500/40' : isPump ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-cyan-500/20 border-cyan-500/40',
        accent:      isCrash ? 'from-rose-500 via-pink-400 to-rose-600' : isPump ? 'from-emerald-500 via-teal-400 to-emerald-600' : 'from-cyan-500 via-blue-400 to-cyan-600',
        label:       result.signal.toUpperCase(),
        icon:        isCrash ? '▼' : isPump ? '▲' : '⚡',
        glow:        isCrash ? 'rgba(244,63,94,0.15)' : isPump ? 'rgba(16,185,129,0.15)' : 'rgba(6,182,212,0.15)',
    };

    // Circular progress for confidence
    const pct    = Math.round(result.confidence * 100);
    const radius = 40;
    const circ   = 2 * Math.PI * radius;
    const dash   = (pct / 100) * circ;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}
        >
            <div
                className={`relative w-full max-w-xs rounded-3xl border ${cfg.border} shadow-2xl ${cfg.outerGlow} overflow-hidden`}
                style={{ background: 'linear-gradient(135deg, #0a0a0a 60%, #111)', boxShadow: `0 0 80px 0 ${cfg.glow}, 0 25px 50px rgba(0,0,0,0.6)` }}
                onClick={e => e.stopPropagation()}
            >
                {/* Top gradient accent bar */}
                <div className={`h-1 w-full bg-gradient-to-r ${cfg.accent}`} />

                {/* Ambient background glow blob */}
                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 0%, ${cfg.glow} 0%, transparent 70%)` }} />

                <div className="relative z-10 p-7 flex flex-col items-center text-center gap-4">

                    {/* Model name */}
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500">{modelName}</p>

                    {/* Confidence ring + Signal label */}
                    <div className="relative flex items-center justify-center">
                        {/* SVG ring */}
                        <svg width="110" height="110" className="-rotate-90">
                            {/* Track */}
                            <circle cx="55" cy="55" r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
                            {/* Progress */}
                            <circle
                                cx="55" cy="55" r={radius}
                                stroke="url(#ringGrad)" strokeWidth="8" fill="none"
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${circ}`}
                                style={{ transition: 'stroke-dasharray 1s ease' }}
                            />
                            <defs>
                                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={result.signal === 'BUY' ? '#10b981' : result.signal === 'SELL' ? '#f43f5e' : '#f59e0b'} />
                                    <stop offset="100%" stopColor={result.signal === 'BUY' ? '#2dd4bf' : result.signal === 'SELL' ? '#fb7185' : '#fbbf24'} />
                                </linearGradient>
                            </defs>
                        </svg>
                        {/* Centre content */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-2xl font-black ${cfg.text}`}>{cfg.icon}</span>
                            <span className="text-xs font-bold text-gray-400 mt-0.5">{pct}%</span>
                        </div>
                    </div>

                    {/* Signal badge */}
                    <div className={`flex items-center gap-2 px-6 py-2 rounded-full border ${cfg.badge} animate-pulse`}>
                        <span className={`text-2xl font-black tracking-widest ${cfg.text}`}>{cfg.label}</span>
                    </div>

                    {/* Confidence label */}
                    <p className="text-xs text-gray-500">
                        Confidence — <span className={`font-bold ${cfg.text}`}>{pct}%</span>
                    </p>

                    {/* Info rows */}
                    <div className="w-full bg-white/4 rounded-2xl border border-white/6 p-4 space-y-2.5 text-left">
                        {[
                            { label: 'Price',     value: `$${result.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, color: 'text-white' },
                            { label: 'Symbol',    value: result.symbol,     color: 'text-gray-300' },
                            { label: 'Algorithm', value: result.algorithm,  color: 'text-purple-400' },
                            ...(result.features_used ? [{ label: 'Features', value: `${result.features_used} features`, color: 'text-gray-400' }] : []),
                        ].map(({ label, value, color }) => (
                            <div key={label} className="flex justify-between items-center">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{label}</span>
                                <span className={`text-xs font-mono font-bold ${color}`}>{value}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Generated</span>
                            <span className="text-[10px] font-mono text-gray-600">{new Date(result.timestamp).toLocaleTimeString()}</span>
                        </div>
                    </div>

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 mt-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-sm font-bold text-gray-500 hover:text-white transition-all duration-200"
                    >
                        Close
                    </button>
                </div>
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

            {/* 7. Backtest Performance Card */}
            {data.backtest_result && (
                <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        Post-Training Backtest Performance
                        <span className="ml-auto text-[10px] text-gray-500 font-normal">Initial: ${data.backtest_result.initial_balance?.toLocaleString()}</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Return</p>
                            <p className={`text-xl font-mono font-bold ${data.backtest_result.profit_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {data.backtest_result.profit_pct >= 0 ? '+' : ''}{data.backtest_result.profit_pct?.toFixed(2)}%
                            </p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Win Rate</p>
                            <p className="text-xl font-mono font-bold text-blue-400">{data.backtest_result.win_rate?.toFixed(1)}%</p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Max DD</p>
                            <p className="text-xl font-mono font-bold text-rose-400">-{data.backtest_result.max_drawdown?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Kelly %</p>
                            <p className="text-xl font-mono font-bold text-teal-400">{data.backtest_result.kelly_pct !== undefined ? data.backtest_result.kelly_pct.toFixed(1) + '%' : 'N/A'}</p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">MC Ruin Risk</p>
                            <p className={`text-xl font-mono font-bold ${data.backtest_result.risk_of_ruin > 5 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {data.backtest_result.risk_of_ruin !== undefined ? data.backtest_result.risk_of_ruin.toFixed(1) + '%' : 'N/A'}
                            </p>
                        </div>
                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Trades</p>
                            <p className="text-xl font-mono font-bold text-purple-400">{data.backtest_result.total_trades}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 8. Walk-Forward CV Scores */}
            {data.cv_scores && data.cv_scores.cv_scores?.length > 0 && (
                <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        Walk-Forward CV Results
                    </h3>
                    <div className="flex gap-2 items-end">
                        {data.cv_scores.cv_scores.map((score: number, i: number) => (
                            <div key={i} className="flex-1 text-center">
                                <div className="bg-blue-500/20 rounded-t" style={{ height: `${Math.max(4, score * 80)}px` }}></div>
                                <p className="text-[10px] text-blue-400 font-mono mt-1">{(score * 100).toFixed(1)}%</p>
                                <p className="text-[9px] text-gray-600">F{i+1}</p>
                            </div>
                        ))}
                        <div className="flex-1 text-center border-l border-white/10 pl-2">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Avg</p>
                            <p className="text-sm font-mono font-bold text-blue-400">{((data.cv_scores.cv_avg || 0) * 100).toFixed(1)}%</p>
                            <p className="text-[9px] text-gray-500">&plusmn;{((data.cv_scores.cv_std || 0) * 100).toFixed(1)}%</p>
                        </div>
                    </div>
                </div>
            )}

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
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            await mlModelsService.downloadModel(modelId, modelName);
            toast.success('Model downloaded successfully!');
        } catch (err: any) {
            const msg = err?.response?.data?.detail || 'Download failed';
            toast.error(msg);
        } finally {
            setIsDownloading(false);
        }
    };

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-backdrop-fade-in" onClick={onClose}>
            {/* Dark blur backdrop with subtle ambient light */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md"></div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.15)_0%,transparent_50%)] pointer-events-none"></div>

            <div className="w-full max-w-3xl rounded-3xl flex flex-col overflow-hidden relative animate-modal-content-slide-down z-10" 
                 style={{
                     background: 'linear-gradient(145deg, rgba(15,20,30,0.95) 0%, rgba(5,10,15,0.98) 100%)',
                     boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 30px 60px -10px rgba(0,0,0,0.8), 0 0 80px rgba(56,189,248,0.15)',
                 }}
                 onClick={e => e.stopPropagation()}
            >
                {/* Top glow line */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70"></div>
                
                {/* Ambient glow in top corners */}
                <div className="absolute top-0 left-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                {/* Header */}
                <div className="p-6 relative z-10 flex justify-between items-center border-b border-white/[0.05]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center border border-cyan-500/30 shadow-[inset_0_0_20px_rgba(56,189,248,0.1)]">
                            <svg className="w-6 h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight text-white">
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400">Model Inspector</span>
                            </h2>
                            <p className="text-xs text-gray-400 font-medium tracking-wide mt-1 uppercase">ID: {modelName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Download Button */}
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            title="Download Model Weights"
                            className="group relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            <div className="absolute inset-0 rounded-xl border border-emerald-500/30 group-hover:border-emerald-400/50 transition-colors duration-300"></div>
                            <div className="relative flex items-center gap-2 text-emerald-400 group-hover:text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                                {isDownloading ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        Downloading...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        Download Weights
                                    </>
                                )}
                            </div>
                        </button>
                        
                        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/5 hover:border-white/10">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Modern Segmented Control for Tabs */}
                <div className="px-6 pt-6 relative z-10">
                    <div className="flex p-1 bg-black/40 rounded-2xl border border-white/5 shadow-inner relative">
                        <div className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out" style={{ transform: activeTab === 'config' ? 'translateX(0)' : 'translateX(calc(100% + 8px))' }}></div>
                        <button 
                            onClick={() => setActiveTab('config')} 
                            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider relative z-10 transition-colors duration-300 ${activeTab === 'config' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Configuration & Features
                        </button>
                        <button 
                            onClick={() => setActiveTab('explain')} 
                            className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider relative z-10 transition-colors duration-300 ${activeTab === 'explain' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Model Insights & Explainability
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto max-h-[65vh] custom-scrollbar relative z-10">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="relative w-16 h-16 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-t-2 border-cyan-500 animate-spin"></div>
                                <div className="absolute inset-2 rounded-full border-r-2 border-purple-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                                <div className="absolute inset-4 rounded-full border-b-2 border-emerald-500 animate-spin" style={{ animationDuration: '2s' }}></div>
                            </div>
                            <p className="text-gray-400 font-mono text-sm animate-pulse">Loading Tensor Artifacts...</p>
                        </div>
                    ) : activeTab === 'config' ? (
                        config ? (
                            <div className="space-y-8 animate-fade-in">
                                {/* General Stats Cards - Glassmorphism */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[
                                        { label: 'Target Asset', value: config.symbol || 'N/A', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: 'cyan' },
                                        { label: 'Timeframe', value: config.timeframe || 'N/A', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', color: 'blue' },
                                        { label: 'Algorithm', value: config.config?.is_ensemble ? `Ensemble (${config.config?.ensemble_method || 'Voting'})` : (config.algorithm || 'N/A'), icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: 'purple' },
                                        { label: 'Epochs/Trees', value: config.config?.epochs || 'N/A', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', color: 'emerald' },
                                    ].map((stat, i) => (
                                        <div key={i} className={`group relative bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 hover:bg-white/[0.04] hover:border-${stat.color}-500/30 transition-all overflow-hidden`}>
                                            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${stat.color}-500/10 rounded-full blur-2xl group-hover:bg-${stat.color}-500/20 transition-all`}></div>
                                            <svg className={`w-5 h-5 text-${stat.color}-400 mb-3 opacity-70 group-hover:opacity-100 transition-opacity`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.icon} />
                                            </svg>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                                            <p className="text-lg font-mono font-bold text-white drop-shadow-md">{stat.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Features Sections */}
                                <div className="space-y-6">
                                    {/* OHLCV */}
                                    {config.config?.indicators && config.config.indicators.length > 0 && (
                                        <div className="bg-black/20 border border-cyan-500/10 rounded-2xl p-5 shadow-inner relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                                            <h3 className="text-sm font-bold text-cyan-400 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                                                Technical Indicators (OHLCV)
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {config.config.indicators.map((ind: string) => (
                                                    <div key={ind} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center gap-2 hover:bg-cyan-500/20 hover:border-cyan-400/50 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(6,182,212,0.8)]"></span>
                                                        <span className="text-xs font-mono font-bold text-cyan-100">{ind}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tick & Volume Features */}
                                    {config.config?.trade_features && config.config.trade_features.length > 0 && (
                                        <div className="bg-black/20 border border-amber-500/10 rounded-2xl p-5 shadow-inner relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                                            <h3 className="text-sm font-bold text-amber-400 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                                Tick &amp; Volume Flow
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {config.config.trade_features.map((feat: string) => {
                                                    const labelMap: Record<string, string> = {
                                                        cvd: 'Cumulative Volume Delta (CVD)',
                                                        buy_volume: 'Buy Volume Profile',
                                                        sell_volume: 'Sell Volume Profile',
                                                        trade_count: 'Trade Count (Tick Velocity)',
                                                        aggressor_ratio: 'Aggressor Ratio',
                                                        tick_speed: 'Tick Speed',
                                                        price_impact: 'Price Impact',
                                                        rolling_cvd_5: 'Rolling CVD (5)',
                                                        rolling_cvd_20: 'Rolling CVD (20)',
                                                    };
                                                    return (
                                                        <div key={feat} className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 hover:bg-amber-500/20 hover:border-amber-400/50 transition-colors shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.8)]"></span>
                                                            <span className="text-xs font-mono font-bold text-amber-100">{labelMap[feat] || feat}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Orderbook Features */}
                                    {config.config?.l2_features && config.config.l2_features.length > 0 && (
                                        <div className="bg-black/20 border border-emerald-500/10 rounded-2xl p-5 shadow-inner relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                            <h3 className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                                                Orderbook Imbalance (L2)
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {config.config.l2_features.map((feat: string) => (
                                                    <div key={feat} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 hover:bg-emerald-500/20 hover:border-emerald-400/50 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span>
                                                        <span className="text-xs font-mono font-bold text-emerald-100">{feat}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* PLP Features */}
                                    {config.config?.plp_features && config.config.plp_features.length > 0 && (
                                        <div className="bg-black/20 border border-purple-500/10 rounded-2xl p-5 shadow-inner relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                                            <h3 className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                Predatory Liquidity Pipeline (PLP)
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {config.config.plp_features.map((feat: string) => (
                                                    <div key={feat} className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-2 hover:bg-purple-500/20 hover:border-purple-400/50 transition-colors shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_rgba(168,85,247,0.8)]"></span>
                                                        <span className="text-xs font-mono font-bold text-purple-100">{feat}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(!config.config?.indicators?.length && !config.config?.l2_features?.length && !config.config?.trade_features?.length && !config.config?.plp_features?.length) && (
                                        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                                            <svg className="w-10 h-10 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                            <p className="text-sm font-bold text-gray-400">No Feature Data Available</p>
                                            <p className="text-xs text-gray-500 mt-1 max-w-sm">This model may have been trained without specific feature tracking or was manually uploaded.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">Configuration Missing</h3>
                                <p className="text-sm text-gray-400 max-w-md">The configuration details for this model could not be loaded. They might have been deleted or the file is corrupted.</p>
                            </div>
                        )
                    ) : (
                        <ExplainabilityView data={explainData} algorithm={config?.algorithm} />
                    )}
                </div>
            </div>
        </div>
    );
};

const ModelCard: React.FC<{
    model: CustomMLModel;
    onDelete: (id: string) => void;
    onUploadVersion: (model: CustomMLModel) => void;
    onSetActiveVersion: (modelId: string, versionId: string) => void;
    onRetrain: (modelId: string) => void;
    onViewDetails: (modelId: string, modelName: string) => void;
    onDownloadDataset: (modelId: string, modelName: string) => void;
    animationDelay: number;
}> = ({ model, onDelete, onUploadVersion, onSetActiveVersion, onRetrain, onViewDetails, onDownloadDataset, animationDelay }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [signalLoading, setSignalLoading] = useState(false);
    const [signalResult, setSignalResult] = useState<SignalResult | null>(null);

    const handleGetSignal = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setSignalLoading(true);
        try {
            const result = await mlModelsService.predictSignal(model.id);
            setSignalResult(result);
        } catch (err: any) {
            const msg = err?.response?.data?.detail || 'Prediction failed. Check if model file exists.';
            toast.error(msg);
        } finally {
            setSignalLoading(false);
        }
    };

    const modelIcons: Record<CustomMLModel['modelType'], React.ReactNode> = {
        'LSTM': <LstmIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />,
        'Random Forest': <RandomForestIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]" />,
        'XGBoost': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" />,
        'LightGBM': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" />,
        'CatBoost': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" />,
        'GRU': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />,
        '1D-CNN': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />,
        'DeepLOB': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />,
        'Transformer': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />,
        'PPO-RL': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]" />,
        'ARIMA': <ArimaIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]" />,
        'Other': <OtherModelIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(148,163,184,0.8)]" />,
        'Ensemble': <Layers className="w-8 h-8 text-rose-500 drop-shadow-[0_0_8px_rgba(243,24,113,0.8)]" />,
    };

    const activeVersion = model.versions.find(v => v.id === model.activeVersionId);

    const isPPO = model.modelType === 'PPO-RL';
    const isClassification = !!activeVersion?.explainability?.confusionMatrix;
    const isRegression = !isPPO && !isClassification && activeVersion?.explainability;

    let accLabel = "Accuracy";
    let f1Label = "F1 Score";
    
    if (isPPO) {
        accLabel = "Win Rate";
        f1Label = "Sharpe Ratio";
    } else if (isRegression) {
        accLabel = "R2 Score";
        f1Label = "MSE / RMSE";
    }

    // Real Metrics from API
    const rawAccuracy = activeVersion?.accuracy;
    let accuracyDisplay = '--';
    if (rawAccuracy !== undefined && rawAccuracy !== null) {
        if (isRegression) {
            accuracyDisplay = rawAccuracy.toFixed(3);
        } else {
            accuracyDisplay = `${(rawAccuracy * 100).toFixed(1)}%`;
        }
    }
    
    const rawF1 = activeVersion?.f1_score;
    let f1Display = '--';
    if (rawF1 !== undefined && rawF1 !== null) {
        if (isRegression && rawF1 < 0.001 && rawF1 > 0) {
            f1Display = rawF1.toExponential(2);
        } else {
            f1Display = rawF1.toFixed(4);
        }
    }

    const rawLatency = activeVersion?.latency;
    const latencyDisplay = rawLatency !== undefined && rawLatency !== null ? `${Math.round(rawLatency)}ms` : '--';

    return (
        <div
            className="group relative rounded-3xl overflow-hidden transition-all duration-500 animate-fade-in-slide-up"
            style={{ 
                animationDelay: `${animationDelay}ms`,
                background: 'linear-gradient(145deg, rgba(15,20,30,0.6) 0%, rgba(5,10,15,0.8) 100%)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px -10px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(16px)'
            }}
        >
            {/* Top Glow & Hover Effects */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50 group-hover:opacity-100 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.8)] transition-all duration-500 z-10"></div>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.1)_0%,transparent_50%)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

            <div className="p-6 relative z-10">
                {/* Signal Modal */}
                {signalResult && ReactDOM.createPortal(
                    <SignalModal
                        result={signalResult}
                        modelName={model.name}
                        onClose={() => setSignalResult(null)}
                    />,
                    document.body
                )}

                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-purple-600/10 border border-white/5 flex items-center justify-center text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] group-hover:border-cyan-500/30 group-hover:shadow-[inset_0_0_20px_rgba(6,182,212,0.1)] transition-all duration-500">
                            {modelIcons[model.modelType]}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors tracking-tight">{model.name}</h3>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className="px-2.5 py-1 bg-white/5 rounded-md text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/5 shadow-sm">{model.modelType}</span>
                                <span className="px-2.5 py-1 bg-cyan-500/10 rounded-md text-[10px] font-mono font-bold text-cyan-400 border border-cyan-500/20 shadow-sm">v{activeVersion?.version.toFixed(1)}</span>
                                <StatusPill status={activeVersion?.status || 'Error'} />
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(model.id); }} 
                        className="w-10 h-10 rounded-full bg-white/5 hover:bg-rose-500/20 flex items-center justify-center text-gray-500 hover:text-rose-400 transition-all border border-transparent hover:border-rose-500/30 group/btn"
                        title="Delete Model"
                    >
                        <svg className="w-5 h-5 group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group/metric">
                        <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover/metric:opacity-100 transition-opacity"></div>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 z-10">{accLabel}</span>
                        <span className="text-base font-mono font-bold text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.4)] z-10">{accuracyDisplay}</span>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group/metric">
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover/metric:opacity-100 transition-opacity"></div>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 z-10">{f1Label}</span>
                        <span className="text-base font-mono font-bold text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.4)] z-10">{f1Display}</span>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group/metric">
                        <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover/metric:opacity-100 transition-opacity"></div>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 z-10">Latency</span>
                        <span className="text-base font-mono font-bold text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.4)] z-10">{latencyDisplay}</span>
                    </div>
                </div>

                {/* Actions Row */}
                <div className="flex justify-center mt-3">
                    <div className="flex flex-wrap gap-2 justify-center w-full">
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewDetails(model.id, model.name); }}
                            className="relative px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:border-indigo-400/60 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:shadow-[0_0_25px_rgba(99,102,241,0.35)] flex items-center gap-1.5 group/details overflow-hidden backdrop-blur-md"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/0 via-indigo-400/10 to-indigo-400/0 translate-x-[-100%] group-hover/details:translate-x-[100%] transition-transform duration-1000"></div>
                            <svg className="w-3 h-3 group-hover/details:scale-110 transition-transform drop-shadow-[0_0_5px_rgba(99,102,241,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="drop-shadow-sm">Details</span>
                        </button>
                        
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`relative px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:border-purple-400/60 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_25px_rgba(168,85,247,0.35)] flex items-center gap-1.5 group/history overflow-hidden backdrop-blur-md ${isExpanded ? 'border-purple-500/50 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.3)] bg-purple-500/20' : ''}`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/10 to-purple-400/0 translate-x-[-100%] group-hover/history:translate-x-[100%] transition-transform duration-1000"></div>
                            <svg className={`w-3 h-3 transition-transform duration-300 drop-shadow-[0_0_5px_rgba(168,85,247,0.8)] ${isExpanded ? 'rotate-180 scale-110' : 'group-hover/history:scale-110'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            <span className="drop-shadow-sm">{isExpanded ? 'Hide History' : 'History'}</span>
                        </button>
                        
                        <button
                            onClick={handleGetSignal}
                            disabled={signalLoading || activeVersion?.status !== 'Ready'}
                            className="relative px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:border-amber-400/60 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_25px_rgba(245,158,11,0.35)] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed group/signal overflow-hidden backdrop-blur-md"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-400/0 via-amber-400/10 to-amber-400/0 translate-x-[-100%] group-hover/signal:translate-x-[100%] transition-transform duration-1000"></div>
                            {signalLoading ? (
                                <svg className="animate-spin w-3 h-3 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            ) : (
                                <svg className="w-3 h-3 group-hover/signal:scale-110 transition-transform drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                            )}
                            <span className="drop-shadow-sm">{signalLoading ? 'Loading...' : 'Get Signal'}</span>
                        </button>
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); onRetrain(model.id); }}
                            className="relative px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:border-cyan-400/60 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_25px_rgba(6,182,212,0.35)] flex items-center gap-1.5 group/retrain overflow-hidden backdrop-blur-md"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 translate-x-[-100%] group-hover/retrain:translate-x-[100%] transition-transform duration-1000"></div>
                            <svg className="w-3 h-3 opacity-80 group-hover/retrain:rotate-180 transition-transform duration-500 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            <span className="drop-shadow-sm">Retrain</span>
                        </button>
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); onDownloadDataset(model.id, model.name); }}
                            className="relative px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400/60 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center gap-1.5 group/dataset overflow-hidden backdrop-blur-md"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/10 to-emerald-400/0 translate-x-[-100%] group-hover/dataset:translate-x-[100%] transition-transform duration-1000"></div>
                            <svg className="w-3 h-3 opacity-80 group-hover/dataset:scale-110 transition-transform duration-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span className="drop-shadow-sm">Dataset</span>
                        </button>
                    </div>
                </div>

            </div>

            {/* Expandable History Panel */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden relative ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {/* Divider Line */}
                <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                
                <div className="p-6 pt-4 space-y-3 bg-black/40 overflow-y-auto max-h-80 custom-scrollbar inset-shadow-sm">
                    {model.versions.map(version => (
                        <div key={version.id} className="group/row relative flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-cyan-500/30 transition-all overflow-hidden">
                            <div className="flex items-center gap-4 relative z-10">
                                <div className={`w-2 h-10 rounded-full ${version.id === model.activeVersionId ? 'bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-gray-700'}`}></div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className={`font-mono font-bold text-sm ${version.id === model.activeVersionId ? 'text-white' : 'text-gray-400'}`}>v{version.version.toFixed(1)}</span>
                                        {version.id === model.activeVersionId && (
                                            <span className="text-[9px] font-black tracking-widest bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-md border border-cyan-500/30">ACTIVE</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate w-48 font-medium">{version.description}</p>
                                </div>
                            </div>

                            <div className="relative z-10">
                                {version.status === 'Ready' && version.id !== model.activeVersionId ? (
                                    <button 
                                        onClick={() => onSetActiveVersion(model.id, version.id)}
                                        className="px-4 py-1.5 bg-white/5 hover:bg-cyan-500/20 text-gray-400 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/50 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                    >
                                        Activate
                                    </button>
                                ) : (
                                    <span className="text-[10px] text-gray-500 font-mono">{new Date(version.uploadDate).toLocaleString()}</span>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    <button
                        onClick={() => onUploadVersion(model)}
                        className="w-full py-4 mt-2 border border-dashed border-white/10 rounded-2xl text-xs font-bold text-gray-400 hover:text-cyan-300 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all flex items-center justify-center gap-2 group/upload"
                    >
                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center group-hover/upload:bg-cyan-500/20 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </div>
                        Upload New Version
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Active Training Jobs Section ---
const ActiveTrainingJobsSection: React.FC<{ jobs: any[], onCancel: (id: string) => void }> = ({ jobs, onCancel }) => {
    if (!jobs || jobs.length === 0) return null;

    return (
        <div className="bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-lg border border-cyan-500/30 p-6 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.1)] mb-8">
            <h3 className="text-lg font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Active Celery Training Jobs ({jobs.length})
            </h3>
            <div className="space-y-4">
                {jobs.map(job => {
                    const pct = Math.min(100, Math.max(0, job.progress || 0));
                    return (
                        <div key={job.id} className="relative bg-black/40 border border-white/10 rounded-xl p-4 overflow-hidden group">
                            {/* Animated Background Progress */}
                            <div className="absolute inset-0 bg-cyan-500/10 transition-all duration-500 ease-out" style={{ width: `${pct}%` }}></div>
                            
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-sm font-bold text-white">{job.symbol}</span>
                                        <span className="text-[10px] font-black text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30 uppercase">
                                            {job.algorithm}
                                        </span>
                                        <span className="text-[10px] font-mono text-gray-500">{job.id}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-cyan-400 rounded-full relative" style={{ width: `${pct}%` }}>
                                                <div className="absolute top-0 right-0 bottom-0 left-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full animate-shimmer"></div>
                                            </div>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-cyan-400 w-10 text-right">{pct.toFixed(0)}%</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2 font-mono truncate max-w-xl">
                                        {job.logs && job.logs.length > 0 ? job.logs[job.logs.length - 1] : 'Initializing...'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => onCancel(job.id)}
                                    className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-red-500/20 hover:text-red-300 transition-colors flex-shrink-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    );
                })}
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

    // --- Active Jobs Hook ---
    const { data: activeJobs = [] } = useQuery({
        queryKey: ['activeTrainingJobs'],
        queryFn: mlTrainingService.getJobs,
        refetchInterval: (query) => {
            const jobs = query.state.data || [];
            const hasActive = jobs.some((j: any) => j.status === 'PENDING' || j.status === 'RUNNING');
            return hasActive ? 2000 : 10000; // Poll fast if active, slower otherwise
        },
        select: (jobs) => jobs.filter((j: any) => j.status === 'PENDING' || j.status === 'RUNNING')
    });

    const cancelJobMutation = useMutation({
        mutationFn: mlTrainingService.cancelTraining,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activeTrainingJobs'] });
            toast.success('Training job cancelled');
        },
        onError: () => toast.error('Failed to cancel job'),
    });

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

    const handleDownloadDataset = async (modelId: string, modelName: string) => {
        try {
            await mlModelsService.downloadDataset(modelId, modelName);
            toast.success('Dataset download started');
        } catch (error: any) {
            toast.error(error?.response?.data?.detail || 'Failed to download dataset. It may not exist for this version.');
        }
    };

    return (
        <div className="relative min-h-[calc(100vh-140px)]">
            <NeuralMeshBackground />

            {modalState.isOpen && <UploadModelModal onClose={() => setModalState({ isOpen: false })} onUpload={handleUpload} existingModel={modalState.modelToUpdate} />}
            {detailsModalState.isOpen && <ModelDetailsModal modelId={detailsModalState.modelId} modelName={detailsModalState.modelName} onClose={() => setDetailsModalState({ ...detailsModalState, isOpen: false })} />}

            <div className="relative z-10 flex flex-col gap-8 laptop:gap-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/80 dark:bg-[#0A0A0A]/60 backdrop-blur-lg border border-gray-200 dark:border-gray-800 p-6 laptop:p-4 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-brand-primary to-purple-600 rounded-xl shadow-lg shadow-brand-primary/20 text-white">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-3xl laptop:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Quant Model Registry</h2>
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
                
                {/* Render the Active Jobs Tracker Component */}
                <ActiveTrainingJobsSection jobs={activeJobs} onCancel={(id) => cancelJobMutation.mutate(id)} />

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 laptop:gap-4">
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
                                    onDownloadDataset={handleDownloadDataset}
                                    animationDelay={index * 100}
                                />
                            ))}

                            {/* Add New Placeholder */}
                            <button
                                onClick={() => setModalState({ isOpen: true })}
                                className="group relative border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center p-10 laptop:p-5 text-center hover:border-brand-primary hover:bg-brand-primary/5 transition-all duration-300 min-h-[300px] laptop:min-h-[200px]"
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

