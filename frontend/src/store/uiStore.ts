import { create } from 'zustand';

interface UIState {
    orderFlowActiveTab: 'heatmap' | 'bot_settings' | 'bot_logs';
    setOrderFlowActiveTab: (tab: 'heatmap' | 'bot_settings' | 'bot_logs') => void;
    orderFlowShowFootprint: boolean;
    setOrderFlowShowFootprint: (show: boolean) => void;
    liquidationChartWidth: number;
    setLiquidationChartWidth: (width: number) => void;
    liquidationRightPanelTab: 'feed' | 'cld';
    setLiquidationRightPanelTab: (tab: 'feed' | 'cld') => void;
    liquidationHighlightedLevels: number[];
    setLiquidationHighlightedLevels: (levels: number[]) => void;
    liquidationMinThreshold: number;
    setLiquidationMinThreshold: (threshold: number) => void;
    liquidationChartView: 'price' | 'bubbles';
    setLiquidationChartView: (view: 'price' | 'bubbles') => void;
}

export const useUIStore = create<UIState>((set) => ({
    orderFlowActiveTab: 'heatmap',
    setOrderFlowActiveTab: (tab) => set({ orderFlowActiveTab: tab }),
    orderFlowShowFootprint: false,
    setOrderFlowShowFootprint: (show) => set({ orderFlowShowFootprint: show }),
    liquidationChartWidth: 70,
    setLiquidationChartWidth: (width) => set({ liquidationChartWidth: width }),
    liquidationRightPanelTab: 'feed',
    setLiquidationRightPanelTab: (tab) => set({ liquidationRightPanelTab: tab }),
    liquidationHighlightedLevels: [],
    setLiquidationHighlightedLevels: (levels) => set({ liquidationHighlightedLevels: levels }),
    liquidationMinThreshold: 10000,
    setLiquidationMinThreshold: (threshold) => set({ liquidationMinThreshold: threshold }),
    liquidationChartView: 'price',
    setLiquidationChartView: (view) => set({ liquidationChartView: view }),
}));
