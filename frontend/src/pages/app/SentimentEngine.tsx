import React from 'react';
import { useSentimentEngine } from '@/hooks/useSentimentEngine';

// Components
import { SentimentHeader } from '@/components/features/sentiment/SentimentHeader';
import { SentimentScoreCards } from '@/components/features/sentiment/SentimentScoreCards';
import { SentimentPriceChart, SentimentDivergenceChart } from '@/components/features/sentiment/SentimentCharts';
import { SentimentNewsFeed } from '@/components/features/sentiment/SentimentNewsFeed';
import { WhaleActivityWidget } from '@/components/features/sentiment/WhaleActivityWidget';
import { CommunityVoting } from '@/components/features/sentiment/CommunityVoting';
import { SentimentHeatmap } from '@/components/features/sentiment/SentimentHeatmap';
import { SentimentNarratives } from '@/components/features/sentiment/SentimentNarratives';
import { SentimentSignalAnalysis } from '@/components/features/sentiment/SentimentSignalAnalysis';
import OnChainLiquidityWidget from '@/components/features/sentiment/OnChainLiquidityWidget';
import ExchangeFlowWidget from '@/components/features/sentiment/ExchangeFlowWidget';
import FearGreedWidget from '@/components/features/sentiment/FearGreedWidget';
import { HighImpactWidget } from '@/components/features/sentiment/HighImpactWidget';
import { DarkPoolWidget } from '@/components/features/sentiment/DarkPoolWidget';
import SmartExecutionWidget from '@/components/features/trading/SmartExecutionWidget';
import { ArbitrageScannerWidget } from '@/components/features/sentiment/ArbitrageScannerWidget';
import { SentimentCommandCenter } from '@/components/features/sentiment/SentimentCommandCenter';
import { MacroEconomicWidget } from '@/components/features/sentiment/MacroEconomicWidget';

// Skeletons
import { SentimentHeaderSkeleton } from '@/components/features/sentiment/skeletons/SentimentHeaderSkeleton';
import { MetricsSkeleton } from '@/components/features/sentiment/skeletons/MetricsSkeleton';
import { ChartSkeleton } from '@/components/features/sentiment/skeletons/ChartSkeleton';
import { HeatmapSkeleton } from '@/components/features/sentiment/skeletons/HeatmapSkeleton';

const SentimentEngine: React.FC = () => {
    const {
        activePair,
        setActivePair,
        activeExchange,
        setActiveExchange,
        syncData,
        isHeatmapLoading,
        isNerEnabled,
        setIsNerEnabled,
        nerData,
        isNerLoading,
        currentMetrics,
        fearGreedIndex,
        fearGreedLabel,
        chartData,
        timeframe,
        setTimeframe,
        correlation,
        heatmapData,
        pollStats,
        handleVote,
        influencers,
        sentimentSources,
        filteredSources,
        activeFilter,
        setActiveFilter,
        narratives,
        wordCloud,
        isNarrativeLoading,
        hasNarrativesLoaded,
        handleGenerateNarratives,
        sourceBreakdownData,
        aiSummary,
        isSummaryLoading,
        selectedProvider,
        setSelectedProvider,

        handleGenerateSummary,
        aiModel,
        setAiModel,
        selectedTopic,
        activeSourceFilter,
        setActiveSourceFilter,
        availableSources,
        handleTopicClick,

        // New Report Props
        marketReport,
        isReportLoading,
        generateMarketReport
    } = useSentimentEngine();

    return (
        <div className="space-y-8 animate-fade-in-slide-up p-6">
            {/* 1. Header & Toggles */}
            <SentimentHeader
                activePair={activePair}
                setActivePair={setActivePair}
                activeExchange={activeExchange}
                setActiveExchange={setActiveExchange}
                onRefresh={syncData}
                isSyncing={isHeatmapLoading}
                isNerEnabled={isNerEnabled}
                setIsNerEnabled={setIsNerEnabled}
                nerData={nerData}
                isNerLoading={isNerLoading}

                aiModel={aiModel}
                setAiModel={setAiModel}
                chartData={chartData}
                sentimentSources={filteredSources}
            />

            {/* 1.5. Alpha Scanner (Hotlist) */}
            <div className="h-64">
                <ArbitrageScannerWidget />
            </div>
            {/* Header Skeleton Logic - kept optional for now as header usually stays visible.
                If strict initial loading needed:
                {isHeatmapLoading && !nerData ? <SentimentHeaderSkeleton /> : <SentimentHeader ... />}
                For now, keeping Header always visible as controls are needed, 
                unless user specifically requested header skeleton for loading state.
                Prompt said: "SentimentHeaderSkeleton.tsx: Placeholder for the top bar".
                I'll apply it when isHeatmapLoading AND !currentMetrics (initial load)
             */}

            {/* 2. Main Metrics Grid (1:3 Layout to match original: 1 col Metrics, 2 col Chart) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    {isHeatmapLoading && !currentMetrics ? (
                        <MetricsSkeleton />
                    ) : (
                        <SentimentScoreCards
                            data={{
                                ...currentMetrics,
                                fearGreedIndex,
                                fearGreedLabel
                            }}
                        />
                    )}
                    <FearGreedWidget />
                    <OnChainLiquidityWidget symbol={activePair} />
                    <ExchangeFlowWidget />
                </div>
                <div className="lg:col-span-2 flex flex-col space-y-6">
                    {isHeatmapLoading && !chartData ? (
                        <ChartSkeleton />
                    ) : (
                        <>
                            <SentimentPriceChart
                                historyData={chartData}
                                timeframe={timeframe}
                                setTimeframe={setTimeframe}
                                activePair={activePair}
                                correlation={correlation}
                            />
                            <SentimentDivergenceChart
                                data={chartData}
                                correlation={correlation}
                            />
                        </>
                    )}
                    <HighImpactWidget news={filteredSources} />
                </div>
            </div>

            {/* 3. Heatmap (Full Width) */}
            {isHeatmapLoading ? (
                <HeatmapSkeleton />
            ) : (
                <SentimentHeatmap
                    heatmapData={heatmapData}
                    isHeatmapLoading={isHeatmapLoading}
                    onSync={syncData}
                />
            )}

            {/* 3.1. NEW Market Narrative Command Center (Floating Widget) */}
            <SentimentCommandCenter
                report={marketReport}
                isLoading={isReportLoading}
                onGenerate={generateMarketReport}
            />

            {/* 3.5. Macro Economic Data */}
            <MacroEconomicWidget />

            {/* 4. Social Layer (Influencers + Poll) */}
            <CommunityVoting
                votes={pollStats}
                onVote={handleVote}
                influencers={influencers}
            />

            {/* 5. Narratives Grid */}
            <SentimentNarratives
                narratives={narratives}
                wordCloud={wordCloud}
                isNarrativeLoading={isNarrativeLoading}
                hasNarrativesLoaded={hasNarrativesLoaded}
                onGenerateNarratives={handleGenerateNarratives}
                onWordClick={handleTopicClick}
                selectedWord={selectedTopic}
            />

            {/* 6. Signal Analysis (Pie + AI Console) & Execution Widget */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <SentimentSignalAnalysis
                        sourceBreakdownData={sourceBreakdownData}
                        sentimentSources={sentimentSources}
                        aiSummary={aiSummary}
                        isSummaryLoading={isSummaryLoading}
                        selectedProvider={selectedProvider}
                        setSelectedProvider={setSelectedProvider}
                        onGenerateSummary={handleGenerateSummary}
                    />
                </div>
                <div className="lg:col-span-1">
                    <SmartExecutionWidget />
                </div>
            </div>

            {/* 7. Whale Activity & News Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Whale Watcher (1 col) */}
                <div className="lg:col-span-1 space-y-6">
                    <DarkPoolWidget symbol={activePair} />
                    <WhaleActivityWidget />
                </div>

                {/* Right Column: News Feed (2 cols) */}
                <div className="lg:col-span-2">
                    <SentimentNewsFeed
                        news={filteredSources}
                        activeFilter={activeFilter}
                        setActiveFilter={setActiveFilter}
                        activeSourceFilter={activeSourceFilter}
                        onSourceSelect={setActiveSourceFilter}
                        availableSources={availableSources}
                    />
                </div>
            </div>
        </div>
    );
};

export default SentimentEngine;
