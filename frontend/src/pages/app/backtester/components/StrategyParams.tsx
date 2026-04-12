import React, { useRef, useCallback, useEffect } from 'react';

// --- Types ---
type OptimizationParamValue = { start: number | string; end: number | string; step: number | string; };
type OptimizationParams = Record<string, OptimizationParamValue>;

// --- Helper Components ---
const RangeSliderInput: React.FC<{
    config: { label: string; min?: number; max?: number; step?: number };
    value: OptimizationParamValue;
    onChange: (newValue: OptimizationParamValue) => void;
    hideStepInput?: boolean;
}> = ({ config, value, onChange, hideStepInput = false }) => {
    const { min = 0, max = 100, step = 1 } = config;
    const { start, end, step: stepValue } = value;
    const startNum = Number(start);
    const endNum = Number(end);
    const rangeRef = useRef<HTMLDivElement>(null);
    const getPercent = useCallback((val: number) => Math.round(((val - min) / (max - min)) * 100), [min, max]);

    useEffect(() => {
        const startPercent = getPercent(startNum);
        const endPercent = getPercent(endNum);
        if (rangeRef.current) {
            rangeRef.current.style.left = `${startPercent}%`;
            rangeRef.current.style.width = `${endPercent - startPercent}%`;
        }
    }, [startNum, endNum, getPercent]);

    const handleValueChange = (field: 'start' | 'end' | 'step', val: string | number) => {
        const numVal = Number(val);
        const newValues = { ...value, [field]: numVal };
        let s = Number(newValues.start);
        let e = Number(newValues.end);
        if (field === 'start') s = Math.min(s, e);
        else if (field === 'end') e = Math.max(e, s);
        onChange({ ...newValues, start: s, end: e });
    };

    const handleRangeChange = (field: 'start' | 'end', e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        if (field === 'start') {
            const newStart = Math.min(val, endNum - Number(stepValue));
            if (newStart !== startNum) onChange({ ...value, start: newStart });
        } else {
            const newEnd = Math.max(val, startNum + Number(stepValue));
            if (newEnd !== endNum) onChange({ ...value, end: newEnd });
        }
    };

    const inputClasses = "w-24 bg-white dark:bg-brand-dark/50 border border-brand-border-light dark:border-brand-border-dark rounded-md p-1.5 text-slate-900 dark:text-white text-sm focus:ring-brand-primary focus:border-brand-primary";

    return (
        <div className="space-y-3">
            <div className="range-slider-container">
                <input type="range" min={min} max={max} step={step} value={startNum} onChange={(e) => handleRangeChange('start', e)} className="thumb thumb--left" aria-label="Start value" />
                <input type="range" min={min} max={max} step={step} value={endNum} onChange={(e) => handleRangeChange('end', e)} className="thumb thumb--right" aria-label="End value" />
                <div className="range-slider-track"></div>
                <div ref={rangeRef} className="range-slider-range"></div>
            </div>
            <div className={`flex items-center gap-2 ${hideStepInput ? 'justify-between' : 'justify-evenly'}`}>
                <div>
                    <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Start</label>
                    <input type="number" min={min} max={max} step={step} value={start} onChange={(e) => handleValueChange('start', e.target.value)} className={inputClasses} />
                </div>
                {!hideStepInput && (
                    <div>
                        <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1 text-center">Step</label>
                        <input type="number" min={step} step={step} value={stepValue} onChange={(e) => handleValueChange('step', e.target.value)} className={inputClasses} />
                    </div>
                )}
                <div className="text-right">
                    <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">End</label>
                    <input type="number" min={min} max={max} step={step} value={end} onChange={(e) => handleValueChange('end', e.target.value)} className={inputClasses} />
                </div>
            </div>
        </div>
    );
};

// --- StrategyParams Component ---
interface StrategyParamsProps {
    mode: 'single' | 'optimization';
    activeParamsConfig: Record<string, any>;
    params: Record<string, any>;
    setParams: React.Dispatch<React.SetStateAction<Record<string, any>>>;
    optimizationParams: OptimizationParams;
    setOptimizationParams: React.Dispatch<React.SetStateAction<OptimizationParams>>;
    optimizationMethod: 'gridSearch' | 'geneticAlgorithm';
    setOptimizationMethod: (m: 'gridSearch' | 'geneticAlgorithm') => void;
    hideOptimizationMethod?: boolean;
    gaParams: { populationSize: number; generations: number };
    setGaParams: React.Dispatch<React.SetStateAction<{ populationSize: number; generations: number }>>;
}

export const StrategyParams: React.FC<StrategyParamsProps> = ({
    mode,
    activeParamsConfig,
    params,
    setParams,
    optimizationParams,
    setOptimizationParams,
    optimizationMethod,
    setOptimizationMethod,
    hideOptimizationMethod = false,
    gaParams,
    setGaParams
}) => {
    const inputBaseClasses = "w-full bg-white dark:bg-brand-dark/50 border border-brand-border-light dark:border-brand-border-dark rounded-md p-2 text-slate-900 dark:text-white focus:ring-brand-primary focus:border-brand-primary";

    const handleParamChange = (key: string, value: string) => {
        const numValue = Number(value);
        setParams(prev => ({ ...prev, [key]: isNaN(numValue) ? value : numValue }));
    };

    const handleOptimizationParamChange = (key: string, newValue: OptimizationParamValue) => {
        setOptimizationParams(prev => ({ ...prev, [key]: newValue }));
    };

    if (!activeParamsConfig || Object.keys(activeParamsConfig).length === 0) return null;

    if (mode === 'single') {
        return (
            <div className="mt-6 pt-6 border-t border-brand-border-light dark:border-brand-border-dark animate-fade-in-down">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Strategy Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {Object.entries(activeParamsConfig).map(([key, config]: [string, any]) => (
                        <div key={key}>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{config.label}</label>
                            <input type={config.type} value={params[key] || ''} onChange={(e) => handleParamChange(key, e.target.value)} className={inputBaseClasses} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (mode === 'optimization') {
        return (
            <div className="mt-6 pt-6 border-t border-brand-border-light dark:border-brand-border-dark animate-fade-in-down">
                {!hideOptimizationMethod && (
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Optimization Method</h3>
                        <div className="inline-flex bg-gray-100 dark:bg-brand-dark/50 rounded-lg p-1 space-x-1">
                            <button onClick={() => setOptimizationMethod('gridSearch')} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${optimizationMethod === 'gridSearch' ? 'bg-white dark:bg-brand-dark shadow text-brand-primary' : 'text-gray-500'}`}>Grid Search</button>
                            <button onClick={() => setOptimizationMethod('geneticAlgorithm')} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${optimizationMethod === 'geneticAlgorithm' ? 'bg-white dark:bg-brand-dark shadow text-brand-primary' : 'text-gray-500'}`}>Genetic Algorithm</button>
                        </div>
                    </div>
                )}
                {optimizationMethod === 'gridSearch' ? (
                    Object.entries(activeParamsConfig).map(([key, config]: [string, any]) => (
                        <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start mb-4">
                            <label className="md:col-span-1 block text-sm text-gray-500 pt-1.5">{config.label}</label>
                            <div className="md:col-span-3">{optimizationParams[key] && <RangeSliderInput config={config} value={optimizationParams[key]} onChange={(v) => handleOptimizationParamChange(key, v)} />}</div>
                        </div>
                    ))
                ) : (
                    <div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div><label className="block text-sm text-gray-500 mb-1">Pop. Size</label><input type="number" value={gaParams.populationSize} onChange={(e) => setGaParams(p => ({ ...p, populationSize: parseInt(e.target.value) }))} className={inputBaseClasses} /></div>
                            <div><label className="block text-sm text-gray-500 mb-1">Generations</label><input type="number" value={gaParams.generations} onChange={(e) => setGaParams(p => ({ ...p, generations: parseInt(e.target.value) }))} className={inputBaseClasses} /></div>
                        </div>
                        {Object.entries(activeParamsConfig).map(([key, config]: [string, any]) => (
                            <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start mb-4"><label className="md:col-span-1 block text-sm text-gray-500 pt-1.5">{config.label}</label><div className="md:col-span-3">{optimizationParams[key] && <RangeSliderInput config={config} value={optimizationParams[key]} onChange={(v) => handleOptimizationParamChange(key, v)} hideStepInput={true} />}</div></div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return null;
};
