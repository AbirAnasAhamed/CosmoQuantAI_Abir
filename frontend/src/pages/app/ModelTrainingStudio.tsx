import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Play, Square, Settings, Database, Activity, Terminal, CheckCircle2, XCircle, Loader2, Trash2, Zap, Layers, Check, Target, Cpu } from 'lucide-react';
import { mlTrainingService, TrainingJob } from '@/services/mlTrainingService';
import apiClient from '@/services/client';
import TargetSelection from '@/components/ml/TargetSelection';
import AdvancedHyperparameters from '@/components/ml/AdvancedHyperparameters';
import FeatureImportanceChart from '@/components/ml/FeatureImportanceChart';
import { HeatmapSymbolSelector } from '../../components/features/market/HeatmapSymbolSelector';
import LiveMarketPulse from '@/components/ml/LiveMarketPulse';
import { FloatingTVChartButton } from '@/components/features/market/FloatingTVChartButton';
import EquityCurveChart from '@/components/ml/EquityCurveChart'; // ✅ New
import { DatasetVisualizerModal } from '@/components/DatasetVisualizerModal';
import PredatoryLiquidityPipeline, { GET_DEFAULT_MANDATORY_PLP_FEATURES } from '@/components/ml/PredatoryLiquidityPipeline';
import { AdvancedExecutionSettings } from '@/components/app/AdvancedExecutionSettings'; // ✅ New
import { AlternativeDataSettings } from '@/components/app/AlternativeDataSettings'; // ✅ New
import EnsembleBuilder from '@/components/ml/EnsembleBuilder';
import RLTrainingVisualizer from '@/components/ml/RLTrainingVisualizer';

import { mlModelsService } from '@/services/mlModelsService';

const ModelTrainingStudio: React.FC<{ retrainModelId?: string | null }> = ({ retrainModelId }) => {
    const [symbol, setSymbol] = useState('BTC/USDT');
    const [exchange, setExchange] = useState('binance');
    const [timeframe, setTimeframe] = useState('1d');
    const [algorithm, setAlgorithm] = useState('Random Forest');
    const [epochs, setEpochs] = useState(10);
    const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['RSI', 'MACD']);
    const [dataSource, setDataSource] = useState('ohlcv');
    const [isAutoRetrain, setIsAutoRetrain] = useState(false);
    const [retrainInterval, setRetrainInterval] = useState(6);
    const [dataLookback, setDataLookback] = useState(6);
    const [ohlcvStartDate, setOhlcvStartDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    });
    const [ohlcvEndDate, setOhlcvEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [isResampleL2, setIsResampleL2] = useState(true);
    
    // Deep Training States
    const targetRowOptions = [1000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000, 100000000];
    const [targetRowsIndex, setTargetRowsIndex] = useState(3); // Default 100k
    const [manualTargetRows, setManualTargetRows] = useState<string>('100000'); // Manual input mirror
    const [isManualInputMode, setIsManualInputMode] = useState(false);
    const [isDeepTraining, setIsDeepTraining] = useState(false);
    
    // New Feature States
    const [predictionTarget, setPredictionTarget] = useState('classification');
    const [learningRate, setLearningRate] = useState(0.1);
    const [maxDepth, setMaxDepth] = useState(6);
    const [modelName, setModelName] = useState('');
    const [initialBalance, setInitialBalance] = useState(10000); // ✅ New
    const [tradingFees, setTradingFees] = useState(0.02); // ✅ New
    const [slippage, setSlippage] = useState(0.01); // ✅ New
    const [sequenceLength, setSequenceLength] = useState(30); // ✅ New
    
    // Execution Strategy States
    const [executionStrategy, setExecutionStrategy] = useState('standard');
    const [icebergSlices, setIcebergSlices] = useState(10);
    const [twapDuration, setTwapDuration] = useState(30);
    
    // Preprocessing States
    const [missingDataStrategy, setMissingDataStrategy] = useState('drop');
    const [outlierRemoval, setOutlierRemoval] = useState('none');
    const [scalingMethod, setScalingMethod] = useState('none');
    
    // AutoML States
    const [useAutoML, setUseAutoML] = useState(false);
    const [automlTrials, setAutomlTrials] = useState(20);

    // Ensemble States
    const [isEnsemble, setIsEnsemble] = useState(false);
    const [ensembleMethod, setEnsembleMethod] = useState<'voting' | 'stacking'>('voting');
    const [baseModels, setBaseModels] = useState<string[]>(['Random Forest', 'XGBoost']);
    const [metaModel, setMetaModel] = useState<string>('Logistic Regression');
    const [votingStrategy, setVotingStrategy] = useState<'hard' | 'soft'>('soft');
    const [autoOptimizeWeights, setAutoOptimizeWeights] = useState(false);
    const [featureSubspacing, setFeatureSubspacing] = useState(false);
    
    const [isTraining, setIsTraining] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    
    // Auto-Suggest States
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestedFeatures, setSuggestedFeatures] = useState<any[]>([]);
    const [selectedL2Features, setSelectedL2Features] = useState<string[]>(['obi', 'spread', 'microprice']);
    const [selectedAltFeatures, setSelectedAltFeatures] = useState<string[]>(['fng_value']); // ✅ New
    const [analysisStats, setAnalysisStats] = useState<{rows: number, features: number} | null>(null);
    const [showManualFeatures, setShowManualFeatures] = useState(false);
    
    const [currentJob, setCurrentJob] = useState<TrainingJob | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [showVisualizer, setShowVisualizer] = useState(false);
    const [isRetrainMode, setIsRetrainMode] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    
    // Historical Trades CSV States
    const [tradeFiles, setTradeFiles] = useState<string[]>([]);
    const [selectedTradeFile, setSelectedTradeFile] = useState('');
    const [tradeBarType, setTradeBarType] = useState('time');
    const [tradeBarSize, setTradeBarSize] = useState('1m');
    const [tradeVolumeThreshold, setTradeVolumeThreshold] = useState('10.0');
    const [selectedTradeFeatures, setSelectedTradeFeatures] = useState<string[]>(['cvd', 'buy_volume', 'sell_volume', 'trade_count']);
    const [initialLoadedTradeFeatures, setInitialLoadedTradeFeatures] = useState<string[]>([]);

    // Hybrid Deep (L2 + Live Trade) States
    const [selectedHybridDeepTradeFeatures, setSelectedHybridDeepTradeFeatures] = useState<string[]>([
        'cvd', 'buy_volume', 'sell_volume', 'trade_count',
        'aggressor_ratio', 'large_trade_flag', 'vwap_deviation',
    ]);
    const [selectedPlpFeatures, setSelectedPlpFeatures] = useState<string[]>(GET_DEFAULT_MANDATORY_PLP_FEATURES());

    // UI states for Retrain Mode highlighting
    const [retrainModelName, setRetrainModelName] = useState<string>('');
    const [initialLoadedIndicators, setInitialLoadedIndicators] = useState<string[]>([]);
    const [initialLoadedL2Features, setInitialLoadedL2Features] = useState<string[]>([]);
    const [initialLoadedPlpFeatures, setInitialLoadedPlpFeatures] = useState<string[]>([]);
    const [initialAlgorithm, setInitialAlgorithm] = useState<string>('');
    const [isCrossAlgorithmTransfer, setIsCrossAlgorithmTransfer] = useState(false);

    useEffect(() => {
        if (retrainModelId) {
            setIsRetrainMode(true);
            mlModelsService.getModelConfig(retrainModelId).then((config: any) => {
                if (config.model_name) setRetrainModelName(config.model_name);
                if (config.symbol) setSymbol(config.symbol);
                if (config.timeframe) setTimeframe(config.timeframe);
                if (config.algorithm) {
                    setAlgorithm(config.algorithm);
                    setInitialAlgorithm(config.algorithm);
                }
                if (config.config?.indicators) {
                    setSelectedIndicators(config.config.indicators);
                    setInitialLoadedIndicators(config.config.indicators);
                }
                if (config.config?.l2_features) {
                    setSelectedL2Features(config.config.l2_features);
                    setInitialLoadedL2Features(config.config.l2_features);
                }
                if (config.config?.trade_features) {
                    setSelectedTradeFeatures(config.config.trade_features);
                    setSelectedHybridDeepTradeFeatures(config.config.trade_features);
                    setInitialLoadedTradeFeatures(config.config.trade_features);
                }
                if (config.config?.plp_features) {
                    setSelectedPlpFeatures(config.config.plp_features);
                    setInitialLoadedPlpFeatures(config.config.plp_features);
                }
                if (config.config?.alt_features) {
                    setSelectedAltFeatures(config.config.alt_features);
                }
                if (config.config?.dataset_type) setDataSource(config.config.dataset_type);
                if (config.config?.exchange) setExchange(config.config.exchange);
                if (config.config?.epochs) setEpochs(config.config.epochs);
            }).catch(err => {
                console.error("Failed to load retrain config", err);
            });
        }
    }, [retrainModelId]);

    useEffect(() => {
        if (dataSource === 'historical_trades') {
            apiClient.get('/backtest/trade-files').then((res) => {
                setTradeFiles(res.data);
                if (res.data.length > 0 && !selectedTradeFile) {
                    setSelectedTradeFile(res.data[0]);
                }
            }).catch(e => console.error("Failed to load trade files", e));
        }
    }, [dataSource, selectedTradeFile]);

    const MULTI_PARAM_MAP: Record<string, string> = {
        'RSI Multi': '[7, 14, 21]',
        'Stoch Multi': 'k:[9, 14, 21]',
        'ROC Multi': '[10, 20, 50]',
        'CCI Multi': '[14, 20, 40]',
        'WillR Multi': '[14, 28, 50]',
        'MFI Multi': '[14, 21, 50]',
        'MACD Multi': '[12-26, 8-21, 5-13]',
        'EMA Multi': '[9, 21, 50, 200]',
        'SMA Multi': '[10, 20, 50, 200]',
        'ADX Multi': '[14, 28]',
        'Supertrend Multi': '[(7,3), (10,3), (14,2)]',
        'Parabolic SAR Multi': '[0.02, 0.04]',
        'BBANDS Multi': '[20, 50]',
        'ATR Multi': '[7, 14, 21]',
        'Keltner Channel Multi': '[20, 50]',
        'Donchian Channel Multi': '[20, 50]',
        'CMF Multi': '[20, 50]'
    };

    const INDICATOR_CATEGORIES = [
        { name: 'Institutional & SMC', indicators: ['SMC FVG', 'ICT Killzones', 'Order Blocks', 'Market Structure', 'Wick Rejection', 'VWAP_SD'] },
        { name: 'Momentum', indicators: ['RSI', 'Stoch', 'ROC', 'CCI', 'WillR', 'MFI'] },
        { name: 'Trend', indicators: ['MACD', 'EMA', 'SMA', 'ADX', 'Supertrend', 'Parabolic SAR'] },
        { name: 'Volatility', indicators: ['BBANDS', 'ATR', 'Keltner Channel', 'Donchian Channel'] },
        { name: 'Volume', indicators: ['OBV', 'VWAP', 'CMF', 'ADOSC'] },
        { name: 'Multi-Parameter (Dynamic)', indicators: ['RSI Multi', 'Stoch Multi', 'ROC Multi', 'CCI Multi', 'WillR Multi', 'MFI Multi', 'MACD Multi', 'EMA Multi', 'SMA Multi', 'ADX Multi', 'Supertrend Multi', 'Parabolic SAR Multi', 'BBANDS Multi', 'ATR Multi', 'Keltner Channel Multi', 'Donchian Channel Multi', 'CMF Multi'] }
    ];

    const PRESET_PACKS = [
        { name: 'Institutional', icon: '🏦', list: ['SMC FVG', 'ICT Killzones', 'Order Blocks', 'Market Structure', 'Wick Rejection', 'VWAP_SD'] },
        { name: 'Momentum', icon: '🚀', list: ['RSI', 'ROC', 'Stoch', 'MFI', 'WillR'] },
        { name: 'Trend', icon: '📈', list: ['MACD', 'EMA', 'SMA', 'ADX', 'Supertrend'] },
        { name: 'Dynamic (Multi)', icon: '🧠', list: ['RSI Multi', 'MACD Multi', 'EMA Multi', 'ATR Multi'] },
        { name: 'Kitchen Sink', icon: '🏆', list: ['SMC FVG', 'ICT Killzones', 'Order Blocks', 'Market Structure', 'Wick Rejection', 'VWAP_SD', 'RSI', 'Stoch', 'ROC', 'CCI', 'WillR', 'MFI', 'MACD', 'EMA', 'SMA', 'ADX', 'Supertrend', 'Parabolic SAR', 'BBANDS', 'ATR', 'Keltner Channel', 'Donchian Channel', 'OBV', 'VWAP', 'CMF', 'ADOSC'] }
    ];
    const ALGORITHM_CATEGORIES = [
        { 
            name: "Indicator & Tabular Engines", 
            desc: "Fastest. Best for Technical Indicators & L2 Snapshots", 
            algos: [
                { id: 'Random Forest', type: 'Supervised', desc: 'Ensemble of decision trees' },
                { id: 'XGBoost', type: 'Supervised', desc: 'Optimized gradient boosting' },
                { id: 'LightGBM', type: 'Supervised', desc: 'Fast, distributed gradient boosting' },
                { id: 'CatBoost', type: 'Supervised', desc: 'Great for categorical and tabular data' },
                { id: 'TabNet', type: 'Supervised', desc: 'Deep learning for tabular data with attention' }
            ] 
        },
        { 
            name: "Trend & Sequence Memory", 
            desc: "Best for tracking long-term trends & historical patterns", 
            algos: [
                { id: 'LSTM', type: 'Supervised', desc: 'Long Short-Term Memory networks' },
                { id: 'GRU', type: 'Supervised', desc: 'Gated Recurrent Units, faster than LSTM' },
                { id: 'TCN', type: 'Supervised', desc: 'Temporal Convolutional Network' }
            ] 
        },
        { 
            name: "Micro-Pattern & Scalping", 
            desc: "Best for raw Orderbook flow & spatial feature extraction", 
            algos: [
                { id: '1D-CNN', type: 'Supervised', desc: '1D Convolutional Neural Network' },
                { id: 'DeepLOB', type: 'Supervised', desc: 'Deep learning model for Limit Order Books' },
                { id: 'Transformer', type: 'Supervised', desc: 'Attention-based sequence modeling' }
            ] 
        },
        { 
            name: "RL: Active Trading Agents", 
            desc: "Standard self-learning environments (Live/Simulated Trading)", 
            algos: [
                { id: 'PPO-RL', type: 'Reinforcement Learning', desc: 'Proximal Policy Optimization' },
                { id: 'SAC-RL', type: 'Reinforcement Learning', desc: 'Soft Actor-Critic for continuous action' },
                { id: 'A2C-RL', type: 'Reinforcement Learning', desc: 'Advantage Actor-Critic (Fast Baseline)' },
                { id: 'DDPG-RL', type: 'Reinforcement Learning', desc: 'Deep Deterministic Policy Gradient' },
                { id: 'TD3-RL', type: 'Reinforcement Learning', desc: 'Twin Delayed DDPG (Stable Continuous)' },
                { id: 'DQN-RL', type: 'Reinforcement Learning', desc: 'Dueling Double DQN (Discrete actions)' }
            ] 
        },
        { 
            name: "RL: Risk-Aware (Distributional)", 
            desc: "Models that learn the distribution of returns to minimize risk", 
            algos: [
                { id: 'QR-DQN', type: 'Distributional RL', desc: 'Quantile Regression DQN (Risk-Aware)' }
            ] 
        },
        { 
            name: "RL: Offline & Imitation", 
            desc: "Learn from historical or expert trader demonstrations", 
            algos: [
                { id: 'CQL', type: 'Offline RL', desc: 'Conservative Q-Learning (Learn from history)' },
                { id: 'GAIL', type: 'Imitation Learning', desc: 'Generative Adversarial Imitation Learning' }
            ] 
        },
        { 
            name: "Next-Gen Architectures", 
            desc: "Cutting-edge dynamic neural models", 
            algos: [
                { id: 'Decision-Transformer', type: 'Offline RL', desc: 'Action generation based on target ROI' },
                { id: 'Liquid-NN', type: 'Continuous RNN', desc: 'Dynamically adapts weights during live trading' }
            ] 
        },
        { 
            name: "Anomaly Detection", 
            desc: "Unsupervised learning for crash/pump detection", 
            algos: [
                { id: 'Auto-Encoder', type: 'Unsupervised', desc: 'Finds anomalies via reconstruction loss' }
            ] 
        }
    ];
    const TIMEFRAMES = ['1s', '5s', '1m', '5m', '15m', '1h', '4h', '1d'];
    const ALL_L2_FEATURES = [
        { internal: "Effective_Spread", name: "Effective Spread" },
        { internal: "Spread_ROC", name: "Spread ROC" },
        { internal: "Mid_Price_Acceleration", name: "Mid-Price Acceleration" },
        { internal: "Spread_Asymmetry", name: "Spread Asymmetry" },
        { internal: "WAP_Top_5", name: "WAP Top 5" },
        { internal: "WAP_Top_10", name: "WAP Top 10" },
        { internal: "Multi_Level_Imbalance_Top5", name: "Multi-Level Imbalance (Top 5)" },
        { internal: "Multi_Level_Imbalance_Top10", name: "Multi-Level Imbalance (Top 10)" },
        { internal: "Depth_Ratio", name: "Depth Ratio (Bid/Ask)" },
        { internal: "Ask_Wall_Distance", name: "Wall Distance (Ask)" },
        { internal: "Bid_Wall_Distance", name: "Wall Distance (Bid)" },
        { internal: "Order_Book_Skewness", name: "Order Book Skewness (Sk)" },
        { internal: "Level_1_Imbalance", name: "Level-1 Imbalance" },
        { internal: "Imbalance_Momentum", name: "Imbalance Momentum" },
        { internal: "Order_Flow_Imbalance", name: "Order Flow Imbalance (OFI)" },
        { internal: "CVD_Proxy", name: "Cumulative Volume Delta (CVD)" },
        { internal: "CVD_Acceleration", name: "CVD Acceleration" },
        { internal: "Realized_Micro_Volatility", name: "Realized Micro-Volatility" },
        { internal: "Tick_Test_Roll", name: "Tick Test Roll (Auto-correlation)" },
        { internal: "obi", name: "Order Book Imbalance (OBI)" },
        { internal: "spread", name: "Quoted Spread" },
        { internal: "microprice", name: "Micro-Price" },
        { internal: "obi_delta", name: "OBI Delta ✨ (NEW)", desc: "Rate of change of Order Book Imbalance" },
        { internal: "microprice_deviation", name: "Microprice Deviation ✨ (NEW)", desc: "Deviation of volume-weighted microprice from midprice" },
        { internal: "quote_stuffing_ratio", name: "Quote Stuffing Ratio ✨ (NEW)", desc: "Proxy for spam (rapid placement vs execution)" },
        { internal: "depth_variance", name: "Order Book Depth Variance ✨ (NEW)", desc: "Rolling variance of bid/ask depth at top levels" },
        { internal: "slippage_proxy", name: "Slippage Proxy ✨ (NEW)", desc: "Estimated cost of a simulated 10 units market order" },
        { internal: "spread_reversion_rate", name: "Spread Reversion Rate ✨ (NEW)", desc: "Speed at which a widened spread contracts" },
        { internal: "smart_money_divergence", name: "Smart Money Divergence ✨ (NEW)", desc: "Divergence between price momentum and depth momentum" },
        { internal: "bid_ask_absorption", name: "Bid/Ask Absorption Rate ✨ (NEW)", desc: "Rate at which limit orders are absorbing aggressive market flow" },
        { internal: "liquidity_replenishment_rate", name: "Liquidity Replenishment Rate ✨ (NEW)", desc: "Time-proxy for liquidity refilling after level clearance" },
        { internal: "bbo_flicker_rate", name: "BBO Flicker Rate ✨ (NEW)", desc: "Volatility of the top-of-book levels" },
        { internal: "order_flow_toxicity", name: "Order Flow Toxicity (VPIN) ✨ (NEW)", desc: "Probability of Informed Trading based on depth" },
        { internal: "hidden_volume_proxy", name: "Hidden Volume Proxy ✨ (NEW)", desc: "Detection of abnormally low slippage despite large volume" }
    ];

    const ALL_TRADE_FEATURES = [
        { internal: "cvd", name: "Cumulative Volume Delta (CVD)" },
        { internal: "buy_volume", name: "Buy Volume Profile" },
        { internal: "sell_volume", name: "Sell Volume Profile" },
        { internal: "trade_count", name: "Trade Count (Tick Velocity)" },
        { internal: "rolling_vol_imbalance", name: "Rolling Volume Imbalance ✨ (NEW)", desc: "Buy vs Sell dominance (100 ticks)" },
        { internal: "trade_velocity", name: "Trade Velocity (Hz) ✨ (NEW)", desc: "Trades executed per second" },
        { internal: "vwap_deviation", name: "VWAP Deviation", desc: "Distance of current price from rolling VWAP" },
        { internal: "consecutive_runs", name: "Consecutive Runs ✨ (NEW)", desc: "Streak length of trades in the same direction" },
        { internal: "aggressor_ratio", name: "Aggressor Ratio", desc: "Percentage of trades initiated by buyers" },
        { internal: "avg_trade_size", name: "Average Trade Size (ATS) ✨ (NEW)", desc: "Mean size of last 100 trades" },
        { internal: "whale_trade_freq", name: "Whale Trade Frequency 🐋 ✨ (NEW)", desc: "Frequency of trades > 95th percentile" },
        { internal: "retail_participation_ratio", name: "Retail Participation ✨ (NEW)", desc: "Frequency of trades < 25th percentile" },
        { internal: "trade_size_variance", name: "Trade Size Variance ✨ (NEW)", desc: "Volatility in order flow sizes" },
        { internal: "iceberg_proxy_count", name: "Iceberg Order Proxy 🧊 ✨ (NEW)", desc: "Consecutive trades executed exactly at same price" },
        { internal: "up_down_tick_ratio", name: "Up/Down Tick Volume Ratio ✨ (NEW)", desc: "Volume traded on up-ticks vs down-ticks" },
        { internal: "micro_volatility", name: "Micro-Volatility ✨ (NEW)", desc: "Standard deviation of tick returns" },
        { internal: "amihud_illiquidity", name: "Amihud Illiquidity ✨ (NEW)", desc: "Price impact per unit volume traded" },
        { internal: "tick_speed", name: "Tick Speed (ms)", desc: "Average milliseconds between trades" },
        { internal: "tick_acceleration", name: "Tick Acceleration ✨ (NEW)", desc: "Rate of change of tick speed (Momentum of momentum)" },
        { internal: "zero_tick_ratio", name: "Zero-Tick Ratio ✨ (NEW)", desc: "Percentage of trades causing zero price movement" },
        { internal: "realized_variance", name: "Realized Variance ✨ (NEW)", desc: "Sum of squared tick returns" },
        { internal: "kyles_lambda", name: "Kyle's Lambda ✨ (NEW)", desc: "Regression slope of price change on volume (Market impact)" },
        { internal: "autocorr_signs", name: "Order Sign Auto-correlation ✨ (NEW)", desc: "Predictability of order direction (Lag-1)" },
        { internal: "entropy_of_signs", name: "Order Flow Entropy ✨ (NEW)", desc: "Shannon entropy of trade directions (Predictability)" },
        { internal: "roll_measure_spread", name: "Roll Measure Spread ✨ (NEW)", desc: "Implicit spread estimated from tick covariance" },
        { internal: "vpin_proxy", name: "VPIN Proxy ✨ (NEW)", desc: "Volume-Synchronized Probability of Informed Trading" }
    ];

    // ── Hybrid Deep: 12 Trade Tick Features ────────────────────────────────────
    const ALL_HYBRID_DEEP_TRADE_FEATURES = [
        { internal: "cvd",                   name: "CVD (Real aggTrade)",             desc: "Cumulative Volume Delta from actual executed trades" },
        { internal: "buy_volume",            name: "Buy Volume",                       desc: "Aggressive buy volume per tick" },
        { internal: "sell_volume",           name: "Sell Volume",                      desc: "Aggressive sell volume per tick" },
        { internal: "trade_count",           name: "Trade Count",                      desc: "Number of trades (tick velocity)" },
        { internal: "rolling_vol_imbalance", name: "Rolling Volume Imbalance ✨ (NEW)", desc: "Buy vs Sell dominance (100 ticks)" },
        { internal: "trade_velocity", name: "Trade Velocity (Hz) ✨ (NEW)", desc: "Trades executed per second" },
        { internal: "vwap_deviation",        name: "VWAP Deviation",                   desc: "Price distance from running VWAP" },
        { internal: "consecutive_runs", name: "Consecutive Runs ✨ (NEW)", desc: "Streak length of trades in the same direction" },
        { internal: "aggressor_ratio",       name: "Aggressor Ratio",                  desc: "Rolling buy aggressor rate (100-tick window)" },
        { internal: "avg_trade_size", name: "Average Trade Size (ATS) ✨ (NEW)", desc: "Mean size of last 100 trades" },
        { internal: "whale_trade_freq", name: "Whale Trade Frequency 🐋 ✨ (NEW)", desc: "Frequency of trades > 95th percentile" },
        { internal: "retail_participation_ratio", name: "Retail Participation ✨ (NEW)", desc: "Frequency of trades < 25th percentile" },
        { internal: "trade_size_variance", name: "Trade Size Variance ✨ (NEW)", desc: "Volatility in order flow sizes" },
        { internal: "iceberg_proxy_count", name: "Iceberg Order Proxy 🧊 ✨ (NEW)", desc: "Consecutive trades executed exactly at same price" },
        { internal: "up_down_tick_ratio", name: "Up/Down Tick Volume Ratio ✨ (NEW)", desc: "Volume traded on up-ticks vs down-ticks" },
        { internal: "micro_volatility", name: "Micro-Volatility ✨ (NEW)", desc: "Standard deviation of tick returns" },
        { internal: "amihud_illiquidity", name: "Amihud Illiquidity ✨ (NEW)", desc: "Price impact per unit volume traded" },
        { internal: "tick_speed",            name: "Tick Speed (ms/trade)",            desc: "Average milliseconds between consecutive trades" },
        { internal: "tick_acceleration", name: "Tick Acceleration ✨ (NEW)", desc: "Rate of change of tick speed" },
        { internal: "zero_tick_ratio", name: "Zero-Tick Ratio ✨ (NEW)", desc: "Percentage of trades causing zero price movement" },
        { internal: "realized_variance", name: "Realized Variance ✨ (NEW)", desc: "Sum of squared tick returns" },
        { internal: "kyles_lambda", name: "Kyle's Lambda ✨ (NEW)", desc: "Regression slope of price change on volume (Market impact)" },
        { internal: "autocorr_signs", name: "Order Sign Auto-correlation ✨ (NEW)", desc: "Predictability of order direction (Lag-1)" },
        { internal: "entropy_of_signs", name: "Order Flow Entropy ✨ (NEW)", desc: "Shannon entropy of trade directions (Predictability)" },
        { internal: "roll_measure_spread", name: "Roll Measure Spread ✨ (NEW)", desc: "Implicit spread estimated from tick covariance" },
        { internal: "vpin_proxy", name: "VPIN Proxy ✨ (NEW)", desc: "Volume-Synchronized Probability of Informed Trading" }
    ];

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [currentJob?.logs]);

    // Polling logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isTraining && currentJob && ['PENDING', 'RUNNING'].includes(currentJob.status)) {
            interval = setInterval(async () => {
                try {
                    const latestJob = await mlTrainingService.getJobStatus(currentJob.id);
                    setCurrentJob(latestJob);
                    if (['COMPLETED', 'FAILED'].includes(latestJob.status)) {
                        setIsTraining(false);
                        clearInterval(interval);
                    }
                } catch (error) {
                    console.error("Error fetching job status:", error);
                }
            }, 1000); // Poll every 1 second
        }
        return () => clearInterval(interval);
    }, [isTraining, currentJob?.id, currentJob?.status]);

    const handleToggleIndicator = (ind: string) => {
        setSelectedIndicators(prev => 
            prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
        );
    };

    const applyPresetPack = (packList: string[]) => {
        setSelectedIndicators(packList);
    };

    const handleStartTraining = async () => {
        try {
            setIsTraining(true);
            setShowTerminal(true);
            setCurrentJob(null);
            
            // Fix: Send "Tick" instead of the default timeframe if we are using raw unresampled L2 data
            const actualTimeframe = (dataSource === 'l2_orderbook' && !isResampleL2) ? 'Tick' : timeframe;

            // Hybrid Deep always collects at tick level — no resampling needed
            const hybridDeepTargetRows = parseInt(manualTargetRows, 10) || targetRowOptions[targetRowsIndex];

            const job = await mlTrainingService.startTraining({
                symbol,
                timeframe: dataSource === 'hybrid_deep' ? 'Tick' : actualTimeframe,
                algorithm,
                config: {
                    indicators: (dataSource === 'ohlcv' || dataSource === 'hybrid' || dataSource === 'historical_trades') ? selectedIndicators : [],
                    epochs,
                    dataset_type: dataSource,
                    is_auto_retrain: isAutoRetrain,
                    retrain_interval_hours: isAutoRetrain ? retrainInterval : undefined,
                    data_lookback_hours: dataLookback,
                    ohlcv_start_date: (dataSource === 'ohlcv' || dataSource === 'hybrid') ? ohlcvStartDate : undefined,
                    ohlcv_end_date: (dataSource === 'ohlcv' || dataSource === 'hybrid') ? ohlcvEndDate : undefined,
                    resample_l2: (dataSource === 'l2_orderbook' || dataSource === 'hybrid') ? isResampleL2 : undefined,
                    prediction_target: predictionTarget,
                    missing_data_strategy: missingDataStrategy,
                    outlier_removal: outlierRemoval,
                    scaling_method: scalingMethod,
                    learning_rate: learningRate,
                    max_depth: maxDepth,
                    model_name: modelName,
                    initial_balance: initialBalance,
                    commission: tradingFees,
                    slippage: slippage,
                    sequence_length: sequenceLength,
                    exchange: exchange,
                    is_deep_training: (dataSource === 'l2_orderbook' || dataSource === 'hybrid' || dataSource === 'historical_trades') ? isDeepTraining : false,
                    target_rows: ((dataSource === 'l2_orderbook' || dataSource === 'hybrid' || dataSource === 'historical_trades') && isDeepTraining)
                        ? (parseInt(manualTargetRows, 10) || targetRowOptions[targetRowsIndex])
                        : (dataSource === 'hybrid_deep' ? hybridDeepTargetRows : 0),
                    l2_features: (dataSource === 'l2_orderbook' || dataSource === 'hybrid' || dataSource === 'hybrid_deep') ? selectedL2Features : [],
                    target_model_id: isRetrainMode ? (retrainModelId || undefined) : undefined,
                    fine_tune: isRetrainMode,
                    is_cross_algorithm_transfer: isCrossAlgorithmTransfer,
                    // Trade CSV params
                    trade_file: dataSource === 'historical_trades' ? selectedTradeFile : undefined,
                    bar_type: dataSource === 'historical_trades' ? tradeBarType : undefined,
                    bar_size: dataSource === 'historical_trades' ? tradeBarSize : undefined,
                    volume_threshold: dataSource === 'historical_trades' ? tradeVolumeThreshold : undefined,
                    trade_features: dataSource === 'historical_trades' ? selectedTradeFeatures : undefined,
                    // Hybrid Deep params (new)
                    hybrid_deep_trade_features: dataSource === 'hybrid_deep' ? selectedHybridDeepTradeFeatures : undefined,
                    plp_features: (dataSource === 'hybrid_deep' || dataSource === 'l2_orderbook' || dataSource === 'hybrid') ? selectedPlpFeatures : undefined,
                    // Execution strategy params
                    execution_strategy: executionStrategy,
                    iceberg_slices: executionStrategy === 'iceberg' ? icebergSlices : undefined,
                    twap_duration_minutes: executionStrategy === 'twap' ? twapDuration : undefined,
                    // Alternative Data params
                    alt_features: selectedAltFeatures,
                    use_automl: useAutoML,
                    automl_trials: automlTrials,
                    is_ensemble: isEnsemble,
                    ensemble_method: isEnsemble ? ensembleMethod : undefined,
                    base_models: isEnsemble ? baseModels : undefined,
                    meta_model: isEnsemble && ensembleMethod === 'stacking' ? metaModel : undefined,
                    voting_strategy: isEnsemble && ensembleMethod === 'voting' ? votingStrategy : undefined,
                    auto_optimize_weights: isEnsemble && ensembleMethod === 'voting' && votingStrategy === 'soft' ? autoOptimizeWeights : undefined,
                    feature_subspacing: isEnsemble ? featureSubspacing : undefined,
                }
            });
            setCurrentJob(job);

            // Auto-open visualizer for live scraping, hybrid, hybrid_deep, but not for RL training
            if (!algorithm.includes('-RL') && (isDeepTraining || dataSource === 'hybrid' || dataSource === 'l2_orderbook' || dataSource === 'hybrid_deep')) {
                setShowVisualizer(true);
            }
        } catch (error) {
            console.error("Failed to start training", error);
            setIsTraining(false);
        }
    };

    const handleCancelTraining = async () => {
        if (!currentJob) return;
        if (!window.confirm("Are you sure you want to stop this training job?")) return;
        
        try {
            await mlTrainingService.cancelTraining(currentJob.id);
            setIsTraining(false);
            setCurrentJob(prev => prev ? { ...prev, status: 'FAILED', error_message: 'Training cancelled by user.' } : null);
        } catch (error) {
            console.error("Failed to cancel training", error);
            alert("Failed to cancel training job.");
        }
    };

    const handleClearL2Cache = async () => {
        if (!window.confirm("Are you sure you want to delete all cached L2 orderbook data? This cannot be undone.")) return;
        try {
            setIsClearing(true);
            const res = await apiClient.delete('/system/prune-l2-data');
            alert(res.data.message || "Cache cleared successfully.");
        } catch (error: any) {
            console.error("Failed to clear L2 cache", error);
            alert("Failed to clear cache: " + (error.response?.data?.detail || error.message));
        } finally {
            setIsClearing(false);
        }
    };

    const handleDeleteTradeFile = async () => {
        if (!selectedTradeFile) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedTradeFile}? This cannot be undone.`)) return;
        
        try {
            const res = await apiClient.delete(`/backtest/trade-files/${selectedTradeFile}`);
            if (res.data.success) {
                const updatedFiles = tradeFiles.filter(f => f !== selectedTradeFile);
                setTradeFiles(updatedFiles);
                if (updatedFiles.length > 0) {
                    setSelectedTradeFile(updatedFiles[0]);
                } else {
                    setSelectedTradeFile('');
                }
                alert(res.data.message || "File deleted successfully");
            }
        } catch (error: any) {
            console.error("Failed to delete trade file", error);
            alert("Failed to delete file: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleSuggestFeatures = async () => {
        try {
            setIsSuggesting(true);
            setSuggestedFeatures([]);
            const res = await apiClient.post('/model-training/suggest-features', { symbol });
            if (res.data.success) {
                setSuggestedFeatures(res.data.suggestions);
                setAnalysisStats({
                    rows: res.data.rows_scanned,
                    features: res.data.analyzed_count
                });
            }
        } catch (error: any) {
            console.error("Failed to suggest features", error);
            alert("Failed to analyze features: " + (error.response?.data?.detail || error.message));
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleToggleL2Feature = (featureInternal: string) => {
        setSelectedL2Features(prev => 
            prev.includes(featureInternal) ? prev.filter(f => f !== featureInternal) : [...prev, featureInternal]
        );
    };

    const handleToggleTradeFeature = (featureInternal: string) => {
        setSelectedTradeFeatures(prev =>
            prev.includes(featureInternal) ? prev.filter(f => f !== featureInternal) : [...prev, featureInternal]
        );
    };

    const handleToggleHybridDeepTradeFeature = (featureInternal: string) => {
        setSelectedHybridDeepTradeFeatures(prev =>
            prev.includes(featureInternal) ? prev.filter(f => f !== featureInternal) : [...prev, featureInternal]
        );
    };

    // Snap a raw number to the nearest preset index
    const snapToNearestPreset = (value: number): number => {
        let closestIdx = 0;
        let closestDiff = Math.abs(targetRowOptions[0] - value);
        for (let i = 1; i < targetRowOptions.length; i++) {
            const diff = Math.abs(targetRowOptions[i] - value);
            if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
        }
        return closestIdx;
    };

    // Handle the manual number input
    const handleManualRowInput = (raw: string) => {
        setManualTargetRows(raw);
        const num = parseInt(raw.replace(/,/g, ''), 10);
        if (!isNaN(num) && num > 0) {
            const clamped = Math.max(1, Math.min(100_000_000, num));
            setTargetRowsIndex(snapToNearestPreset(clamped));
        }
    };

    // When slider moves, keep the manual input in sync
    const handleSliderChange = (idx: number) => {
        setTargetRowsIndex(idx);
        setManualTargetRows(String(targetRowOptions[idx]));
    };

    return (
        <div className="h-full flex flex-col space-y-3 relative overflow-hidden">
            {/* Background Neon Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/20 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none"></div>

            <header className="flex items-center gap-4 z-10 px-2 mt-2">
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-cyan-400" />
                    {isRetrainMode ? "Model Retraining Studio" : "Machine Learning Engine Core"}
                    {isRetrainMode && <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping ml-2"></div>}
                </h2>
                <div className="w-px h-4 bg-white/20"></div>
                <div className="text-slate-400 text-xs font-medium tracking-wide flex items-center gap-2">
                    {isRetrainMode 
                        ? (
                            <>
                                Fine-tuning: <span className="text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">{retrainModelName || retrainModelId}</span> Add new features to increase intelligence.
                            </>
                        )
                        : `Advanced L2/OHLCV Machine Learning Synchronization Studio.`}
                </div>
            </header>

            <div className="flex-1 flex flex-col min-h-0 relative z-10">
                {/* Configuration Panel */}
                <div className="w-full flex flex-col bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden h-full">
                    {/* Glass reflection */}
                    <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 flex-1 min-h-0">
                        {/* COLUMN 1: Core Parameters */}
                        <div className="flex flex-col h-full bg-white/5 border border-amber-500/50 rounded-2xl shadow-[0_0_12px_rgba(245,158,11,0.4)] overflow-hidden">
                            <div className="p-5 bg-black/40 border-b border-white/10 flex-shrink-0 relative z-20">
                                <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2 uppercase tracking-widest"><Settings className="w-4 h-4" /> Core Parameters</h3>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar h-full">
                                <div className="grid grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Asset & Exchange</label>
                                <div className={isTraining ? 'opacity-50 pointer-events-none' : ''}>
                                    <HeatmapSymbolSelector 
                                        symbol={symbol} 
                                        exchange={exchange} 
                                        onSymbolChange={setSymbol} 
                                        onExchangeChange={setExchange} 
                                    />
                                </div>
                            </div>
                            <LiveMarketPulse symbol={symbol} exchange={exchange} />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Custom Model Name (Optional)</label>
                            <input 
                                type="text" 
                                value={modelName} 
                                onChange={e => setModelName(e.target.value)}
                                disabled={isTraining}
                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50 placeholder-white/30 shadow-inner"
                                placeholder="e.g., BTC_Scalper_V1"
                            />
                        </div>

                        <TargetSelection 
                            predictionTarget={predictionTarget}
                            setPredictionTarget={setPredictionTarget}
                            isTraining={isTraining}
                        />

                        {(dataSource === 'ohlcv' || dataSource === 'hybrid') && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Candle Interval</label>
                                <div className="grid grid-cols-5 gap-2">
                                {TIMEFRAMES.map(tf => (
                                    <button
                                        key={tf}
                                        disabled={isTraining}
                                        onClick={() => setTimeframe(tf)}
                                        className={`py-2 rounded-xl text-sm font-bold transition-all duration-300 ${timeframe === tf ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white hover:border-white/20'}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}

                        {dataSource === 'l2_orderbook' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Snapshot Interval (Sampling Rate)</label>
                                <div className="grid grid-cols-5 gap-2">
                                {['100ms', '500ms', '1s', '5s', 'Tick'].map(tf => (
                                    <button
                                        key={tf}
                                        disabled={isTraining}
                                        onClick={() => {
                                            setTimeframe(tf);
                                            setIsResampleL2(tf !== 'Tick');
                                        }}
                                        className={`py-2 rounded-xl text-sm font-bold transition-all duration-300 ${timeframe === tf ? 'bg-purple-500/20 text-purple-400 border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white hover:border-white/20'}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}
                        
                        {/* Data Preprocessing & Cleaning */}
                        <div className="mt-6 pt-6 border-t border-white/10">
                            <h4 className="text-xs font-bold text-teal-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4" /> Data Preprocessing
                            </h4>
                            
                            <div className="space-y-4">
                                {/* Missing Data Strategy */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Missing Data Handling</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'drop', label: 'Drop Rows' },
                                            { id: 'ffill', label: 'Forward Fill' },
                                            { id: 'mean', label: 'Fill Mean' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                disabled={isTraining}
                                                onClick={() => setMissingDataStrategy(opt.id)}
                                                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${missingDataStrategy === opt.id ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Outlier Removal */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Outlier Filtering</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'none', label: 'None' },
                                            { id: 'zscore', label: 'Z-Score (>3σ)' },
                                            { id: 'iqr', label: 'IQR Clipping' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                disabled={isTraining}
                                                onClick={() => setOutlierRemoval(opt.id)}
                                                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${outlierRemoval === opt.id ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Scaling Method */}
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Feature Scaling</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { id: 'none', label: 'None' },
                                            { id: 'standard', label: 'Standard' },
                                            { id: 'minmax', label: 'MinMax' },
                                            { id: 'robust', label: 'Robust' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                disabled={isTraining}
                                                onClick={() => setScalingMethod(opt.id)}
                                                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${scalingMethod === opt.id ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1.5 font-medium leading-tight">
                                        💡 Note: Deep Learning models use MinMax automatically if none is selected.
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                            </div>
                        </div>

                        {/* COLUMN 2: Neural Architecture */}
                        <div className="flex flex-col h-full bg-white/5 border border-amber-500/50 rounded-2xl shadow-[0_0_12px_rgba(245,158,11,0.4)] overflow-hidden">
                            <div className="p-5 bg-black/40 border-b border-white/10 flex-shrink-0 relative z-20">
                                <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 uppercase tracking-widest"><Cpu className="w-4 h-4" /> Neural Architecture</h3>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar h-full">

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-slate-300">Algorithm Engine</label>
                                {isRetrainMode && (
                                    <div className="flex items-center gap-2 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/30" title="Transfer knowledge to a different architecture">
                                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Cross-Algo Transfer</span>
                                        <button
                                            onClick={() => {
                                                if (isCrossAlgorithmTransfer) {
                                                    setAlgorithm(initialAlgorithm);
                                                }
                                                setIsCrossAlgorithmTransfer(!isCrossAlgorithmTransfer);
                                            }}
                                            disabled={isTraining}
                                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isCrossAlgorithmTransfer ? 'bg-purple-500' : 'bg-slate-600'} ${isTraining ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${isCrossAlgorithmTransfer ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {isCrossAlgorithmTransfer && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }} 
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl"
                                >
                                    <p className="text-[10px] text-purple-300 font-medium leading-relaxed">
                                        <span className="font-bold">Transfer Learning Hub:</span> You are transferring weights/knowledge from <strong className="text-white">{initialAlgorithm}</strong> to a new architecture. Select your target engine below.
                                        Supported pairs: PPO ↔ SAC, LSTM ↔ GRU, TCN ↔ 1D-CNN, XGBoost ↔ LightGBM.
                                    </p>
                                </motion.div>
                            )}
                            
                            <EnsembleBuilder
                                isEnsemble={isEnsemble}
                                setIsEnsemble={setIsEnsemble}
                                ensembleMethod={ensembleMethod}
                                setEnsembleMethod={setEnsembleMethod}
                                baseModels={baseModels}
                                setBaseModels={setBaseModels}
                                metaModel={metaModel}
                                setMetaModel={setMetaModel}
                                votingStrategy={votingStrategy}
                                setVotingStrategy={setVotingStrategy}
                                autoOptimizeWeights={autoOptimizeWeights}
                                setAutoOptimizeWeights={setAutoOptimizeWeights}
                                featureSubspacing={featureSubspacing}
                                setFeatureSubspacing={setFeatureSubspacing}
                                disabled={isTraining}
                            />

                            <AnimatePresence>
                                {!isEnsemble && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 mt-4"
                                    >
                                        {ALGORITHM_CATEGORIES.map(category => (
                                            <div key={category.name} className="space-y-2">
                                                <div>
                                                    <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{category.name}</h4>
                                                    <p className="text-[10px] text-slate-500 font-medium">{category.desc}</p>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {category.algos.map(algo => (
                                                        <div 
                                                            key={algo.id} 
                                                            onClick={() => {
                                                                if (!isTraining) {
                                                                    if (isRetrainMode && !isCrossAlgorithmTransfer && algo.id !== initialAlgorithm) {
                                                                        return; // Prevent changing if transfer mode is off
                                                                    }
                                                                    setAlgorithm(algo.id);
                                                                }
                                                            }}
                                                            className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all duration-300 relative overflow-hidden ${algorithm === algo.id ? (isRetrainMode && initialAlgorithm === algo.id ? 'border-purple-400 bg-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.3)]' : 'border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]') : 'border-white/10 bg-white/5 hover:bg-white/10'} ${isTraining || (isRetrainMode && !isCrossAlgorithmTransfer && algo.id !== initialAlgorithm) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <div className={`mt-1 w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${algorithm === algo.id ? 'border-purple-400' : 'border-white/30'}`}>
                                                                {algorithm === algo.id && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_#a855f7]"></div>}
                                                            </div>
                                                            <div className="ml-3 flex-1 pr-16">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-sm font-semibold tracking-wide ${algorithm === algo.id && isRetrainMode && initialAlgorithm === algo.id ? 'text-purple-300' : 'text-slate-200'}`}>{algo.id}</span>
                                                                    <span className="text-[8px] font-bold text-slate-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded uppercase tracking-widest">{algo.type}</span>
                                                                </div>
                                                                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{algo.desc}</p>
                                                            </div>
                                                            {isRetrainMode && initialAlgorithm === algo.id && (
                                                                <span className="absolute top-3 right-3 text-[9px] font-black uppercase text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30 flex items-center gap-1">
                                                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-ping"></div> Original
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Epochs / Trees</label>
                            <input 
                                type="number" 
                                value={epochs} 
                                onChange={e => setEpochs(parseInt(e.target.value))}
                                disabled={isTraining}
                                min={1}
                                max={500}
                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50 shadow-inner"
                            />
                            
                            {!useAutoML && (
                                <AdvancedHyperparameters 
                                    learningRate={learningRate}
                                    setLearningRate={setLearningRate}
                                    maxDepth={maxDepth}
                                    setMaxDepth={setMaxDepth}
                                    isTraining={isTraining}
                                />
                            )}

                            {/* ✅ AutoML Optuna Integration */}
                            {['Random Forest', 'XGBoost', 'LightGBM', 'CatBoost'].includes(algorithm) && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }} 
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`mt-4 p-4 rounded-2xl border transition-all duration-300 ${useAutoML ? 'bg-purple-500/10 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-white/5 border-white/10'}`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                            <BrainCircuit className="w-4 h-4" /> Optuna AutoML Tuning
                                        </h4>
                                        <button
                                            onClick={() => setUseAutoML(!useAutoML)}
                                            disabled={isTraining}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useAutoML ? 'bg-purple-500' : 'bg-slate-600'} ${isTraining ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useAutoML ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                    
                                    {useAutoML && (
                                        <div className="mt-3 pt-3 border-t border-purple-500/20">
                                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase flex items-center justify-between">
                                                <span>Search Trials</span>
                                                <span className="text-purple-300">{automlTrials} Trials</span>
                                            </label>
                                            <input 
                                                type="range" 
                                                min="5" 
                                                max="100" 
                                                step="5"
                                                value={automlTrials}
                                                onChange={(e) => setAutomlTrials(parseInt(e.target.value))}
                                                disabled={isTraining}
                                                className="w-full accent-purple-500 mt-2"
                                            />
                                            <p className="text-[10px] text-slate-500 mt-2 font-medium leading-tight">
                                                Automatically searches for the best max_depth, learning_rate, and estimators before final training. High trials take longer.
                                            </p>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* ✅ Advanced RL & Transformer Settings */}
                            {(algorithm === 'PPO-RL' || algorithm === 'Transformer') && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }} 
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="mt-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl space-y-4"
                                >
                                    <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                                        <Zap className="w-3.5 h-3.5" /> Engine Specific Settings
                                    </h4>
                                    
                                    {algorithm === 'Transformer' && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Sequence Length (Window)</label>
                                            <input 
                                                type="number" 
                                                value={sequenceLength} 
                                                onChange={e => setSequenceLength(parseInt(e.target.value))}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                            />
                                        </div>
                                    )}

                                    {algorithm === 'PPO-RL' && (
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Initial Balance ($)</label>
                                                <input 
                                                    type="number" 
                                                    value={initialBalance} 
                                                    onChange={e => setInitialBalance(parseInt(e.target.value))}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Trading Fees (%)</label>
                                                <input 
                                                    type="number" 
                                                    step="0.0001"
                                                    value={tradingFees} 
                                                    onChange={e => setTradingFees(parseFloat(e.target.value))}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Slippage (%)</label>
                                                <input 
                                                    type="number" 
                                                    step="0.0001"
                                                    value={slippage} 
                                                    onChange={e => setSlippage(parseFloat(e.target.value))}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                            </div>
                        </div>

                        {/* COLUMN 3: Data Engine & Features */}
                        <div className="flex flex-col h-full bg-white/5 border border-amber-500/50 rounded-2xl shadow-[0_0_12px_rgba(245,158,11,0.4)] overflow-hidden">
                            <div className="p-5 bg-black/40 border-b border-white/10 flex-shrink-0 relative z-20">
                                <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-widest"><Database className="w-4 h-4" /> Data Engine & Features</h3>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar h-full">

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
                                    <Database className="w-4 h-4 text-cyan-400" /> Data Source Engine
                                </label>
                                <button 
                                    onClick={handleClearL2Cache}
                                    disabled={isTraining || isClearing}
                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg transition-all hover:bg-red-500/20 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                                >
                                    {isClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Trash2 className="w-3.5 h-3.5" />}
                                    Clear L2 Cache
                                </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
                                <button
                                    onClick={() => setDataSource('ohlcv')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${dataSource === 'ohlcv' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(56,189,248,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    Standard OHLCV
                                </button>
                                <button
                                    onClick={() => setDataSource('l2_orderbook')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${dataSource === 'l2_orderbook' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    Level 2 Orderbook
                                </button>
                                <button
                                    onClick={() => setDataSource('hybrid')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${dataSource === 'hybrid' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    Hybrid (OHLCV + L2)
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <button
                                    onClick={() => setDataSource('historical_trades')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${dataSource === 'historical_trades' ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    Historical Trades (CSV)
                                </button>
                                <button
                                    onClick={() => setDataSource('hybrid_deep')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 relative overflow-hidden ${dataSource === 'hybrid_deep' ? 'bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)] border border-rose-400/30' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    {dataSource === 'hybrid_deep' && (
                                        <span className="absolute inset-0 bg-gradient-to-r from-rose-500/0 via-white/10 to-rose-500/0 animate-pulse" />
                                    )}
                                    🔥 Hybrid Deep (L2 + Live Trade)
                                </button>
                            </div>
                            
                            {dataSource === 'historical_trades' && (
                                <div className="mb-5 space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-inner">
                                        <div>
                                            <h4 className="text-sm font-bold text-amber-400">Deep Training (Live Scraping)</h4>
                                            <p className="text-xs text-slate-400 mt-0.5 font-medium">Scrape live trades instead of historical CSV.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={isDeepTraining}
                                                onChange={() => setIsDeepTraining(!isDeepTraining)}
                                                disabled={isTraining}
                                            />
                                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-orange-500"></div>
                                        </label>
                                    </div>
                                    
                                    {/* CSV File Selector — only when NOT live scraping */}
                                    {!isDeepTraining && (
                                        <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-inner">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-sm font-medium text-slate-300">Select Downloaded Trade Data</label>
                                                <button
                                                    onClick={handleDeleteTradeFile}
                                                    disabled={isTraining || !selectedTradeFile}
                                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded transition-all hover:bg-red-500/20 disabled:opacity-50"
                                                    title="Delete selected file"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    Delete
                                                </button>
                                            </div>
                                            <select 
                                                value={selectedTradeFile} 
                                                onChange={(e) => setSelectedTradeFile(e.target.value)}
                                                className="w-full bg-[#0A0A0A] border border-amber-500/30 rounded-lg p-2.5 text-slate-200"
                                                disabled={isTraining}
                                            >
                                                {tradeFiles.length === 0 ? <option value="">No trade files available in Backtester</option> : null}
                                                {tradeFiles.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {/* Bar Generation — always visible so user can control how ticks are aggregated */}
                                    <div className="space-y-3 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-inner">
                                        {isDeepTraining && (
                                            <p className="text-[11px] text-amber-400/80 font-semibold flex items-center gap-1.5">
                                                <span>⚡</span> Live scraped ticks will be aggregated using these bar settings.
                                            </p>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-1">Bar Generation Mode</label>
                                                <select 
                                                    value={tradeBarType} 
                                                    onChange={(e) => setTradeBarType(e.target.value)}
                                                    className="w-full bg-[#0A0A0A] border border-amber-500/30 rounded-lg p-2.5 text-slate-200"
                                                    disabled={isTraining}
                                                >
                                                    <option value="time">Time Bars (Time-based aggregation)</option>
                                                    <option value="volume">Volume Bars (Volume-based aggregation)</option>
                                                </select>
                                            </div>
                                            {tradeBarType === 'time' ? (
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-300 mb-1">Bar Timeframe</label>
                                                    <select 
                                                        value={tradeBarSize} 
                                                        onChange={(e) => setTradeBarSize(e.target.value)}
                                                        className="w-full bg-[#0A0A0A] border border-amber-500/30 rounded-lg p-2.5 text-slate-200"
                                                        disabled={isTraining}
                                                    >
                                                        {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                            ) : (
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-300 mb-1">Volume Threshold (Units)</label>
                                                    <input 
                                                        type="number"
                                                        value={tradeVolumeThreshold} 
                                                        onChange={(e) => setTradeVolumeThreshold(e.target.value)}
                                                        className="w-full bg-[#0A0A0A] border border-amber-500/30 rounded-lg p-2.5 text-slate-200"
                                                        disabled={isTraining}
                                                        step="0.1"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {isDeepTraining && (
                                        <div className="p-4 bg-white/5 border border-amber-500/20 rounded-xl space-y-4 shadow-inner">
                                            <div className="flex justify-between items-center">
                                                <label className="block text-sm font-medium text-slate-300">Target Executed Trades (Ticks)</label>
                                                <span className="text-sm font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-mono">
                                                    {targetRowOptions[targetRowsIndex].toLocaleString()} Ticks
                                                </span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={targetRowOptions.length - 1} 
                                                step={1}
                                                value={targetRowsIndex} 
                                                onChange={(e) => handleSliderChange(parseInt(e.target.value))}
                                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                disabled={isTraining}
                                            />
                                            <div className="flex justify-between text-[10px] text-slate-500 font-medium -mt-1">
                                                <span>1K</span><span>50K</span><span>500K</span><span>5M</span><span>50M</span><span>100M</span>
                                            </div>

                                            <div className="flex items-center gap-2 mt-2">
                                                <div className="relative flex-1">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={100000000}
                                                        step={1000}
                                                        value={manualTargetRows}
                                                        onChange={(e) => handleManualRowInput(e.target.value)}
                                                        className="w-full bg-[#0A0A0A] border border-amber-500/30 rounded-lg p-2.5 text-amber-400 font-mono text-center pl-8"
                                                        disabled={isTraining}
                                                    />
                                                    <Activity className="w-4 h-4 text-amber-500/50 absolute left-3 top-1/2 -translate-y-1/2" />
                                                </div>
                                                <button 
                                                    onClick={() => handleManualRowInput("100000")}
                                                    className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-all"
                                                    disabled={isTraining}
                                                >
                                                    100K
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white/5 backdrop-blur-md border border-amber-500/10 p-5 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                                        <div className="flex justify-between items-center mb-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                                                    <Layers className="w-4 h-4" />
                                                    Trade Feature Engineering
                                                </h3>
                                                <p className="text-xs text-slate-400 mt-1">Select highly-predictive features extracted from tick data.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (selectedTradeFeatures.length === ALL_TRADE_FEATURES.length) {
                                                            setSelectedTradeFeatures([]);
                                                        } else {
                                                            setSelectedTradeFeatures(ALL_TRADE_FEATURES.map(f => f.internal));
                                                        }
                                                    }}
                                                    disabled={isTraining}
                                                    className="text-xs font-bold bg-amber-500/10 text-amber-400 px-3 py-1 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                                                >
                                                    {selectedTradeFeatures.length === ALL_TRADE_FEATURES.length ? 'Deselect All' : 'Select All'}
                                                </button>
                                                <div className="text-xs font-bold bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20">
                                                    {selectedTradeFeatures.length} / {ALL_TRADE_FEATURES.length} Selected
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                            {ALL_TRADE_FEATURES.map((feat) => {
                                                const isSelected = selectedTradeFeatures.includes(feat.internal);
                                                return (
                                                    <button
                                                        key={feat.internal}
                                                        onClick={() => handleToggleTradeFeature(feat.internal)}
                                                        disabled={isTraining}
                                                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-300 ${
                                                            isSelected 
                                                                ? 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                                                                : 'bg-[#0A0A0A] border-white/5 hover:border-amber-500/30 hover:bg-white/5'
                                                        }`}
                                                    >
                                                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                                                            isSelected ? 'bg-amber-500 border-amber-500 text-black' : 'border-slate-600 bg-transparent'
                                                        }`}>
                                                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                                        </div>
                                                        <span className={`text-xs font-semibold ${isSelected ? 'text-amber-300' : 'text-slate-400'}`}>
                                                            {feat.name}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── HYBRID DEEP: L2 + Live Trade ─────────────────────────────── */}
                            {dataSource === 'hybrid_deep' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-5 space-y-4"
                                >
                                    {/* Dual WS Info Badge */}
                                    <div className="p-4 bg-gradient-to-r from-rose-900/30 to-orange-900/20 rounded-xl border border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.1)] relative overflow-hidden">
                                        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="flex gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                                                <div className="w-2 h-2 rounded-full bg-orange-400 animate-ping [animation-delay:0.3s]" />
                                            </div>
                                            <h4 className="text-sm font-black text-rose-300 tracking-wide">DUAL WEBSOCKET MODE</h4>
                                        </div>
                                        <div className="space-y-1.5 text-xs text-slate-400 font-medium ml-6">
                                            <div className="flex items-center gap-2">
                                                <span className="text-purple-400 font-bold">WS #1:</span>
                                                <code className="text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded text-[10px]">@depth20@100ms</code>
                                                <span>→ L2 Orderbook Snapshots</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-rose-400 font-bold">WS #2:</span>
                                                <code className="text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded text-[10px]">@aggTrade</code>
                                                <span>→ Live Executed Trades (per tick)</span>
                                            </div>
                                            <p className="text-slate-500 mt-1.5 leading-relaxed">
                                                One row per aggTrade tick · L2 features forward-filled via as-of merge.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Target Trade Ticks */}
                                    <div className="p-4 bg-white/5 border border-rose-500/20 rounded-xl space-y-4 shadow-inner">
                                        <div className="flex justify-between items-center">
                                            <label className="block text-sm font-medium text-slate-300">Target Trade Ticks (aggTrade)</label>
                                            <span className="text-sm font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 font-mono">
                                                {targetRowOptions[targetRowsIndex].toLocaleString()} Ticks
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={targetRowOptions.length - 1}
                                            step={1}
                                            value={targetRowsIndex}
                                            onChange={(e) => handleSliderChange(parseInt(e.target.value))}
                                            disabled={isTraining}
                                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                        />
                                        <div className="flex justify-between text-[10px] text-slate-500 font-medium -mt-1">
                                            <span>1K</span><span>50K</span><span>500K</span><span>5M</span><span>50M</span><span>100M</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={100000000}
                                                    step={1000}
                                                    value={manualTargetRows}
                                                    onChange={(e) => handleManualRowInput(e.target.value)}
                                                    onBlur={() => {
                                                        const num = parseInt(manualTargetRows.replace(/,/g, ''), 10);
                                                        if (!isNaN(num) && num > 0) {
                                                            const clamped = Math.max(1, Math.min(100_000_000, num));
                                                            setTargetRowsIndex(snapToNearestPreset(clamped));
                                                            setManualTargetRows(String(clamped));
                                                        }
                                                    }}
                                                    disabled={isTraining}
                                                    className="w-full bg-black/50 border border-rose-500/30 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-rose-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-rose-400/60 uppercase pointer-events-none">ticks</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-6 gap-1.5">
                                            {[{label:'1K',val:1_000},{label:'10K',val:10_000},{label:'100K',val:100_000},{label:'1M',val:1_000_000},{label:'10M',val:10_000_000},{label:'100M',val:100_000_000}].map(({label,val}) => {
                                                const isActive = targetRowOptions[targetRowsIndex] === val;
                                                return (
                                                    <button key={label} disabled={isTraining}
                                                        onClick={() => { const idx = targetRowOptions.indexOf(val); setTargetRowsIndex(idx); setManualTargetRows(String(val)); }}
                                                        className={`py-1 text-[10px] font-black rounded-lg border transition-all ${isActive ? 'bg-rose-600/30 border-rose-400/60 text-rose-300' : 'bg-black/30 border-white/10 text-slate-400 hover:border-rose-500/40 hover:text-rose-300'}`}
                                                    >{label}</button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Trade Tick Feature Selector — 12 features */}
                                    <div className="bg-white/5 border border-rose-500/20 p-5 rounded-2xl shadow-inner">
                                        <div className="flex justify-between items-center mb-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                                                    <Layers className="w-4 h-4" /> Trade Tick Features
                                                </h3>
                                                <p className="text-xs text-slate-400 mt-1">Real aggTrade features — not L2 proxies.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (selectedHybridDeepTradeFeatures.length === ALL_HYBRID_DEEP_TRADE_FEATURES.length) {
                                                            setSelectedHybridDeepTradeFeatures([]);
                                                        } else {
                                                            setSelectedHybridDeepTradeFeatures(ALL_HYBRID_DEEP_TRADE_FEATURES.map(f => f.internal));
                                                        }
                                                    }}
                                                    disabled={isTraining}
                                                    className="text-xs font-bold bg-rose-500/10 text-rose-400 px-3 py-1 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all"
                                                >
                                                    {selectedHybridDeepTradeFeatures.length === ALL_HYBRID_DEEP_TRADE_FEATURES.length ? 'Deselect All' : 'Select All'}
                                                </button>
                                                <div className="text-xs font-bold bg-rose-500/10 text-rose-400 px-3 py-1 rounded-full border border-rose-500/20">
                                                    {selectedHybridDeepTradeFeatures.length} / {ALL_HYBRID_DEEP_TRADE_FEATURES.length}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                                            {ALL_HYBRID_DEEP_TRADE_FEATURES.map((feat) => {
                                                const isSel = selectedHybridDeepTradeFeatures.includes(feat.internal);
                                                return (
                                                    <button key={feat.internal}
                                                        onClick={() => handleToggleHybridDeepTradeFeature(feat.internal)}
                                                        disabled={isTraining}
                                                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${isSel ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[#0A0A0A] border-white/5 hover:border-rose-500/20 hover:bg-white/5'}`}
                                                    >
                                                        <div className={`w-4 h-4 mt-0.5 rounded-md border flex-shrink-0 flex items-center justify-center relative ${isSel ? (isRetrainMode && initialLoadedTradeFeatures.includes(feat.internal) ? 'bg-purple-500 border-purple-400' : 'bg-rose-500 border-rose-500') : 'border-slate-600'}`}>
                                                            {isSel && <Check className="w-3 h-3 stroke-[3] text-white" />}
                                                            {isRetrainMode && initialLoadedTradeFeatures.includes(feat.internal) && isSel && (
                                                                <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-purple-300 rounded-full animate-ping"></div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className={`text-xs font-bold block ${isSel ? 'text-rose-300' : 'text-slate-300'}`}>{feat.name}</span>
                                                            <span className="text-[10px] text-slate-500 mt-0.5 block">{feat.desc}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* L2 Feature Selector (reused for hybrid_deep) */}
                                    <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-2xl shadow-inner">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h4 className="text-sm font-black text-indigo-400 flex items-center gap-2">
                                                    <Activity className="w-4 h-4" /> L2 Orderbook Features
                                                </h4>
                                                <p className="text-xs text-slate-400 mt-0.5">Forward-filled from nearest L2 snapshot onto each tick.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        if (selectedL2Features.length === ALL_L2_FEATURES.length) {
                                                            setSelectedL2Features([]);
                                                        } else {
                                                            setSelectedL2Features(ALL_L2_FEATURES.map(f => f.internal));
                                                        }
                                                    }}
                                                    disabled={isTraining}
                                                    className="text-xs font-bold bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                                                >
                                                    {selectedL2Features.length === ALL_L2_FEATURES.length ? 'Deselect All' : 'Select All'}
                                                </button>
                                                <span className="text-xs font-bold bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded-full border border-indigo-500/20">
                                                    {selectedL2Features.length} / {ALL_L2_FEATURES.length}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                                            {ALL_L2_FEATURES.map((feat) => {
                                                const isSel = selectedL2Features.includes(feat.internal);
                                                return (
                                                    <div key={feat.internal}
                                                        onClick={() => !isTraining && handleToggleL2Feature(feat.internal)}
                                                        className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${isSel ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200' : 'bg-black/30 border-white/5 text-slate-400 hover:bg-white/5'}`}
                                                    >
                                                        <div className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center relative ${isSel ? (isRetrainMode && initialLoadedL2Features.includes(feat.internal) ? 'bg-purple-500 border-purple-400' : 'bg-indigo-500 border-indigo-400') : 'border-white/20'}`}>
                                                            {isSel && <Check className="w-2.5 h-2.5 text-white" />}
                                                            {isRetrainMode && initialLoadedL2Features.includes(feat.internal) && isSel && (
                                                                <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-purple-300 rounded-full animate-ping"></div>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] font-medium leading-tight truncate" title={feat.name}>{feat.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Predatory Liquidity Pipeline (PLP) */}
                                    <PredatoryLiquidityPipeline 
                                        selectedFeatures={selectedPlpFeatures}
                                        onToggleFeature={(id) => setSelectedPlpFeatures(prev => 
                                            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
                                        )}
                                        onSetMultipleFeatures={(ids) => setSelectedPlpFeatures(ids)}
                                        isTraining={isTraining}
                                        isRetrainMode={isRetrainMode}
                                        initialLoadedFeatures={initialLoadedPlpFeatures}
                                    />
                                </motion.div>
                            )}

                            {(dataSource === 'l2_orderbook' || dataSource === 'hybrid') && (

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-xl border border-purple-500/20 shadow-inner">
                                        <div>
                                            <h4 className="text-sm font-bold text-purple-400">Deep Training (Live Scraping)</h4>
                                            <p className="text-xs text-slate-400 mt-0.5 font-medium">Scrape live L2 data instead of historical.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={isDeepTraining}
                                                onChange={() => setIsDeepTraining(!isDeepTraining)}
                                                disabled={isTraining}
                                            />
                                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500"></div>
                                        </label>
                                    </div>

                                    {isDeepTraining ? (
                                        <div className="p-4 bg-white/5 border border-purple-500/20 rounded-xl space-y-4">
                                            {/* Header row */}
                                            <div className="flex justify-between items-center">
                                                <label className="block text-sm font-medium text-slate-300">Target L2 Snapshots (100ms each)</label>
                                                <span className="text-sm font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20 font-mono">
                                                    {targetRowOptions[targetRowsIndex].toLocaleString()} Snaps
                                                </span>
                                            </div>

                                            {/* Range Slider */}
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={targetRowOptions.length - 1} 
                                                step={1}
                                                value={targetRowsIndex}
                                                onChange={(e) => handleSliderChange(parseInt(e.target.value))}
                                                disabled={isTraining}
                                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                            <div className="flex justify-between text-[10px] text-slate-500 font-medium -mt-1">
                                                <span>1K</span><span>50K</span><span>500K</span><span>5M</span><span>50M</span><span>100M</span>
                                            </div>

                                            {/* Manual Input Row */}
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={100000000}
                                                        step={1000}
                                                        value={manualTargetRows}
                                                        onChange={(e) => handleManualRowInput(e.target.value)}
                                                        onFocus={() => setIsManualInputMode(true)}
                                                        onBlur={() => {
                                                            setIsManualInputMode(false);
                                                            // On blur clamp & sync slider
                                                            const num = parseInt(manualTargetRows.replace(/,/g, ''), 10);
                                                            if (!isNaN(num) && num > 0) {
                                                                const clamped = Math.max(1, Math.min(100_000_000, num));
                                                                const idx = snapToNearestPreset(clamped);
                                                                setTargetRowsIndex(idx);
                                                                setManualTargetRows(String(clamped));
                                                            } else {
                                                                setManualTargetRows(String(targetRowOptions[targetRowsIndex]));
                                                            }
                                                        }}
                                                        disabled={isTraining}
                                                        placeholder="Enter exact rows..."
                                                        className="w-full bg-black/50 border border-purple-500/30 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50 placeholder-white/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-purple-400/60 uppercase tracking-wider pointer-events-none">rows</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const num = parseInt(manualTargetRows, 10);
                                                        if (!isNaN(num) && num > 0) {
                                                            const clamped = Math.max(1, Math.min(100_000_000, num));
                                                            const idx = snapToNearestPreset(clamped);
                                                            setTargetRowsIndex(idx);
                                                            setManualTargetRows(String(clamped));
                                                        }
                                                    }}
                                                    disabled={isTraining}
                                                    title="Apply manual value"
                                                    className="flex-shrink-0 p-2.5 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400 hover:bg-purple-600/40 hover:text-purple-200 transition-all disabled:opacity-40"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                </button>
                                            </div>

                                            {/* Quick Preset Chips */}
                                            <div className="grid grid-cols-6 gap-1.5">
                                                {[
                                                    { label: '1K',   val: 1_000 },
                                                    { label: '10K',  val: 10_000 },
                                                    { label: '100K', val: 100_000 },
                                                    { label: '1M',   val: 1_000_000 },
                                                    { label: '10M',  val: 10_000_000 },
                                                    { label: '100M', val: 100_000_000 },
                                                ].map(({ label, val }) => {
                                                    const isActive = targetRowOptions[targetRowsIndex] === val;
                                                    return (
                                                        <button
                                                            key={label}
                                                            disabled={isTraining}
                                                            onClick={() => {
                                                                const idx = targetRowOptions.indexOf(val);
                                                                setTargetRowsIndex(idx);
                                                                setManualTargetRows(String(val));
                                                            }}
                                                            className={`py-1 text-[10px] font-black rounded-lg border transition-all ${
                                                                isActive
                                                                    ? 'bg-purple-600/30 border-purple-400/60 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                                                                    : 'bg-black/30 border-white/10 text-slate-400 hover:border-purple-500/40 hover:text-purple-300 hover:bg-purple-500/10'
                                                            }`}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                                💡 Use the slider for quick selection or type an exact number in the input. Quick chips jump to common milestones.
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Training Data Lookback (Hours)</label>
                                            <select 
                                                value={dataLookback}
                                                onChange={(e) => setDataLookback(Number(e.target.value))}
                                                disabled={isTraining}
                                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50"
                                            >
                                                <option className="bg-gray-900 text-white" value={0.08333}>Last 5 Minutes</option>
                                                <option className="bg-gray-900 text-white" value={0.25}>Last 15 Minutes</option>
                                                <option className="bg-gray-900 text-white" value={0.5}>Last 30 Minutes</option>
                                                <option className="bg-gray-900 text-white" value={1}>Last 1 Hour</option>
                                                <option className="bg-gray-900 text-white" value={4}>Last 4 Hours</option>
                                                <option className="bg-gray-900 text-white" value={6}>Last 6 Hours</option>
                                                <option className="bg-gray-900 text-white" value={12}>Last 12 Hours</option>
                                                <option className="bg-gray-900 text-white" value={24}>Last 24 Hours</option>
                                            </select>
                                            <p className="text-xs text-slate-500 mt-1.5 ml-1 font-medium">Amount of historical tick data to use.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {(dataSource === 'l2_orderbook' || dataSource === 'hybrid') && (
                                <div className="flex items-center justify-between p-4 bg-purple-500/5 rounded-xl border border-purple-500/20 shadow-inner">
                                    <div>
                                        <h4 className="text-sm font-bold text-purple-400">Resample to Candle Interval</h4>
                                        <p className="text-xs text-slate-400 mt-0.5 font-medium">Group High-Frequency tick data into {timeframe} candles.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={isResampleL2}
                                            onChange={() => setIsResampleL2(!isResampleL2)}
                                            disabled={isTraining}
                                        />
                                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                    </label>
                                </div>
                            )}

                            {(dataSource === 'l2_orderbook' || dataSource === 'hybrid') && (
                                <div className="mt-4 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-2xl shadow-inner relative overflow-hidden">
                                    {/* Background glow */}
                                    <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] bg-indigo-500/10 blur-[50px] rounded-full pointer-events-none"></div>
                                    
                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                        <div>
                                            <h4 className="text-sm font-black text-indigo-400 flex items-center gap-2">
                                                <Activity className="w-4 h-4" /> AUTO-FEATURE SELECTION
                                            </h4>
                                            <p className="text-xs text-slate-400 mt-1 font-medium">Analyze live L2 metrics using <span className="text-indigo-300 font-bold">Random Forest</span> & <span className="text-indigo-300 font-bold">Mutual Information</span> to find the most predictive non-correlated features.</p>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={handleSuggestFeatures}
                                        disabled={isTraining || isSuggesting}
                                        className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md relative z-10 ${isSuggesting ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-[0_0_15px_rgba(79,70,229,0.4)] border border-indigo-400/50 hover:scale-[1.02]'}`}
                                    >
                                        {isSuggesting ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> SCANNING 50+ METRICS...</>
                                        ) : (
                                            <><BrainCircuit className="w-4 h-4" /> SUGGEST OPTIMAL METRICS</>
                                        )}
                                    </button>

                                    <AnimatePresence>
                                        {suggestedFeatures.length > 0 && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }} 
                                                animate={{ opacity: 1, height: 'auto' }} 
                                                className="mt-4 space-y-2 relative z-10"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-semibold text-emerald-400">Top Recommended Features:</p>
                                                    {analysisStats && (
                                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                                            Analyzed {analysisStats.rows} rows × {analysisStats.features} features
                                                        </span>
                                                    )}
                                                </div>
                                                {suggestedFeatures.map((feat, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => !isTraining && handleToggleL2Feature(feat.internal)}
                                                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${selectedL2Features.includes(feat.internal) ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]' : 'bg-black/40 border-white/10 hover:border-white/20'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors relative ${selectedL2Features.includes(feat.internal) ? (isRetrainMode && initialLoadedL2Features.includes(feat.internal) ? 'bg-purple-500 border-purple-400' : 'bg-emerald-500 border-emerald-400') : 'border-white/30'}`}>
                                                                {selectedL2Features.includes(feat.internal) && <CheckCircle2 className="w-3 h-3 text-black" />}
                                                                {isRetrainMode && initialLoadedL2Features.includes(feat.internal) && selectedL2Features.includes(feat.internal) && (
                                                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-300 rounded-full animate-ping"></div>
                                                                )}
                                                            </div>
                                                            <span className={`text-xs font-bold ${selectedL2Features.includes(feat.internal) ? (isRetrainMode && initialLoadedL2Features.includes(feat.internal) ? 'text-purple-300' : 'text-emerald-100') : 'text-slate-300'}`}>
                                                                {feat.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                                                                Score: {feat.score}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                <p className="text-[10px] text-slate-500 mt-2 text-center">Click a feature to include/exclude it from training.</p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Manual Selection Toggle */}
                                    <div className="mt-4 border-t border-indigo-500/20 pt-4">
                                        <button 
                                            onClick={() => setShowManualFeatures(!showManualFeatures)}
                                            className="w-full flex items-center justify-between text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                                        >
                                            <span>Or Select Manually ({selectedL2Features.length}/{ALL_L2_FEATURES.length} Selected)</span>
                                            <span className="text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                                {showManualFeatures ? 'Hide' : 'Show All'}
                                            </span>
                                        </button>
                                        
                                        <AnimatePresence>
                                            {showManualFeatures && (
                                                <motion.div 
                                                    initial={{ opacity: 0, height: 0 }} 
                                                    animate={{ opacity: 1, height: 'auto' }} 
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-3 overflow-hidden"
                                                >
                                                    <div className="flex justify-end mb-2">
                                                        <button
                                                            onClick={() => {
                                                                if (selectedL2Features.length === ALL_L2_FEATURES.length) {
                                                                    setSelectedL2Features([]);
                                                                } else {
                                                                    setSelectedL2Features(ALL_L2_FEATURES.map(f => f.internal));
                                                                }
                                                            }}
                                                            disabled={isTraining}
                                                            className="text-[10px] font-bold bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                                                        >
                                                            {selectedL2Features.length === ALL_L2_FEATURES.length ? 'Deselect All' : 'Select All'}
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                    {ALL_L2_FEATURES.map((feat, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            onClick={() => !isTraining && handleToggleL2Feature(feat.internal)}
                                                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${selectedL2Features.includes(feat.internal) ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200' : 'bg-black/30 border-white/5 text-slate-400 hover:bg-white/5'}`}
                                                        >
                                                            <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors flex-shrink-0 relative ${selectedL2Features.includes(feat.internal) ? (isRetrainMode && initialLoadedL2Features.includes(feat.internal) ? 'bg-purple-500 border-purple-400' : 'bg-indigo-500 border-indigo-400') : 'border-white/20'}`}>
                                                                {selectedL2Features.includes(feat.internal) && <CheckCircle2 className="w-2.5 h-2.5 text-black" />}
                                                                {isRetrainMode && initialLoadedL2Features.includes(feat.internal) && selectedL2Features.includes(feat.internal) && (
                                                                    <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-purple-300 rounded-full animate-ping"></div>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] font-medium leading-tight truncate" title={feat.name}>
                                                                {feat.name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            )}

                            {/* ── Predatory Liquidity Pipeline: L2 Orderbook & Hybrid (OHLCV+L2) ── */}
                            {(dataSource === 'l2_orderbook' || dataSource === 'hybrid') && (
                                <motion.div
                                    key="plp-l2-hybrid"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-5"
                                >
                                    <div className="mb-3 p-3 bg-gradient-to-r from-purple-900/30 to-indigo-900/20 rounded-xl border border-purple-500/30 flex items-start gap-3">
                                        <div className="flex gap-1.5 mt-0.5 flex-shrink-0">
                                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                                            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse [animation-delay:0.4s]" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-purple-300">
                                                {dataSource === 'hybrid' ? '✅ Hybrid Mode: Full PLP Quality' : '✅ L2 Mode: OBI/Spread-Powered PLP'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                                                {dataSource === 'hybrid'
                                                    ? 'All 50 PLP features fully powered — OHLCV provides Close/Volume, L2 provides OBI/Spread.'
                                                    : 'Stop-Hunt, Sweep, SMC & Spread-based features at full quality. Volume proxies used where trade ticks are absent.'}
                                            </p>
                                        </div>
                                    </div>
                                    <PredatoryLiquidityPipeline
                                        selectedFeatures={selectedPlpFeatures}
                                        onToggleFeature={(id) => setSelectedPlpFeatures(prev =>
                                            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
                                        )}
                                        onSetMultipleFeatures={(ids) => setSelectedPlpFeatures(ids)}
                                        isTraining={isTraining}
                                        isRetrainMode={isRetrainMode}
                                        initialLoadedFeatures={initialLoadedPlpFeatures}
                                    />
                                </motion.div>
                            )}
                        </div>

                        {(dataSource === 'ohlcv' || dataSource === 'hybrid') && (
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Historical Period (Date Range)</label>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <input 
                                                type="date" 
                                                value={ohlcvStartDate}
                                                onChange={(e) => setOhlcvStartDate(e.target.value)}
                                                disabled={isTraining}
                                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 outline-none transition-all disabled:opacity-50 [color-scheme:dark]"
                                            />
                                            <div className="text-[10px] text-slate-500 mt-1 ml-1 uppercase font-bold">Start Date</div>
                                        </div>
                                        <div className="text-slate-500 font-bold">-</div>
                                        <div className="flex-1">
                                            <input 
                                                type="date" 
                                                value={ohlcvEndDate}
                                                onChange={(e) => setOhlcvEndDate(e.target.value)}
                                                disabled={isTraining}
                                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 outline-none transition-all disabled:opacity-50 [color-scheme:dark]"
                                            />
                                            <div className="text-[10px] text-slate-500 mt-1 ml-1 uppercase font-bold">End Date</div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 ml-1 font-medium">Data will be fetched from the exchange via CCXT with pagination.</p>
                                </div>
                        )}

                        {(dataSource === 'ohlcv' || dataSource === 'hybrid' || dataSource === 'historical_trades') && (
                            <div className="mt-4 bg-black/40 border border-white/10 rounded-2xl p-5 shadow-inner">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-3">
                                        <Activity className="w-4 h-4 text-cyan-400" /> Feature Engineering Studio
                                    </label>
                                    <span className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const allInds = INDICATOR_CATEGORIES.flatMap(c => c.indicators);
                                                if (selectedIndicators.length === allInds.length) {
                                                    setSelectedIndicators([]);
                                                } else {
                                                    setSelectedIndicators(allInds);
                                                }
                                            }}
                                            disabled={isTraining}
                                            className="text-xs font-bold bg-cyan-500/10 text-cyan-400 px-3 py-1 rounded-lg border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
                                        >
                                            {selectedIndicators.length === INDICATOR_CATEGORIES.flatMap(c => c.indicators).length ? 'Deselect All' : 'Select All'}
                                        </button>
                                        <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20">
                                            {selectedIndicators.length} Selected
                                        </span>
                                    </span>
                                </div>

                                {/* Preset Packs */}
                                <div className="mb-5 bg-white/5 p-3 rounded-xl border border-white/5">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preset Packs</p>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                        {PRESET_PACKS.map(pack => (
                                            <button
                                                key={pack.name}
                                                disabled={isTraining}
                                                onClick={() => applyPresetPack(pack.list)}
                                                className="py-2 px-2 rounded-lg text-xs font-semibold bg-black/50 border border-white/10 hover:bg-white/10 hover:border-cyan-500/30 text-slate-300 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                            >
                                                <span>{pack.icon}</span> <span className="truncate">{pack.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Categorized Indicators */}
                                <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                    {INDICATOR_CATEGORIES.map(category => (
                                        <div key={category.name} className="space-y-2">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                                                {category.name}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {category.indicators.map(ind => (
                                                    <button
                                                        key={ind}
                                                        disabled={isTraining}
                                                        onClick={() => handleToggleIndicator(ind)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-300 relative flex flex-col items-center justify-center gap-0.5 overflow-visible ${selectedIndicators.includes(ind) ? (isRetrainMode && initialLoadedIndicators.includes(ind) ? 'bg-purple-500/20 text-purple-300 border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.4)] scale-105' : 'bg-cyan-500/20 text-cyan-400 border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]') : 'bg-black/60 text-slate-400 border-white/10 hover:border-white/30 hover:text-white hover:bg-white/10'}`}
                                                    >
                                                        <span>{ind}</span>
                                                        {MULTI_PARAM_MAP[ind] && selectedIndicators.includes(ind) && (
                                                            <span className="text-[9px] font-normal text-cyan-200/80 leading-none">{MULTI_PARAM_MAP[ind]}</span>
                                                        )}
                                                        {isRetrainMode && initialLoadedIndicators.includes(ind) && selectedIndicators.includes(ind) && (
                                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full animate-ping"></div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Alternative Data (Google Trends, Fear & Greed, GitHub) */}
                        <AlternativeDataSettings 
                            isTraining={isTraining}
                            selectedAltFeatures={selectedAltFeatures}
                            setSelectedAltFeatures={setSelectedAltFeatures}
                        />

                        <AdvancedExecutionSettings 
                            isTraining={isTraining}
                            executionStrategy={executionStrategy}
                            setExecutionStrategy={setExecutionStrategy}
                            icebergSlices={icebergSlices}
                            setIcebergSlices={setIcebergSlices}
                            twapDuration={twapDuration}
                            setTwapDuration={setTwapDuration}
                        />

                        <div className="p-5 mt-4 bg-gradient-to-br from-purple-900/20 to-blue-900/10 rounded-2xl border border-white/10 shadow-inner">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        <BrainCircuit className="w-4 h-4 text-purple-400" /> Auto Retrain
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1 font-medium">Keep model updated with fresh data automatically</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={isAutoRetrain}
                                        onChange={() => setIsAutoRetrain(!isAutoRetrain)}
                                        disabled={isTraining}
                                    />
                                    <div className="w-12 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-cyan-500 peer-checked:to-blue-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                </label>
                            </div>
                            
                            {isAutoRetrain && (
                                <div className="mt-4 pt-4 border-t border-white/5">
                                    <label className="block text-xs font-semibold text-slate-300 mb-2">Retrain Interval (Hours)</label>
                                    <select 
                                        value={retrainInterval}
                                        onChange={(e) => setRetrainInterval(Number(e.target.value))}
                                        disabled={isTraining}
                                        className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 outline-none transition-all shadow-inner"
                                    >
                                        <option className="bg-gray-900 text-white" value={1}>Every 1 Hour</option>
                                        <option className="bg-gray-900 text-white" value={6}>Every 6 Hours</option>
                                        <option className="bg-gray-900 text-white" value={12}>Every 12 Hours</option>
                                        <option className="bg-gray-900 text-white" value={24}>Every 24 Hours</option>
                                    </select>
                                </div>
                            )}
                        </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 mt-2 relative z-10 flex flex-col gap-3 border-t border-white/10">
                        {!isTraining ? (
                            <button 
                                onClick={handleStartTraining}
                                disabled={!symbol}
                                className={`w-full py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-3 transition-all duration-300 shadow-xl ${isRetrainMode ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white hover:shadow-[0_0_30px_rgba(236,72,153,0.5)] border border-white/20 hover:scale-[1.02]' : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 text-white hover:shadow-[0_0_30px_rgba(56,189,248,0.5)] border border-white/20 hover:scale-[1.02]'}`}
                            >
                                <Play className="w-5 h-5 fill-current" /> {isRetrainMode ? "START INCREMENTAL FINE-TUNING" : "START DEEP TRAINING"}
                            </button>
                        ) : (
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setShowTerminal(true)}
                                    className="flex-1 py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-3 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-all duration-300 shadow-xl"
                                >
                                    <Activity className="w-5 h-5" /> SHOW LIVE TERMINAL
                                </button>
                                <button 
                                    onClick={handleCancelTraining}
                                    className="flex-1 py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all"
                                >
                                    <XCircle className="w-5 h-5" /> STOP TRAINING
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Execution Terminal Modal */}
                <AnimatePresence>
                    {showTerminal && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
                        >
                            <div className="w-full max-w-6xl h-[85vh] relative flex flex-col min-h-0">
                                <button 
                                    onClick={() => setShowTerminal(false)}
                                    className="absolute -top-12 right-0 p-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    <XCircle className="w-8 h-8" />
                                </button>

                                {/* TV Chart Button placed over the terminal header */}
                                <div className="absolute -top-2 right-24 z-[60]">
                                    <FloatingTVChartButton symbol={symbol} exchange={exchange} />
                                </div>

                                <div className="flex flex-col bg-black/60 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl shadow-[0_0_50px_rgba(56,189,248,0.1)] overflow-hidden h-full relative z-10 w-full">
                                    {/* Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-cyan-900/40 to-blue-900/20 border-b border-cyan-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Terminal className="w-5 h-5 text-cyan-400" />
                                <span className="text-sm font-mono text-cyan-100 tracking-widest font-bold">LIVE_CONSOLE_OUTPUT</span>
                            </div>
                            <div className="flex gap-2">
                                <div className="w-3.5 h-3.5 rounded-full bg-red-500/50 border border-red-400 shadow-[0_0_10px_#ef4444]"></div>
                                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/50 border border-yellow-400 shadow-[0_0_10px_#eab308]"></div>
                                <div className="w-3.5 h-3.5 rounded-full bg-green-500/50 border border-green-400 shadow-[0_0_10px_#22c55e]"></div>
                            </div>
                        </div>

                    {/* Progress Bar */}
                    {currentJob && (
                        <div className="h-1.5 bg-gray-900 w-full relative overflow-hidden shadow-inner">
                            <motion.div 
                                className={`absolute top-0 left-0 h-full ${currentJob.status === 'FAILED' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : currentJob.status === 'COMPLETED' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-gradient-to-r from-cyan-400 to-purple-500 shadow-[0_0_15px_#22d3ee]'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${currentJob.progress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    )}

                    {/* Terminal Logs Area */}
                    <div className="flex-1 p-5 overflow-y-auto custom-scrollbar font-mono text-sm leading-relaxed">
                        {!currentJob ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                                <Database className="w-12 h-12 opacity-20" />
                                <p>Awaiting training instructions...</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5 pb-8">
                                <AnimatePresence>
                                    {currentJob.logs.map((log, idx) => {
                                        // Ignore raw timestamps for JSON extraction
                                        const cleanLog = log.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
                                        
                                        if (cleanLog.startsWith('[METRICS]')) {
                                            try {
                                                const metrics = JSON.parse(cleanLog.replace('[METRICS]', '').trim());
                                                return (
                                                    <motion.div key={idx} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 mb-4 p-4 bg-gradient-to-br from-emerald-900/40 to-cyan-900/20 border border-emerald-500/30 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                                                        <h4 className="text-emerald-400 font-bold text-xs mb-2 tracking-widest flex items-center gap-2">
                                                            <Activity className="w-4 h-4" /> PERFORMANCE METRICS
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {Object.entries(metrics).map(([k, v]) => (
                                                                <div key={k} className="bg-black/40 rounded-lg p-3 border border-emerald-500/10">
                                                                    <div className="text-emerald-100/50 text-[10px] uppercase font-bold tracking-wider">{k}</div>
                                                                    <div className="text-emerald-400 text-lg font-black mt-1 drop-shadow-[0_0_5px_#10b981]">{Number(v).toFixed(4)}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                );
                                            } catch (e) { return null; }
                                        }

                                        if (cleanLog.startsWith('[EQUITY_CURVE]')) {
                                            try {
                                                const equityData = JSON.parse(cleanLog.replace('[EQUITY_CURVE]', '').trim());
                                                return <EquityCurveChart key={idx} data={equityData} />;
                                            } catch (e) { return null; }
                                        }

                                        if (cleanLog.startsWith('[FEATURE_IMPORTANCE]')) {
                                            try {
                                                const featureData = JSON.parse(cleanLog.replace('[FEATURE_IMPORTANCE]', '').trim());
                                                return <FeatureImportanceChart key={idx} data={featureData} />;
                                            } catch (e) { return null; }
                                        }

                                        if (cleanLog.startsWith('[CORRELATION]')) {
                                            try {
                                                const corrData = JSON.parse(cleanLog.replace('[CORRELATION]', '').trim());
                                                const models = Object.keys(corrData);
                                                return (
                                                    <motion.div key={idx} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 mb-4 p-4 bg-gradient-to-br from-indigo-900/40 to-purple-900/20 border border-indigo-500/30 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                                                        <h4 className="text-indigo-400 font-bold text-xs mb-3 tracking-widest flex items-center gap-2">
                                                            <Activity className="w-4 h-4" /> MODEL PREDICTION CORRELATION
                                                        </h4>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-[10px] text-slate-300">
                                                                <thead className="bg-black/40 border-b border-indigo-500/20">
                                                                    <tr>
                                                                        <th className="p-2 font-bold text-indigo-300">Model</th>
                                                                        {models.map(m => <th key={m} className="p-2 font-bold text-indigo-300 text-center">{m}</th>)}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {models.map(rowModel => (
                                                                        <tr key={rowModel} className="border-b border-indigo-500/10 last:border-0 hover:bg-white/5">
                                                                            <td className="p-2 font-bold text-slate-200">{rowModel}</td>
                                                                            {models.map(colModel => {
                                                                                const val = corrData[rowModel][colModel];
                                                                                const isHigh = val > 0.85;
                                                                                const isLow = val < 0.4;
                                                                                return (
                                                                                    <td key={colModel} className={`p-2 text-center font-mono font-bold ${isHigh && rowModel !== colModel ? 'text-red-400' : isLow ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                                                        {val.toFixed(2)}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                        <p className="text-[9px] text-slate-500 mt-2">Red: High correlation (bad for ensemble). Green: Low correlation (good).</p>
                                                    </motion.div>
                                                );
                                            } catch (e) { return null; }
                                        }

                                        let textColor = "text-gray-300";
                                        
                                        if (log.includes("ERROR")) textColor = "text-red-400 drop-shadow-[0_0_5px_#ef4444]";
                                        else if (log.includes("complete") || log.includes("successfully")) textColor = "text-emerald-400 drop-shadow-[0_0_5px_#10b981]";
                                        else if (log.includes("Epoch") || log.includes("Loss")) textColor = "text-cyan-400 drop-shadow-[0_0_5px_#22d3ee]";
                                        else if (log.includes("Fetching") || log.includes("Calculating")) textColor = "text-yellow-400";
                                        else if (log.includes("[Trade Scraper]") || log.includes("[Scraper]")) textColor = "text-amber-400 drop-shadow-[0_0_5px_#f59e0b]";
                                        else if (log.includes("🛑") || log.includes("cancelled") || log.includes("stopped")) textColor = "text-orange-400";

                                        return (
                                            <motion.div 
                                                key={idx}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`break-words ${textColor}`}
                                            >
                                                <span className="text-cyan-800 mr-3 opacity-50 select-none">root@core:~#</span>
                                                {log}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                
                                {isTraining && (
                                    <div className="flex items-center gap-2 text-cyan-400 mt-4 animate-pulse">
                                        <span className="text-cyan-800">root@core:~#</span>
                                        <span className="w-2.5 h-5 bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                                    </div>
                                )}
                                <div ref={logsEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Footer Status */}
                    {currentJob && (() => {
                        const isCancelled = currentJob.status === 'FAILED' && 
                            currentJob.error_message && 
                            currentJob.error_message.toLowerCase().includes('cancelled');
                        
                        const statusLabel = isCancelled ? 'STOPPED BY USER' : currentJob.status;
                        const statusColor = currentJob.status === 'COMPLETED' 
                            ? 'bg-emerald-500/20 text-emerald-400 border-t border-emerald-500/30'
                            : isCancelled 
                                ? 'bg-orange-500/20 text-orange-400 border-t border-orange-500/30'
                                : currentJob.status === 'FAILED'
                                    ? 'bg-red-500/20 text-red-400 border-t border-red-500/30'
                                    : 'bg-cyan-500/10 text-cyan-400 border-t border-cyan-500/20';
                        
                        const StatusIcon = currentJob.status === 'COMPLETED' ? CheckCircle2
                            : isCancelled ? XCircle
                            : currentJob.status === 'FAILED' ? XCircle
                            : Loader2;
                        
                        return (
                            <div className={`px-6 py-3 text-xs font-mono font-bold flex items-center justify-between ${statusColor}`}>
                                <div className="flex items-center gap-2 tracking-widest">
                                    <StatusIcon className={`w-4 h-4 ${currentJob.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                                    SYSTEM_STATUS: {statusLabel}
                                </div>
                                <div>
                                    {currentJob.progress.toFixed(0)}%
                                </div>
                            </div>
                        );
                    })()}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Visualizer Floating Modal */}
            {algorithm.includes('-RL') ? (
                <RLTrainingVisualizer
                    isOpen={showVisualizer}
                    onClose={() => setShowVisualizer(false)}
                    jobId={currentJob?.id || ''}
                    algorithm={algorithm}
                    symbol={symbol}
                />
            ) : (
                <DatasetVisualizerModal 
                    isOpen={showVisualizer} 
                    onClose={() => setShowVisualizer(false)} 
                    symbol={symbol} 
                />
            )}
        </div>
    );
};

export default ModelTrainingStudio;
