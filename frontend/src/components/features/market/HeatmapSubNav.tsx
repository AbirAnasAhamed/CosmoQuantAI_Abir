import React from 'react';
import { Activity, Settings, AlignLeft } from 'lucide-react';
import { VolumeFilterControl } from './VolumeFilterControl';

interface HeatmapSubNavProps {
    activeTab: 'heatmap' | 'bot_settings' | 'bot_logs';
    onChange: (tab: 'heatmap' | 'bot_settings' | 'bot_logs') => void;
    volumeThreshold: number;
    setVolumeThreshold: (value: number) => void;
    volumeMode: 'base' | 'quote';
    setVolumeMode: (mode: 'base' | 'quote') => void;
}

export const HeatmapSubNav: React.FC<HeatmapSubNavProps> = ({ 
    activeTab, 
    onChange,
    volumeThreshold,
    setVolumeThreshold,
    volumeMode,
    setVolumeMode
}) => {
    return (
        <div className="flex bg-white dark:bg-[#0B1120] border-b border-gray-200 dark:border-white/10 px-4 py-2 items-center gap-4">
            <div className="flex space-x-1 bg-gray-100 dark:bg-black/30 p-1 rounded-lg">
                <button
                    onClick={() => onChange('heatmap')}
                    className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'heatmap'
                        ? 'bg-blue-600/10 text-brand-primary border border-blue-500/20 shadow-sm'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-black/10'
                        }`}
                >
                    <Activity size={16} />
                    <span>Heatmap View</span>
                </button>
            </div>

            <div className="flex items-center">
                <VolumeFilterControl 
                    threshold={volumeThreshold} 
                    onThresholdChange={setVolumeThreshold} 
                    mode={volumeMode} 
                    onModeChange={setVolumeMode} 
                />
            </div>
        </div>
    );
};
