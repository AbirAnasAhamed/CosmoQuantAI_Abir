import React, { useState, useRef, useEffect } from 'react';
import { AdvancedMetricsSettings } from '../../../hooks/useAdvancedMetricsSettings';

interface AdvancedMetricsDropdownProps {
    settings: AdvancedMetricsSettings;
    onSettingsChange: (settings: Partial<AdvancedMetricsSettings>) => void;
}

export const AdvancedMetricsDropdown: React.FC<AdvancedMetricsDropdownProps> = ({ settings, onSettingsChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleFeature = (key: keyof AdvancedMetricsSettings) => {
        onSettingsChange({ [key]: !settings[key] });
    };

    const features: { key: keyof AdvancedMetricsSettings; label: string; icon: string }[] = [
        { key: 'showDeltaProfile', label: 'Delta Profile (Bid/Ask)', icon: '📊' },
        { key: 'showFootprintImbalance', label: 'Footprint Imbalance', icon: '👣' },
        { key: 'showTradeBubbles', label: 'Trade Bubbles (Blocks)', icon: '🫧' },
        { key: 'showSpoofingDetection', label: 'Spoofing Detection', icon: '🚨' },
        { key: 'showAnchoredVWAP', label: 'Anchored VWAP', icon: '⚓' },
        { key: 'showOIBOscillator', label: 'OIB Oscillator', icon: '🌊' },
        { key: 'showTPOProfile', label: 'TPO Market Profile', icon: '⏳' },
        { key: 'showDeltaDivergence', label: 'Delta Divergence', icon: '⚠️' }
    ];

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${isOpen
                    ? 'bg-purple-500/10 border-purple-500 text-purple-500 dark:text-purple-400'
                    : 'bg-white dark:bg-black/20 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Advance Metrix
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 dark:border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent">
                        <h3 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-2">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Institutional Order Flow
                        </h3>
                    </div>
                    <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        {features.map(({ key, label, icon }) => (
                            <div key={key} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                                <label className="flex items-center cursor-pointer flex-1">
                                    <input
                                        type="checkbox"
                                        checked={settings[key]}
                                        onChange={() => toggleFeature(key)}
                                        className="w-4 h-4 text-purple-500 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-500 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-purple-500 transition-colors flex items-center gap-2">
                                        <span>{icon}</span> {label}
                                    </span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
