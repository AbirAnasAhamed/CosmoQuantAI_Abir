import React, { useMemo, useEffect } from 'react';
import { Activity, BarChart2 } from 'lucide-react';

export interface EvaluationMetricSelectorProps {
  predictionTarget: string;
  evalMetric: string;
  setEvalMetric: (val: string) => void;
}

const EvaluationMetricSelector: React.FC<EvaluationMetricSelectorProps> = ({
  predictionTarget,
  evalMetric,
  setEvalMetric
}) => {
  
  const options = useMemo(() => {
    if (predictionTarget === 'classification') {
      return [
        { value: 'f1_macro', label: 'F1-Score (Macro) - Best for Imbalance' },
        { value: 'accuracy', label: 'Accuracy' },
        { value: 'roc_auc', label: 'ROC-AUC' },
        { value: 'precision', label: 'Precision' },
        { value: 'recall', label: 'Recall' }
      ];
    } else {
      return [
        { value: 'rmse', label: 'RMSE (Root Mean Square Error)' },
        { value: 'mae', label: 'MAE (Mean Absolute Error)' },
        { value: 'r2', label: 'R-Squared' },
        { value: 'sharpe_loss', label: 'Sharpe Loss (Finance Specific)' },
        { value: 'mape', label: 'MAPE (Mean Absolute Percentage Error)' }
      ];
    }
  }, [predictionTarget]);

  useEffect(() => {
    const validValues = options.map(o => o.value);
    if (!validValues.includes(evalMetric)) {
      setEvalMetric(validValues[0]);
    }
  }, [predictionTarget, evalMetric, options, setEvalMetric]);

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-emerald-400" />
        <h3 className="text-lg font-semibold text-white">Evaluation Metric</h3>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Optimization Target Function</label>
        <div className="relative">
          <select
            value={evalMetric}
            onChange={(e) => setEvalMetric(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <BarChart2 className="w-5 h-5 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Model will adjust weights to optimize for this specific metric during training.
        </p>
      </div>
    </div>
  );
};

export default EvaluationMetricSelector;
