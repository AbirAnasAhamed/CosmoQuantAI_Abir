import React from 'react';
import { Network } from 'lucide-react';

export interface ClusterImportanceToggleProps {
    useClusteredImportance: boolean;
    setUseClusteredImportance: (val: boolean) => void;
}

const ClusterImportanceToggle: React.FC<ClusterImportanceToggleProps> = ({
    useClusteredImportance,
    setUseClusteredImportance
}) => {
    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 mb-4 transition-all duration-300 hover:border-slate-600/50">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">Clustered Feature Importance</h4>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={useClusteredImportance} 
                        onChange={(e) => setUseClusteredImportance(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
            </div>
            
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                Uses Mean Decrease Accuracy (MDA) on <strong>clusters</strong> of correlated features rather than individual ones. 
                This prevents the importance of highly correlated features from being artificially diluted.
            </p>
        </div>
    );
};

export default ClusterImportanceToggle;
