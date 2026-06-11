import React, { useState, useEffect } from 'react';
import { Layers } from 'lucide-react';

export interface DatasetSplitConfigProps {
  splitMethod: string;
  setSplitMethod: (val: string) => void;
  trainRatio: number;
  setTrainRatio: (val: number) => void;
  valRatio: number;
  setValRatio: (val: number) => void;
  testRatio: number;
  setTestRatio: (val: number) => void;
  imbalanceStrategy: string;
  setImbalanceStrategy: (val: string) => void;
}

const DatasetSplitConfig: React.FC<DatasetSplitConfigProps> = ({
  splitMethod,
  setSplitMethod,
  trainRatio,
  setTrainRatio,
  valRatio,
  setValRatio,
  testRatio,
  setTestRatio,
  imbalanceStrategy,
  setImbalanceStrategy
}) => {
  useEffect(() => {
    // Ensure ratios sum to 100
    if (trainRatio + valRatio + testRatio !== 100) {
      setTestRatio(Math.max(0, 100 - trainRatio - valRatio));
    }
  }, [trainRatio, valRatio, testRatio, setTestRatio]);

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-semibold text-white">Dataset Split & Imbalance</h3>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Split Method</label>
            <select
              value={splitMethod}
              onChange={(e) => setSplitMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="chronological">Chronological (Time-Series)</option>
              <option value="walk_forward">Walk-Forward Validation</option>
              <option value="random">Random Split (Not Rec. for TS)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Class Imbalance Strategy</label>
            <select
              value={imbalanceStrategy}
              onChange={(e) => setImbalanceStrategy(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="none">None</option>
              <option value="smote">SMOTE (Synthetic Minority)</option>
              <option value="class_weights">Compute Class Weights</option>
              <option value="undersampling">Random Undersampling</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Train Ratio</span>
              <span className="text-cyan-400 font-medium">{trainRatio}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="90"
              value={trainRatio}
              onChange={(e) => setTrainRatio(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Validation Ratio</span>
              <span className="text-purple-400 font-medium">{valRatio}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={valRatio}
              onChange={(e) => setValRatio(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Test Ratio</span>
              <span className="text-emerald-400 font-medium">{Math.max(0, 100 - trainRatio - valRatio)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden flex">
              <div style={{ width: `${trainRatio}%` }} className="bg-cyan-500 h-full transition-all duration-300"></div>
              <div style={{ width: `${valRatio}%` }} className="bg-purple-500 h-full transition-all duration-300"></div>
              <div style={{ width: `${Math.max(0, 100 - trainRatio - valRatio)}%` }} className="bg-emerald-500 h-full transition-all duration-300"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatasetSplitConfig;
