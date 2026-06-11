import React from 'react';
import { Target, History, FastForward } from 'lucide-react';

export interface ForecastConfiguratorProps {
  forecastHorizon: number;
  setForecastHorizon: (val: number) => void;
  lookbackWindow: number;
  setLookbackWindow: (val: number) => void;
}

const ForecastConfigurator: React.FC<ForecastConfiguratorProps> = ({
  forecastHorizon,
  setForecastHorizon,
  lookbackWindow,
  setLookbackWindow
}) => {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Forecast & Lookback Window</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <History className="w-4 h-4 text-purple-400" /> Lookback Window (Sequence Length)
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="500"
              value={lookbackWindow}
              onChange={(e) => setLookbackWindow(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-20 py-2.5 text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
            <span className="absolute right-3 top-2.5 text-slate-500 text-sm pointer-events-none">Candles</span>
          </div>
          <p className="text-xs text-slate-500">"Memory sequence of past {lookbackWindow} candles"</p>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <FastForward className="w-4 h-4 text-cyan-400" /> Forecast Horizon (Look-ahead)
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="100"
              value={forecastHorizon}
              onChange={(e) => setForecastHorizon(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-20 py-2.5 text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <span className="absolute right-3 top-2.5 text-slate-500 text-sm pointer-events-none">Candles</span>
          </div>
          <p className="text-xs text-slate-500">"Predicting the state of next {forecastHorizon} candles"</p>
        </div>
      </div>
    </div>
  );
};

export default ForecastConfigurator;
