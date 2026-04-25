import { useState, useEffect } from 'react';

export interface AdvancedMetricsSettings {
    showDeltaProfile: boolean;
    showFootprintImbalance: boolean;
    showTradeBubbles: boolean;
    showSpoofingDetection: boolean;
    showAnchoredVWAP: boolean;
    showOIBOscillator: boolean;
    showTPOProfile: boolean;
    showDeltaDivergence: boolean;
}

const defaultSettings: AdvancedMetricsSettings = {
    showDeltaProfile: false,
    showFootprintImbalance: false,
    showTradeBubbles: false,
    showSpoofingDetection: false,
    showAnchoredVWAP: false,
    showOIBOscillator: false,
    showTPOProfile: false,
    showDeltaDivergence: false,
};

export const useAdvancedMetricsSettings = () => {
    const [settings, setSettings] = useState<AdvancedMetricsSettings>(() => {
        const saved = localStorage.getItem('advancedMetricsSettings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                return defaultSettings;
            }
        }
        return defaultSettings;
    });

    useEffect(() => {
        localStorage.setItem('advancedMetricsSettings', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<AdvancedMetricsSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    return { settings, updateSettings };
};
