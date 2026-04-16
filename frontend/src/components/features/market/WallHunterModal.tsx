import { useEffect, useState, FC } from 'react';
import { fetchApiKeys } from '../../../services/settings';
import { botService } from '../../../services/botService';
import { marketDataService } from '../../../services/marketData';
import { marketDepthService } from '../../../services/marketDepthService';
import { portfolioService } from '../../../services/portfolioService';
import { calculateATR } from '../../../utils/indicators';
import { HeatmapSymbolSelector } from './HeatmapSymbolSelector';

export const WallHunterModal: FC<{ isOpen: boolean; onClose: () => void; symbol: string; bids?: any[]; asks?: any[]; onDeploySuccess?: (botId: number) => void }> = ({ isOpen, onClose, symbol, bids = [], asks = [], onDeploySuccess }) => {
    const [savedKeys, setSavedKeys] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [activeTab, setActiveTab] = useState('basic');
    const [useNativeTokenFee, setUseNativeTokenFee] = useState(false);
    const [liveFeeRate, setLiveFeeRate] = useState<number | null>(null);
    
    // --- NEW: Trading Mode State ---
    const [tradingMode, setTradingMode] = useState<'spot' | 'futures'>('spot');
    const [strategyMode, setStrategyMode] = useState<'long' | 'short'>('long');
    const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);
    const [showAdvancedTSL, setShowAdvancedTSL] = useState(false);

    const [form, setForm] = useState({
        botName: '',
        symbol: symbol,
        exchange: 'binance',
        isPaper: true,
        apiKeyId: '',
        vol: 500000,
        spread: 0.0002,
        enableRiskSl: true,
        risk: 0.5,
        enableTsl: true,
        tsl: 0.03,
        tslActivationPct: 0.13,
        amount: 100,
        sellOrderType: 'market',
        spoofTime: 3.0,
        enablePartialTp: true,
        partialTp: 20.0,
        partialTpTriggerPct: 0.26,
        enableBreakevenSl: true,
        breakevenTriggerPct: 0.1,
        breakevenTargetPct: 0.02,
        vpvrEnabled: false,
        vpvrTolerance: 0.2,
        atrEnabled: false,
        atrPeriod: 14,
        atrMultiplier: 2.0,
        
        // --- NEW: Custom Buy Order Type & Buffer ---
        buyOrderType: 'market',
        limitBuffer: 0.05,
        
        // --- NEW: Risk SL Order Type ---
        slOrderType: 'market',

        enableWallTrigger: true,        
        maxWallDistancePct: 1.0,        
        enableLiqTrigger: false,        
        liqThreshold: 50000,
        liqTargetSide: 'auto',            
        enableMicroScalp: false,        
        microScalpProfitTicks: 2,       
        microScalpMinWall: 100000,      
        
        tradingSession: 'None',

        enableLiqCascade: false,        
        liqCascadeWindow: 5,            
        enableDynamicLiq: false,        
        dynamicLiqMultiplier: 1.0,      
        enableObImbalance: false,       
        obImbalanceRatio: 1.5,          

        // --- NEW: WallHunter Smart L2 Filters ---
        enableOibFilter: false,
        minOibThreshold: 0.65,
        enableDynamicAtrScalp: false,
        microScalpAtrMultiplier: 0.5,

        followBtcLiq: false,
        btcLiqThreshold: 500000,

        // --- NEW: Futures Specific States ---
        marginMode: 'cross',
        leverage: 10,
        positionDirection: 'auto',
        reduceOnly: true,
        liquidationSafetyPct: 5.0,

        // --- NEW: CVD Absorption Confirmation ---
        enableAbsorption: false,
        absorptionThreshold: 50000,
        absorptionWindow: 10,

        // --- NEW: Iceberg & Hidden Wall Trigger ---
        enableIcebergTrigger: false,
        icebergTimeWindowSecs: 10,
        icebergMinAbsorbedVol: 100000,

        // --- NEW: BTC Correlation Filter ---
        enableBtcCorrelation: false,
        btcCorrelationThreshold: 0.5,
        btcTimeWindow: 15,
        btcMinMovePct: 0.025,

        // --- NEW: Adaptive Trend Filter ---
        enableTrendFilter: false,
        trendFilterLookback: 200,
        trendFilterThreshold: 'Strong',

        // --- NEW: Dual Engine Command Center ---
        enableDualEngine: false,
        dualEngineMode: 'Classic',
        dualEngineEmaFilter: false,
        dualEngineRsiFilter: false,
        dualEngineCandleFilter: false,
        dualEngineEmaLength: 100,
        dualEngineRsiLength: 14,
        dualEngineRsiOb: 70,
        dualEngineRsiOs: 30,
        dualEngineMacdFilter: false,
        dualEngineMacdFast: 12,
        dualEngineMacdSlow: 26,
        dualEngineMacdSignal: 9,
        dualEngineSqueezeFilter: false,
        dualEngineSqueezeLength: 20,
        dualEngineSqueezeBbMult: 2.0,
        dualEngineSqueezeKcMult: 1.5,

        // --- NEW: Modular UT Bot Alerts ---
        enableUtBot: false,
        enableUtTrendFilter: false,
        enableUtEntryTrigger: false,
        enableUtTrendUnlockMode: false,
        enableUtTrailingSl: false,
        utBotSensitivity: 1.0,
        utBotAtrPeriod: 10,
        utBotUseHeikinAshi: false,
        utBotTimeframe: '5m',
        
        utBotCandleClose: false,
        utBotValidationSecs: 0,
        utBotRetestSnipe: false,

        // --- NEW: Modular Supertrend ---
        enableSupertrendBot: false,
        enableSupertrendTrendFilter: false,
        enableSupertrendEntryTrigger: false,
        enableSupertrendTrendUnlockMode: false,
        enableSupertrendTrailingSl: false,
        enableSupertrendExit: false,
        supertrendExitTimeout: 5,
        supertrendPeriod: 10,
        supertrendMultiplier: 3.0,
        supertrendTimeframe: '5m',
        supertrendCandleClose: false,

        // --- NEW: Proxy Orderbook Routing ---
        enableProxyWall: false,
        proxyExchange: 'binance',
        proxySymbol: ''
    });

    const [existingBot, setExistingBot] = useState<any>(null);
    const [lastInitializedSymbol, setLastInitializedSymbol] = useState('');

    useEffect(() => {
        setForm(prev => ({ ...prev, symbol }));
    }, [symbol]);

    // Smart default calculation on first load
    useEffect(() => {
        if (isOpen && symbol !== lastInitializedSymbol && (bids.length > 0 || asks.length > 0) && !existingBot) {
            const initialPrice = bids.length > 0 ? Number(bids[0].price) : Number(asks[0].price);
            let dynamicStep = 0.01;
            let displayDigits = 2;
            if (initialPrice < 0.000000001) { dynamicStep = 0.00000000001; displayDigits = 11; }
            else if (initialPrice < 0.00000001) { dynamicStep = 0.0000000001; displayDigits = 10; }
            else if (initialPrice < 0.0000001) { dynamicStep = 0.000000001; displayDigits = 9; }
            else if (initialPrice < 0.000001) { dynamicStep = 0.00000001; displayDigits = 8; }
            else if (initialPrice < 0.00001) { dynamicStep = 0.0000001; displayDigits = 7; }
            else if (initialPrice < 0.0001) { dynamicStep = 0.000001; displayDigits = 6; }
            else if (initialPrice < 0.001) { dynamicStep = 0.00001; displayDigits = 5; }
            else if (initialPrice < 1) { dynamicStep = 0.0001; displayDigits = 4; }
            else if (initialPrice < 10) { dynamicStep = 0.001; displayDigits = 3; }
            else if (initialPrice < 100) { dynamicStep = 0.01; displayDigits = 2; }
            else if (initialPrice < 1000) { dynamicStep = 0.1; displayDigits = 1; }
            
            // Set default ~0.1% or minimum 2 steps
            const idealSpread = Math.max(dynamicStep * 2, initialPrice * 0.001);
            const defaultSpread = parseFloat(idealSpread.toFixed(displayDigits));

            setForm(prev => ({ ...prev, spread: defaultSpread }));
            setLastInitializedSymbol(symbol);
        }
    }, [isOpen, symbol, bids, asks, existingBot, lastInitializedSymbol]);

    useEffect(() => {
        if (form.exchange !== 'binance' && form.exchange !== 'mexc' && form.exchange !== 'kucoin') {
            setUseNativeTokenFee(false);
        }
    }, [form.exchange]);

    useEffect(() => {
        if (isOpen) {
            try {
                if (typeof fetchApiKeys === 'function') {
                    fetchApiKeys().then((keys: any) => setSavedKeys(keys || [])).catch(() => { });
                }

                botService.getAllBots().then((bots: any) => {
                    const activeWallHunter = bots.find((b: any) => b.market === symbol && b.strategy === 'wall_hunter' && b.status === 'active');
                    if (activeWallHunter) {
                        setExistingBot(activeWallHunter);
                        const c = activeWallHunter.config || {};
                        
                        // Detect mode from existing config
                        if (c.trading_mode === 'futures') {
                            setTradingMode('futures');
                        } else {
                            setTradingMode('spot');
                        }
                        if (c.strategy_mode === 'short') {
                            setStrategyMode('short');
                        } else {
                            setStrategyMode('long');
                        }

                        setForm(prev => ({
                            ...prev,
                            botName: activeWallHunter.name || '',
                            exchange: activeWallHunter.exchange,
                            isPaper: activeWallHunter.is_paper_trading,
                            apiKeyId: activeWallHunter.api_key_id || '',
                            vol: c.vol_threshold || 500000,
                            spread: c.target_spread || 0.0002,
                            enableRiskSl: c.risk_pct !== undefined ? c.risk_pct > 0 : true,
                            risk: c.risk_pct && c.risk_pct > 0 ? c.risk_pct : 0.5,
                            enableTsl: c.trailing_stop !== undefined ? c.trailing_stop > 0 : true,
                            tsl: c.trailing_stop !== undefined && c.trailing_stop > 0 ? c.trailing_stop : 0.03,
                            tslActivationPct: c.tsl_activation_pct !== undefined ? c.tsl_activation_pct : 0.13,
                            amount: c.amount_per_trade || 100,
                            sellOrderType: c.sell_order_type || 'market',
                            slOrderType: c.sl_order_type || 'market',
                            spoofTime: c.min_wall_lifetime !== undefined ? c.min_wall_lifetime : 3.0,
                            enablePartialTp: c.partial_tp_pct !== undefined ? c.partial_tp_pct > 0 : true,
                            partialTp: c.partial_tp_pct !== undefined && c.partial_tp_pct > 0 ? c.partial_tp_pct : 20.0,
                            partialTpTriggerPct: c.partial_tp_trigger_pct || 0.26,
                            enableBreakevenSl: c.sl_breakeven_trigger_pct !== undefined ? c.sl_breakeven_trigger_pct > 0 : false,
                            breakevenTriggerPct: c.sl_breakeven_trigger_pct !== undefined && c.sl_breakeven_trigger_pct > 0 ? c.sl_breakeven_trigger_pct : 0.1,
                            breakevenTargetPct: c.sl_breakeven_target_pct !== undefined ? c.sl_breakeven_target_pct : 0.02,
                            vpvrEnabled: c.vpvr_enabled !== undefined ? c.vpvr_enabled : false,
                            vpvrTolerance: c.vpvr_tolerance !== undefined ? c.vpvr_tolerance : 0.2,
                            atrEnabled: c.atr_sl_enabled !== undefined ? c.atr_sl_enabled : false,
                            atrPeriod: c.atr_period !== undefined ? c.atr_period : 14,
                            atrMultiplier: c.atr_multiplier !== undefined ? c.atr_multiplier : 2.0,

                            enableWallTrigger: c.enable_wall_trigger !== undefined ? c.enable_wall_trigger : true,
                            maxWallDistancePct: c.max_wall_distance_pct !== undefined ? c.max_wall_distance_pct : 1.0,
                            enableLiqTrigger: c.enable_liq_trigger !== undefined ? c.enable_liq_trigger : false,
                            liqThreshold: c.liq_threshold || 50000,
                            liqTargetSide: c.liq_target_side || 'auto',
                            enableMicroScalp: c.enable_micro_scalp !== undefined ? c.enable_micro_scalp : false,
                            microScalpProfitTicks: c.micro_scalp_profit_ticks || 2,
                            microScalpMinWall: c.micro_scalp_min_wall || 100000,
                            tradingSession: c.trading_session || 'None',

                            enableLiqCascade: c.enable_liq_cascade !== undefined ? c.enable_liq_cascade : false,
                            liqCascadeWindow: c.liq_cascade_window || 5,
                            enableDynamicLiq: c.enable_dynamic_liq !== undefined ? c.enable_dynamic_liq : false,
                            dynamicLiqMultiplier: c.dynamic_liq_multiplier || 1.0,
                            enableObImbalance: c.enable_ob_imbalance !== undefined ? c.enable_ob_imbalance : false,
                            obImbalanceRatio: c.ob_imbalance_ratio || 1.5,

                            // Load WallHunter Smart L2 logic
                            enableOibFilter: c.enable_oib_filter !== undefined ? c.enable_oib_filter : false,
                            minOibThreshold: c.min_oib_threshold || 0.65,
                            enableDynamicAtrScalp: c.enable_dynamic_atr_scalp !== undefined ? c.enable_dynamic_atr_scalp : false,
                            microScalpAtrMultiplier: c.micro_scalp_atr_multiplier || 0.5,

                            followBtcLiq: c.follow_btc_liq !== undefined ? c.follow_btc_liq : false,
                            btcLiqThreshold: c.btc_liq_threshold || 500000,

                            // Futures existing configs
                            marginMode: c.margin_mode || 'cross',
                            leverage: c.leverage || 10,
                            positionDirection: c.position_direction || 'auto',
                            reduceOnly: c.reduce_only !== undefined ? c.reduce_only : true,
                            liquidationSafetyPct: c.liquidation_safety_pct || 5.0,

                            enableAbsorption: c.enable_absorption !== undefined ? c.enable_absorption : false,
                            absorptionThreshold: c.absorption_threshold || 50000,
                            absorptionWindow: c.absorption_window || 10,

                            enableIcebergTrigger: c.enable_iceberg_trigger !== undefined ? c.enable_iceberg_trigger : false,
                            icebergTimeWindowSecs: c.iceberg_time_window_secs || 10,
                            icebergMinAbsorbedVol: c.iceberg_min_absorbed_vol || 100000,

                            enableBtcCorrelation: c.enable_btc_correlation !== undefined ? c.enable_btc_correlation : false,
                            btcCorrelationThreshold: c.btc_correlation_threshold || 0.7,
                            btcTimeWindow: c.btc_time_window || 15,
                            btcMinMovePct: c.btc_min_move_pct || 0.1,
                            
                            enableTrendFilter: c.enable_trend_filter !== undefined ? c.enable_trend_filter : false,
                            trendFilterLookback: c.trend_filter_lookback || 200,
                            trendFilterThreshold: c.trend_filter_threshold || 'Strong',
                            
                            enableUtBot: !!(c.enable_ut_trend_filter || c.enable_ut_entry_trigger || c.enable_ut_trailing_sl),
                            enableUtTrendFilter: c.enable_ut_trend_filter !== undefined ? c.enable_ut_trend_filter : false,
                            enableUtEntryTrigger: c.enable_ut_entry_trigger !== undefined ? c.enable_ut_entry_trigger : false,
                            enableUtTrendUnlockMode: c.enable_ut_trend_unlock_mode !== undefined ? c.enable_ut_trend_unlock_mode : false,
                            enableUtTrailingSl: c.enable_ut_trailing_sl !== undefined ? c.enable_ut_trailing_sl : false,
                            utBotSensitivity: c.ut_bot_sensitivity || 1.0,
                            utBotAtrPeriod: c.ut_bot_atr_period || 10,
                            utBotUseHeikinAshi: c.ut_bot_use_heikin_ashi !== undefined ? c.ut_bot_use_heikin_ashi : false,
                            utBotTimeframe: c.ut_bot_timeframe || '5m',
                            
                            utBotCandleClose: c.ut_bot_candle_close !== undefined ? c.ut_bot_candle_close : false,
                            utBotValidationSecs: c.ut_bot_validation_secs || 0,
                            utBotRetestSnipe: c.ut_bot_retest_snipe !== undefined ? c.ut_bot_retest_snipe : false,
                            
                            // Load Modular Supertrend settings
                            enableSupertrendBot: !!(c.enable_supertrend_trend_filter || c.enable_supertrend_entry_trigger || c.enable_supertrend_trailing_sl),
                            enableSupertrendTrendFilter: c.enable_supertrend_trend_filter !== undefined ? c.enable_supertrend_trend_filter : false,
                            enableSupertrendEntryTrigger: c.enable_supertrend_entry_trigger !== undefined ? c.enable_supertrend_entry_trigger : false,
                            enableSupertrendTrendUnlockMode: c.enable_supertrend_trend_unlock_mode !== undefined ? c.enable_supertrend_trend_unlock_mode : false,
                            enableSupertrendTrailingSl: c.enable_supertrend_trailing_sl !== undefined ? c.enable_supertrend_trailing_sl : false,
                            enableSupertrendExit: c.enable_supertrend_exit !== undefined ? c.enable_supertrend_exit : false,
                            supertrendExitTimeout: c.supertrend_exit_timeout || 5,
                            supertrendPeriod: c.supertrend_period || 10,
                            supertrendMultiplier: c.supertrend_multiplier || 3.0,
                            supertrendTimeframe: c.supertrend_timeframe || '5m',
                            supertrendCandleClose: c.supertrend_candle_close !== undefined ? c.supertrend_candle_close : false,
                            
                            // Load custom buy order settings
                            buyOrderType: c.buy_order_type || 'market',
                            limitBuffer: c.limit_buffer !== undefined ? c.limit_buffer : 0.05,

                            // Proxy Wall Support
                            enableProxyWall: c.enable_proxy_wall !== undefined ? c.enable_proxy_wall : false,
                            proxyExchange: c.proxy_exchange || 'binance',
                            proxySymbol: c.proxy_symbol || ''
                        }));
                    } else {
                        setExistingBot(null);
                    }
                }).catch(() => { });
            } catch (e) { }
        }
    }, [isOpen, symbol]);

    useEffect(() => {
        if (isOpen) {
            marketDataService.getAllExchanges()
                .then(exs => setAvailableExchanges(exs))
                .catch(err => console.error("Failed to load exchanges:", err));
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleAutoDetect = async () => {
        setIsLoading(true);
        setErrorMsg('Detecting optimal parameters...');
        
        try {
            // 1. Fetch Deep Order Book (limit=200)
            const detectSymbol = form.enableProxyWall && form.proxySymbol ? form.proxySymbol : form.symbol;
            const detectExchange = form.enableProxyWall && form.proxyExchange ? form.proxyExchange : form.exchange;
            const deepBook = await marketDepthService.getRawOrderBook(detectSymbol, detectExchange, 200);
            const deepBids = deepBook.bids || [];
            const deepAsks = deepBook.asks || [];

            // 2. Fetch OHLCV for ATR Calculation (1h timeframe, 30 candles)
            const ohlcv = await marketDepthService.getOHLCV(detectSymbol.toUpperCase(), detectExchange.toLowerCase(), '1h', 30);
            
            // 3. Fetch Real Trading Fee (if API Key attached)
            if (!form.isPaper && form.apiKeyId) {
                try {
                    const feeData = await portfolioService.fetchTradingFee(form.apiKeyId, form.symbol);
                    if (feeData) {
                        const rtFee = feeData.maker + feeData.taker;
                        setLiveFeeRate(rtFee);
                        console.log("Live account fees fetched:", feeData, "RT fee:", rtFee);
                    }
                } catch (e) {
                    console.error("Warning: Failed to fetch live fee", e);
                    setLiveFeeRate(null);
                }
            } else {
                setLiveFeeRate(null);
            }

            let optimalVol = form.vol;
            let optimalSpread = form.spread;
            let optimalAmount = form.amount;
            let optimalIcebergVol = form.icebergMinAbsorbedVol;

            if (deepBids.length > 0 && deepAsks.length > 0) {
                const bestBid = deepBids[0].price;
                const bestAsk = deepAsks[0].price;
                const currentMarketSpread = bestAsk - bestBid;
                const currentPrice = bestBid;
                
                // Determine dynamic precision based on price
                let dynamicStep = 0.01;
                let displayDigits = 2;
                if (currentPrice < 0.000000001) { dynamicStep = 0.00000000001; displayDigits = 11; }
                else if (currentPrice < 0.00000001) { dynamicStep = 0.0000000001; displayDigits = 10; }
                else if (currentPrice < 0.0000001) { dynamicStep = 0.000000001; displayDigits = 9; }
                else if (currentPrice < 0.000001) { dynamicStep = 0.00000001; displayDigits = 8; }
                else if (currentPrice < 0.00001) { dynamicStep = 0.0000001; displayDigits = 7; }
                else if (currentPrice < 0.0001) { dynamicStep = 0.000001; displayDigits = 6; }
                else if (currentPrice < 0.001) { dynamicStep = 0.00001; displayDigits = 5; }
                else if (currentPrice < 1) { dynamicStep = 0.0001; displayDigits = 4; }
                else if (currentPrice < 10) { dynamicStep = 0.001; displayDigits = 3; }
                else if (currentPrice < 100) { dynamicStep = 0.01; displayDigits = 2; }
                else if (currentPrice < 1000) { dynamicStep = 0.1; displayDigits = 1; }
                else { dynamicStep = 1; displayDigits = 0; }

                // --- SMART SPREAD (ATR BASED) ---
                if (ohlcv && ohlcv.length > 15) {
                    const atrData = calculateATR(ohlcv, 14);
                    if (atrData.length > 0) {
                        const currentATR = atrData[atrData.length - 1].value;
                        // Use 25% of ATR as a starting point for scalping spread
                        const atrSpread = currentATR * 0.25;
                        // Ensure spread is at least slightly wider than the current market spread
                        optimalSpread = Math.max(currentMarketSpread * 1.5, atrSpread);
                    } else {
                        optimalSpread = currentMarketSpread + (bestAsk * 0.001);
                    }
                } else {
                    optimalSpread = currentMarketSpread + (bestAsk * 0.001);
                }
                
                // Final formatting for spread
                optimalSpread = parseFloat(Math.max(dynamicStep, Math.min(dynamicStep * 500, optimalSpread)).toFixed(displayDigits));

                // --- SMART VOLUME (DEEP BOOK ANALYSIS) ---
                const allSizes = [...deepBids.map((b: any) => b.size), ...deepAsks.map((a: any) => a.size)];
                if (allSizes.length > 0) {
                    // Sort sizes to find percentiles
                    allSizes.sort((a, b) => a - b);
                    // Use 90th percentile as the "Wall" threshold - this is a high volume level
                    const p90Idx = Math.floor(allSizes.length * 0.9);
                    const p90Size = allSizes[p90Idx];
                    
                    // We want to trigger when a wall is detected, so our threshold should be large enough
                    // but not so large that it never triggers. 
                    const calculatedVol = p90Size * 1.2;

                    if (calculatedVol > 10000) optimalVol = Math.round(calculatedVol / 1000) * 1000;
                    else if (calculatedVol > 100) optimalVol = Math.round(calculatedVol / 10) * 10;
                    else optimalVol = parseFloat(calculatedVol.toFixed(2));
                    
                    optimalVol = Math.max(dynamicStep * 10, optimalVol);

                    // Amount based on 10% of typical depth size for safety
                    const avgSize = allSizes.reduce((s, a) => s + a, 0) / allSizes.length;
                    const avgQuoteValue = avgSize * currentPrice;
                    const targetUsdVal = Math.max(10, avgQuoteValue * 0.2);
                    
                    if (tradingMode === 'spot' && strategyMode === 'short') {
                        optimalAmount = parseFloat((targetUsdVal / currentPrice).toFixed(displayDigits > 0 ? displayDigits : 2));
                    } else {
                        optimalAmount = parseFloat(targetUsdVal.toFixed(2));
                    }
                }
                // --- SMART ICEBERG VOLUME (QUOTE VALUE BASED) ---
                // Iceberg absorption must be HARDER to trigger than a normal wall.
                // We use p95 quote value (price × size) of the full order book depth.
                // This ensures only massive institutional absorption qualifies.
                const allQuoteValues = [
                    ...deepBids.map((b: any) => b.price * b.size),
                    ...deepAsks.map((a: any) => a.price * a.size),
                ];
                if (allQuoteValues.length > 0) {
                    allQuoteValues.sort((a, b) => a - b);
                    const p95Idx = Math.floor(allQuoteValues.length * 0.95);
                    const p95QuoteVal = allQuoteValues[p95Idx];
                    // Use 3× the p95 quote value: iceberg must absorb significantly more than a single top-book level
                    const rawIcebergVol = p95QuoteVal * 3;
                    // Round to nearest $5,000 for cleanliness
                    optimalIcebergVol = Math.max(5000, Math.round(rawIcebergVol / 5000) * 5000);
                }
            } // end: if (deepBids.length > 0 && deepAsks.length > 0)

            setForm(prev => ({
                ...prev,
                vol: optimalVol,
                spread: optimalSpread,
                amount: optimalAmount,
                icebergMinAbsorbedVol: optimalIcebergVol,
            }));
            
            setErrorMsg("✅ Parameters auto-detected!");
            setTimeout(() => setErrorMsg(''), 3000);

        } catch (err: any) {
            console.error("Auto detect failed:", err);
            setErrorMsg("❌ Detection failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeploy = async () => {
        if (!form.isPaper && !form.apiKeyId) {
            setErrorMsg("Please select an API Key for Live Trading.");
            return;
        }

        if (!form.enableWallTrigger && !form.enableLiqTrigger) {
            if (!form.enableUtBot && !form.enableDualEngine && !form.enableSupertrendBot) {
                setErrorMsg("Please enable at least one Entry Trigger (Orderbook Wall, Liquidation, Dual Engine, UT Bot Alerts, or Supertrend).");
                return;
            }
            if (form.enableUtBot && !form.enableUtEntryTrigger && !form.enableDualEngine && !form.enableSupertrendBot) {
                setErrorMsg("UT Bot Alerts is ON, but 'Entry Trigger' sub-option is OFF. Please enable it to use UT Bot as a trigger.");
                return;
            }
            if (form.enableSupertrendBot && !form.enableSupertrendEntryTrigger && !form.enableDualEngine && !form.enableUtBot) {
                setErrorMsg("Supertrend is ON, but 'Entry Trigger' is OFF. Please enable it to use Supertrend as a trigger.");
                return;
            }
        }

        setErrorMsg('');
        setIsLoading(true);

        try {
            const defaultName = `${tradingMode === 'futures' ? 'Perp Hunter' : 'L2 Hunter'}: ${form.symbol}`;
            const payload = {
                name: form.botName && form.botName.trim() !== '' ? form.botName.trim() : defaultName,
                description: `Orderbook & Liquidation Scalping Hunter (${tradingMode.toUpperCase()})`,
                exchange: form.exchange,
                market: form.symbol,
                strategy: "wall_hunter",
                timeframe: "1m",
                trade_value: form.amount,
                trade_unit: "QUOTE",
                api_key_id: form.isPaper ? null : form.apiKeyId,
                is_paper_trading: form.isPaper,
                config: {
                    trading_mode: tradingMode, // Spot vs Futures Isolation Flag
                    strategy_mode: strategyMode, // Accumulation mode
                    
                    // Proxy Orderbook Routing (Cross-Exchange Support)
                    enable_proxy_wall: form.enableProxyWall,
                    proxy_exchange: form.enableProxyWall ? form.proxyExchange : null,
                    proxy_symbol: form.enableProxyWall ? form.proxySymbol : null,
                    
                    amount_per_trade: form.amount,
                    target_spread: form.spread,
                    trailing_stop: form.enableTsl ? form.tsl : 0.0,
                    tsl_activation_pct: form.tslActivationPct,
                    vol_threshold: form.vol,
                    risk_pct: form.enableRiskSl ? form.risk : 0.0,
                    sell_order_type: form.sellOrderType,
                    sl_order_type: form.slOrderType,
                    min_wall_lifetime: form.spoofTime,
                    partial_tp_pct: form.enablePartialTp ? form.partialTp : 0.0,
                    partial_tp_trigger_pct: form.enablePartialTp ? form.partialTpTriggerPct : 0.0,
                    sl_breakeven_trigger_pct: form.enableBreakevenSl ? form.breakevenTriggerPct : 0.0,
                    sl_breakeven_target_pct: form.enableBreakevenSl ? form.breakevenTargetPct : 0.0,
                    vpvr_enabled: form.vpvrEnabled,
                    vpvr_tolerance: form.vpvrTolerance,
                    atr_sl_enabled: form.atrEnabled,
                    atr_period: form.atrPeriod,
                    atr_multiplier: form.atrMultiplier,

                    enable_wall_trigger: form.enableWallTrigger,
                    max_wall_distance_pct: form.maxWallDistancePct,
                    enable_liq_trigger: form.enableLiqTrigger,
                    liq_threshold: form.liqThreshold,
                    liq_target_side: form.liqTargetSide,
                    enable_micro_scalp: form.enableMicroScalp,
                    micro_scalp_profit_ticks: form.microScalpProfitTicks,
                    micro_scalp_min_wall: form.microScalpMinWall,
                    trading_session: form.tradingSession,

                    enable_liq_cascade: form.enableLiqCascade,
                    liq_cascade_window: form.liqCascadeWindow,
                    enable_dynamic_liq: form.enableDynamicLiq,
                    dynamic_liq_multiplier: form.dynamicLiqMultiplier,
                    enable_ob_imbalance: form.enableObImbalance,
                    ob_imbalance_ratio: form.obImbalanceRatio,

                    enable_oib_filter: form.enableOibFilter,
                    min_oib_threshold: form.minOibThreshold,
                    enable_dynamic_atr_scalp: form.enableDynamicAtrScalp,
                    micro_scalp_atr_multiplier: form.microScalpAtrMultiplier,

                    follow_btc_liq: form.followBtcLiq,
                    btc_liq_threshold: form.btcLiqThreshold,

                    // Conditionally append Futures config
                    ...(tradingMode === 'futures' && {
                        margin_mode: form.marginMode,
                        leverage: form.leverage,
                        position_direction: form.positionDirection,
                        reduce_only: form.reduceOnly,
                        liquidation_safety_pct: form.liquidationSafetyPct
                    }),

                    // CVD Absorption Confirmation
                    enable_absorption: form.enableAbsorption,
                    absorption_threshold: form.absorptionThreshold,
                    absorption_window: form.absorptionWindow,

                    // Iceberg & Hidden Wall Trigger
                    enable_iceberg_trigger: form.enableIcebergTrigger,
                    iceberg_time_window_secs: form.icebergTimeWindowSecs,
                    iceberg_min_absorbed_vol: form.icebergMinAbsorbedVol,

                    // BTC Correlation Filter
                    enable_btc_correlation: form.enableBtcCorrelation,
                    btc_correlation_threshold: form.btcCorrelationThreshold,
                    btc_time_window: form.btcTimeWindow,
                    btc_min_move_pct: form.btcMinMovePct,

                    // Adaptive Trend Filter
                    enable_trend_filter: form.enableTrendFilter,
                    trend_filter_lookback: form.trendFilterLookback,
                    trend_filter_threshold: form.trendFilterThreshold,
                    
                    // Dual Engine Command Center
                    enable_dual_engine: form.enableDualEngine,
                    dual_engine_mode: form.dualEngineMode,
                    dual_engine_ema_filter: form.dualEngineEmaFilter,
                    dual_engine_rsi_filter: form.dualEngineRsiFilter,
                    dual_engine_candle_filter: form.dualEngineCandleFilter,
                    dual_engine_macd_filter: form.dualEngineMacdFilter,
                    dual_engine_squeeze_filter: form.dualEngineSqueezeFilter,
                    dual_engine_ema_length: form.dualEngineEmaLength,
                    dual_engine_rsi_length: form.dualEngineRsiLength,
                    dual_engine_rsi_ob: form.dualEngineRsiOb,
                    dual_engine_rsi_os: form.dualEngineRsiOs,
                    dual_engine_macd_fast: form.dualEngineMacdFast,
                    dual_engine_macd_slow: form.dualEngineMacdSlow,
                    dual_engine_macd_signal: form.dualEngineMacdSignal,
                    dual_engine_squeeze_length: form.dualEngineSqueezeLength,
                    dual_engine_squeeze_bb_mult: form.dualEngineSqueezeBbMult,
                    dual_engine_squeeze_kc_mult: form.dualEngineSqueezeKcMult,

                    // Modular UT Bot Alerts
                    enable_ut_trend_filter: form.enableUtBot ? form.enableUtTrendFilter : false,
                    enable_ut_entry_trigger: form.enableUtBot ? form.enableUtEntryTrigger : false,
                    enable_ut_trend_unlock_mode: form.enableUtBot ? form.enableUtTrendUnlockMode : false,
                    enable_ut_trailing_sl: form.enableUtBot ? form.enableUtTrailingSl : false,
                    ut_bot_sensitivity: form.utBotSensitivity,
                    ut_bot_atr_period: form.utBotAtrPeriod,
                    ut_bot_use_heikin_ashi: form.utBotUseHeikinAshi,
                    ut_bot_timeframe: form.utBotTimeframe,
                    ut_bot_candle_close: form.utBotCandleClose,
                    ut_bot_validation_secs: form.utBotValidationSecs,
                    ut_bot_retest_snipe: form.utBotRetestSnipe,

                    // Modular Supertrend
                    enable_supertrend_trend_filter: form.enableSupertrendBot ? form.enableSupertrendTrendFilter : false,
                    enable_supertrend_entry_trigger: form.enableSupertrendBot ? form.enableSupertrendEntryTrigger : false,
                    enable_supertrend_trend_unlock_mode: form.enableSupertrendBot ? form.enableSupertrendTrendUnlockMode : false,
                    enable_supertrend_trailing_sl: form.enableSupertrendBot ? form.enableSupertrendTrailingSl : false,
                    enable_supertrend_exit: form.enableSupertrendBot ? form.enableSupertrendExit : false,
                    supertrend_exit_timeout: form.supertrendExitTimeout,
                    supertrend_period: form.supertrendPeriod,
                    supertrend_multiplier: form.supertrendMultiplier,
                    supertrend_timeframe: form.supertrendTimeframe,
                    supertrend_candle_close: form.supertrendCandleClose,

                    // New Buy Order Logic
                    buy_order_type: form.buyOrderType,
                    limit_buffer: form.limitBuffer
                }
            };

            if (existingBot) {
                await botService.updateBot(existingBot.id, payload);
                setTimeout(() => {
                    setIsLoading(false);
                    setErrorMsg("⚡ Live Config Updated Successfully!");
                    setTimeout(() => setErrorMsg(''), 3000);
                }, 1000);
            } else {
                const createdBot = await botService.createBot(payload);
                await botService.controlBot(createdBot.id, 'start');

                setTimeout(() => {
                    setIsLoading(false);
                    if (onDeploySuccess) onDeploySuccess(Number(createdBot.id));
                    else onClose();
                }, 1000);
            }
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.response?.data?.detail || err.message || "Failed to deploy bot.");
            setIsLoading(false);
        }
    };

    const handleFormChange = (field: string, value: any) => {
        if (field === 'enableUtBot' && value === true) {
            // Auto-enable Entry Trigger if no other triggers are active to improve UX
            if (!form.enableWallTrigger && !form.enableLiqTrigger && !form.enableSupertrendBot) {
                setForm(prev => ({ ...prev, enableUtBot: true, enableUtEntryTrigger: true }));
                return;
            }
        }
        if (field === 'enableSupertrendBot' && value === true) {
            // Auto-enable Entry Trigger if no other triggers are active
            if (!form.enableWallTrigger && !form.enableLiqTrigger && !form.enableUtBot) {
                setForm(prev => ({ ...prev, enableSupertrendBot: true, enableSupertrendEntryTrigger: true }));
                return;
            }
        }
        if (field === 'enableDualEngine' && value === true) {
            setForm(prev => ({ 
                ...prev, 
                enableDualEngine: true, 
                dualEngineEmaFilter: true, 
                dualEngineRsiFilter: true, 
                dualEngineCandleFilter: true,
                dualEngineMacdFilter: true,
                dualEngineSqueezeFilter: true
            }));
            return;
        }
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const currentPrice = bids.length > 0 ? bids[0].price : (asks.length > 0 ? asks[0].price : 1);
    
    let dynamicStep = 0.01;
    let displayDigits = 2;
    if (currentPrice < 0.000000001) { dynamicStep = 0.00000000001; displayDigits = 11; }
    else if (currentPrice < 0.00000001) { dynamicStep = 0.0000000001; displayDigits = 10; }
    else if (currentPrice < 0.0000001) { dynamicStep = 0.000000001; displayDigits = 9; }
    else if (currentPrice < 0.000001) { dynamicStep = 0.00000001; displayDigits = 8; }
    else if (currentPrice < 0.00001) { dynamicStep = 0.0000001; displayDigits = 7; }
    else if (currentPrice < 0.0001) { dynamicStep = 0.000001; displayDigits = 6; }
    else if (currentPrice < 0.001) { dynamicStep = 0.00001; displayDigits = 5; }
    else if (currentPrice < 1) { dynamicStep = 0.0001; displayDigits = 4; }
    else if (currentPrice < 10) { dynamicStep = 0.001; displayDigits = 3; }
    else if (currentPrice < 100) { dynamicStep = 0.01; displayDigits = 2; }
    else if (currentPrice < 1000) { dynamicStep = 0.1; displayDigits = 1; }
    else { dynamicStep = 1; displayDigits = 0; }

    const dynamicMax = dynamicStep * 500; 

    // --- FEE ESTIMATION LOGIC ---
    const getBaseFeeRate = () => {
        if (liveFeeRate !== null) return liveFeeRate;
        if (form.exchange === 'binance') return useNativeTokenFee ? 0.0015 : 0.002;
        if (form.exchange === 'mexc') return useNativeTokenFee ? 0.0008 : 0.001; 
        if (form.exchange === 'kucoin') return useNativeTokenFee ? 0.0032 : 0.004; // Altcoins often 0.2% M/T -> 0.4% RT (20% KCS discount = 0.32%)
        return 0.002; // default 0.2% RT
    };

    const feeRate = getBaseFeeRate();
    const isFutures = tradingMode === 'futures';
    // Calculate PnL based on Amount and Spread
    const tradeValue = isFutures ? form.amount * form.leverage : form.amount;
    const spreadPct = currentPrice > 0 ? (form.spread / currentPrice) : 0;
    const grossProfitUSD = tradeValue * spreadPct;
    const feeUSD = tradeValue * feeRate;
    const netProfitUSD = grossProfitUSD - feeUSD;
    const netProfitPct = form.amount > 0 ? ((netProfitUSD / form.amount) * 100) : 0; 

    // --- CURRENCY & DIRECTION SETTINGS ---
    const isShortMode = tradingMode === 'spot' && strategyMode === 'short';
    const tradeDirection = isShortMode || (tradingMode === 'futures' && form.positionDirection === 'short') ? 'short' : 'long';
    const baseCurrency = form.symbol ? form.symbol.split('/')[0] : '';
    const currencyPrefix = isShortMode ? '' : '$';
    const currencySuffix = isShortMode ? ` ${baseCurrency}` : '';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-[600px] bg-[#0B1120] border-2 border-yellow-500/30 rounded-[2rem] p-6 shadow-[0_0_50px_rgba(59,130,246,0.2)] max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-black italic text-white tracking-tighter">SNIPER DEPLOYMENT</h2>
                    <button
                        onClick={handleAutoDetect}
                        className="flex items-center gap-1 bg-brand-primary/20 hover:bg-brand-primary/30 border border-brand-primary/50 text-brand-primary px-3 py-1.5 rounded-full text-xs font-bold transition-colors shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        AUTO DETECT
                    </button>
                </div>

                {/* --- MAIN TRADING MODE TOGGLE --- */}
                <div className="flex bg-black/40 p-1.5 rounded-2xl mb-4 border border-white/5 flex-shrink-0">
                    <button
                        onClick={() => setTradingMode('spot')}
                        className={`flex-1 py-2.5 text-xs font-black uppercase rounded-xl transition-all ${tradingMode === 'spot' ? 'bg-brand-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        SPOT BOT
                    </button>
                    <button
                        onClick={() => setTradingMode('futures')}
                        className={`flex-1 py-2.5 text-xs font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${tradingMode === 'futures' ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        FUTURE TRADING BOT ⚡
                    </button>
                </div>

                {/* --- TABS NAVIGATION --- */}
                <div className="flex gap-2 border-b border-white/10 mb-4 pb-2 overflow-x-auto flex-shrink-0 hide-scrollbar">
                    <button onClick={() => setActiveTab('basic')} className={`px-4 py-2 text-xs font-black tracking-wider uppercase rounded-xl transition-all ${activeTab === 'basic' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'text-gray-500 hover:bg-white/5'}`}>Basic & Execution</button>
                    <button onClick={() => setActiveTab('triggers')} className={`px-4 py-2 text-xs font-black tracking-wider uppercase rounded-xl transition-all ${activeTab === 'triggers' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'text-gray-500 hover:bg-white/5'}`}>Entry Triggers</button>
                    <button onClick={() => setActiveTab('risk')} className={`px-4 py-2 text-xs font-black tracking-wider uppercase rounded-xl transition-all ${activeTab === 'risk' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'text-gray-500 hover:bg-white/5'}`}>Risk Management</button>
                    <button onClick={() => setActiveTab('advanced')} className={`px-4 py-2 text-xs font-black tracking-wider uppercase rounded-xl transition-all ${activeTab === 'advanced' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'text-gray-500 hover:bg-white/5'}`}>Advanced</button>
                </div>

                {/* --- TABS CONTENT --- */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                    {activeTab === 'basic' && (
                        <div className="animate-fadeIn space-y-4">
                            <div className="flex gap-4">
                                <div className="space-y-1 flex-1">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">Bot Name (Optional)</label>
                                    <input 
                                        className="w-full bg-white/5 p-2 rounded-xl text-yellow-500 outline-none border border-transparent focus:border-brand-primary focus:bg-black/40 text-sm transition-all font-mono" 
                                        placeholder="Auto-generated if left empty" 
                                        value={form.botName} 
                                        onChange={(e) => handleFormChange('botName', e.target.value)}
                                        maxLength={50}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="space-y-1 w-1/3">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">Asset</label>
                                    <input className="w-full bg-white/5 p-2 rounded-xl text-yellow-500 font-mono outline-none border border-transparent text-sm" value={form.symbol} readOnly />
                                </div>
                                <div className="space-y-1 w-1/3">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">Exchange</label>
                                    <select 
                                        className="w-full bg-white/5 p-2 rounded-xl text-white outline-none text-sm" 
                                        value={form.exchange} 
                                        onChange={(e) => setForm({ ...form, exchange: e.target.value })}
                                    >
                                        {availableExchanges.length > 0 ? (
                                            availableExchanges.map(ex => (
                                                <option key={ex} className="bg-[#0B1120] text-white" value={ex}>
                                                    {ex.charAt(0).toUpperCase() + ex.slice(1)}
                                                </option>
                                            ))
                                        ) : (
                                            <>
                                                <option className="bg-[#0B1120] text-white" value="binance">Binance</option>
                                                <option className="bg-[#0B1120] text-white" value="bybit">Bybit</option>
                                                <option className="bg-[#0B1120] text-white" value="okx">OKX</option>
                                                <option className="bg-[#0B1120] text-white" value="mexc">MEXC</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                                <div className="w-1/3 space-y-1">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                                        {tradingMode === 'spot' && strategyMode === 'short' ? 'Sell Order (Entry)' : 'Sell Order (TP)'}
                                    </label>
                                    <select className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-brand-primary text-sm font-bold" value={form.sellOrderType} onChange={(e) => handleFormChange('sellOrderType', e.target.value)}>
                                        <option className="bg-[#0B1120] text-white" value="market">Market (Normal)</option>
                                        <option className="bg-[#0B1120] text-white" value="limit">Limit (Maker)</option>
                                        <option className="bg-[#0B1120] text-white" value="marketable_limit">Marketable Limit (MEXC)</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* --- NEW: SPOT STRATEGY MODE / BASE ACCUMULATION FLAG --- */}
                            {tradingMode === 'spot' && (
                                <div className="flex gap-4 p-3 bg-white/5 border border-white/10 rounded-2xl animate-fadeIn">
                                    <div className="flex flex-col w-full space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] text-brand-primary font-black uppercase">Spot Strategy Mode</label>
                                        </div>
                                        <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                                            <button onClick={() => setStrategyMode('long')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${strategyMode === 'long' ? 'bg-brand-primary text-white' : 'text-gray-500 hover:text-white'}`}>Accumulate Quote (Normal)</button>
                                            <button onClick={() => setStrategyMode('short')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all flex items-center justify-center gap-1 ${strategyMode === 'short' ? 'bg-yellow-600 text-white shadow-[0_0_10px_rgba(202,138,4,0.3)]' : 'text-gray-500 hover:text-white'}`}>
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                                                Accumulate Base (Short)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- NEW: BUY ORDER TYPE & BUFFER --- */}
                            <div className="flex gap-4 p-3 bg-white/5 border border-white/10 rounded-2xl">
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] text-gray-400 font-black uppercase">
                                        {tradingMode === 'spot' && strategyMode === 'short' ? 'Buy Order (TP)' : 'Buy Order Type'}
                                    </label>
                                    <select 
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-brand-primary text-sm font-bold" 
                                        value={form.buyOrderType} 
                                        onChange={(e) => handleFormChange('buyOrderType', e.target.value)}
                                    >
                                        <option className="bg-[#0B1120]" value="market">Market (Normal)</option>
                                        <option className="bg-[#0B1120]" value="limit">Limit (Maker)</option>
                                        <option className="bg-[#0B1120]" value="marketable_limit">Marketable Limit (Recommended for MEXC)</option>
                                    </select>
                                </div>
                                {(form.buyOrderType === 'marketable_limit' || form.sellOrderType === 'marketable_limit') && (
                                    <div className="w-1/3 space-y-1 animate-fadeIn">
                                        <label className="text-[10px] text-orange-400 font-black uppercase">Limit Buffer (%)</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            className="w-full bg-orange-500/10 border border-orange-500/30 rounded-xl p-2.5 text-orange-400 outline-none text-center font-mono font-bold" 
                                            value={form.limitBuffer} 
                                            onChange={(e) => handleFormChange('limitBuffer', parseFloat(e.target.value))} 
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${form.isPaper ? 'bg-green-500/10 border-green-500' : 'bg-white/5 border-white/10'}`} onClick={() => setForm({ ...form, isPaper: true })}>
                                    <p className="text-xs font-bold text-white">Paper Trading <span className="text-[10px] text-green-500 ml-1">(SIM)</span></p>
                                    {form.isPaper && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
                                </div>
                                <div className={`p-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${!form.isPaper ? 'bg-red-500/10 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-white/5 border-white/10'}`} onClick={() => setForm({ ...form, isPaper: false })}>
                                    <p className="text-xs font-bold text-white">Live Market <span className="text-[10px] text-red-500 ml-1">(REAL)</span></p>
                                    {!form.isPaper && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>}
                                </div>
                            </div>

                            {!form.isPaper && (
                                <div className="flex flex-col">
                                    <label className="text-[10px] text-gray-500 font-bold uppercase mb-1">Select API Config</label>
                                    <select className="w-full bg-yellow-500/10 border border-yellow-500/20 p-2.5 rounded-xl text-white outline-none text-sm" value={form.apiKeyId} onChange={(e) => setForm({ ...form, apiKeyId: e.target.value })}>
                                        <option className="bg-[#0B1120] text-white" value="">-- Choose Saved Key --</option>
                                        {savedKeys.filter(k => k.exchange === form.exchange).map(k => (
                                            <option className="bg-[#0B1120] text-white" key={k.id} value={k.id}>{k.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* --- FUTURES SPECIFIC SETTINGS IN BASIC TAB --- */}
                            {tradingMode === 'futures' && (
                                <div className="animate-fadeIn bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl space-y-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-xs font-black text-orange-400 uppercase tracking-wider flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            Futures Configuration
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase">Margin Mode</label>
                                            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                                                <button onClick={() => handleFormChange('marginMode', 'cross')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded ${form.marginMode === 'cross' ? 'bg-orange-500 text-white' : 'text-gray-500'}`}>Cross</button>
                                                <button onClick={() => handleFormChange('marginMode', 'isolated')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded ${form.marginMode === 'isolated' ? 'bg-orange-500 text-white' : 'text-gray-500'}`}>Isolated</button>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase">Position Direction</label>
                                            <select 
                                                className="w-full bg-black/40 border border-white/10 p-2.5 rounded-lg text-white outline-none text-sm" 
                                                value={form.positionDirection} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleFormChange('positionDirection', val);
                                                    if (val === 'auto') handleFormChange('enableObImbalance', true);
                                                }}
                                            >
                                                <option className="bg-[#0B1120]" value="auto">Auto (Heatmap Based)</option>
                                                <option className="bg-[#0B1120] text-green-400" value="long">Long Only</option>
                                                <option className="bg-[#0B1120] text-red-400" value="short">Short Only</option>
                                            </select>
                                        </div>
                                    </div>

                                    {form.positionDirection === 'auto' && (
                                        <div className="animate-fadeIn bg-black/40 border border-orange-500/30 p-3 rounded-xl">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] font-bold text-orange-400 uppercase tracking-tighter">Heatmap Imbalance Ratio</label>
                                                <span className="text-xs font-mono font-bold text-white">{form.obImbalanceRatio}x</span>
                                            </div>
                                            <div className="flex gap-3 items-center">
                                                <input 
                                                    type="range" 
                                                    min="1.1" 
                                                    max="10.0" 
                                                    step="0.1" 
                                                    className="flex-1 h-1.5 accent-orange-500 bg-white/10 rounded-lg appearance-none cursor-pointer" 
                                                    value={form.obImbalanceRatio} 
                                                    onChange={(e) => handleFormChange('obImbalanceRatio', parseFloat(e.target.value))} 
                                                />
                                                <input 
                                                    type="number" 
                                                    step="0.1" 
                                                    className="w-16 bg-black/40 border border-white/10 rounded-lg p-1 text-white text-center font-mono text-xs" 
                                                    value={form.obImbalanceRatio} 
                                                    onChange={(e) => handleFormChange('obImbalanceRatio', parseFloat(e.target.value))} 
                                                />
                                            </div>
                                            <p className="text-[9px] text-gray-500 mt-1 italic">Bot will only enter if one side has {form.obImbalanceRatio}x more volume than the other.</p>
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase">Leverage (Max 125x)</label>
                                            <span className={`text-xs font-mono font-bold ${form.leverage > 20 ? 'text-red-500' : 'text-orange-400'}`}>{form.leverage}x</span>
                                        </div>
                                        <div className="flex gap-3 items-center">
                                            <input type="range" min="1" max="125" step="1" className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer ${form.leverage > 20 ? 'accent-red-500' : 'accent-orange-500'} bg-white/10`} value={form.leverage} onChange={(e) => handleFormChange('leverage', parseInt(e.target.value))} />
                                            <input type="number" min="1" max="125" className="w-20 bg-black/40 border border-white/10 rounded-xl p-1.5 text-white outline-none focus:border-orange-500 text-center font-mono text-sm" value={form.leverage} onChange={(e) => handleFormChange('leverage', parseInt(e.target.value))} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Target Spread Profit</label>
                                    <span className="text-xs font-mono font-bold text-brand-primary">{form.spread.toString().includes('e') ? form.spread.toFixed(12).replace(/\.?0+$/, '') : form.spread}</span>
                                </div>
                                <div className="flex gap-3 items-center">
                                    <input type="range" min="0" max={dynamicMax} step={dynamicStep} className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary" value={form.spread} onChange={(e) => setForm({ ...form, spread: parseFloat(e.target.value) || 0 })} />
                                    <input type="number" min="0" step={dynamicStep} className="w-24 bg-black/40 border border-white/10 rounded-xl p-1.5 text-white outline-none focus:border-brand-primary text-center font-mono text-sm" value={form.spread.toString().includes('e') ? form.spread.toFixed(12).replace(/\.?0+$/, '') : form.spread} onChange={(e) => setForm({ ...form, spread: e.target.value === '' ? 0 : parseFloat(e.target.value) })} />
                                </div>
                            </div>

                            <InputField label={`Margin Allocation (${form.symbol ? (tradingMode === 'spot' && strategyMode === 'short' ? form.symbol.split('/')[0] : (form.symbol.split('/')[1] || 'USDT')) : 'USDT'})`} value={form.amount} onChange={(v: number) => setForm({ ...form, amount: v })} step={10} />

                            {/* --- NATIVE TOKEN FEE TOGGLE --- */}
                            {(form.exchange === 'binance' || form.exchange === 'mexc' || form.exchange === 'kucoin') && (
                                <div className="flex items-center gap-2 mt-4 px-1">
                                    <button 
                                        onClick={() => setUseNativeTokenFee(!useNativeTokenFee)}
                                        className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${useNativeTokenFee ? 'bg-brand-primary border-brand-primary' : 'border-gray-500'}`}
                                    >
                                        {useNativeTokenFee && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                    </button>
                                    <span className="text-xs font-bold text-gray-400 cursor-pointer select-none" onClick={() => setUseNativeTokenFee(!useNativeTokenFee)}>
                                        Pay fees in {form.exchange === 'binance' ? 'BNB (25% Discount)' : form.exchange === 'mexc' ? 'MX (20% Discount)' : 'KCS (20% Discount)'}
                                    </span>
                                </div>
                            )}

                            {/* --- ESTIMATED PROFIT ANALYSIS --- */}
                            <div className="mt-4 bg-[#050B14] p-4 rounded-xl border border-brand-primary/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
                                <h4 className="text-[10px] font-black uppercase text-gray-500 mb-3 flex items-center gap-2">
                                    <svg className="w-3 h-3 text-brand-primary" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                                    Estimated Profit Analysis
                                </h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Trade Value {isFutures && '(Leveraged)'}</span>
                                        <span className="font-mono text-gray-300">{currencyPrefix}{tradeValue.toFixed(isShortMode ? Math.max(2, displayDigits - 2) : 2)}{currencySuffix}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Gross Profit ({(spreadPct * 100).toFixed(2)}%)</span>
                                        <span className="font-mono text-green-400">+{currencyPrefix}{grossProfitUSD.toFixed(isShortMode ? Math.max(2, displayDigits) : 2)}{currencySuffix}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">
                                            Estimated Fees ({(feeRate * 100).toFixed(3)}%)
                                            {liveFeeRate !== null && <span className="ml-1 text-[9px] text-green-400 border border-green-500/30 bg-green-500/10 px-1 py-0.5 rounded cursor-help" title="Live VIP/Account fee fetched directly from exchange.">API TIER</span>}
                                        </span>
                                        <span className="font-mono text-red-400">-{currencyPrefix}{feeUSD.toFixed(isShortMode ? Math.max(3, displayDigits + 1) : 3)}{currencySuffix}</span>
                                    </div>
                                    <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                                        <span className="text-sm font-bold text-gray-300">Net Profit</span>
                                        <span className={`text-sm font-mono font-bold ${netProfitUSD > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {netProfitUSD > 0 ? '+' : ''}{currencyPrefix}{netProfitUSD.toFixed(isShortMode ? Math.max(2, displayDigits) : 2)}{currencySuffix} ({netProfitPct > 0 ? '+' : ''}{netProfitPct.toFixed(2)}%)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'triggers' && (
                        <div className="animate-fadeIn space-y-4">
                            {/* --- NEW: TRADING SESSION FILTER --- */}
                            <div className="bg-black/20 p-4 rounded-xl border border-white/10 space-y-2 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-xl"></div>
                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2">
                                    <span>Trading Session (UTC)</span>
                                </div>
                                <div className="pl-2">
                                    <select
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-brand-primary text-xs font-semibold appearance-none cursor-pointer"
                                        value={form.tradingSession}
                                        onChange={(e) => handleFormChange('tradingSession', e.target.value)}
                                    >
                                        <option value="None">None (Run 24/7)</option>
                                        <option value="Sydney">🇦🇺 Sydney (22:00 - 07:00 UTC)</option>
                                        <option value="Tokyo">🇯🇵 Tokyo (00:00 - 09:00 UTC)</option>
                                        <option value="London">🇬🇧 London (08:00 - 17:00 UTC)</option>
                                        <option value="New York">🇺🇸 New York (13:00 - 22:00 UTC)</option>
                                        <option value="Overlap">🔥 London & NY Overlap (13:00 - 17:00 UTC)</option>
                                    </select>
                                </div>
                                <p className="text-[8px] text-gray-500 italic mt-1 leading-tight pl-2">If a session is selected, the bot will only take entries during this window. If the session ends while running, the bot will automatically turn off and send a Telegram alert.</p>
                            </div>

                            {/* Triggers remain untouched */}
                            <p className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Select the conditions that will trigger an entry order.</p>

                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.enableWallTrigger ? 'bg-white/5 border-brand-primary/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('enableWallTrigger', !form.enableWallTrigger)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.enableWallTrigger ? 'bg-brand-primary' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableWallTrigger ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">Orderbook Wall</span>
                                    </div>
                                </div>
                                {form.enableWallTrigger && (
                                    <div className="mt-3 pl-1 space-y-4" onClick={e => e.stopPropagation()}>
                                        <div>
                                            <div className="flex justify-between items-end mb-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Volume Wall Threshold</label>
                                                <span className="text-xs font-mono font-bold text-brand-primary">{form.vol.toLocaleString()}</span>
                                            </div>
                                            <input type="range" min="0" max="10000000" step="1000" className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary" value={form.vol} onChange={(e) => setForm({ ...form, vol: parseFloat(e.target.value) })} />
                                        </div>
                                        <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                            <div className="flex justify-between items-end mb-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Max Wall Distance (%)</label>
                                                <span className="text-xs font-mono font-bold text-brand-primary">{form.maxWallDistancePct}%</span>
                                            </div>
                                            <div className="flex gap-3 items-center">
                                                <input type="range" min="0.1" max="10.0" step="0.1" className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary" value={form.maxWallDistancePct} onChange={(e) => setForm({ ...form, maxWallDistancePct: parseFloat(e.target.value) })} />
                                                <input type="number" min="0.1" max="100" step="0.1" className="w-20 bg-black/40 border border-white/10 rounded-xl p-1.5 text-white outline-none focus:border-brand-primary text-center font-mono text-sm" value={form.maxWallDistancePct} onChange={(e) => setForm({ ...form, maxWallDistancePct: parseFloat(e.target.value) })} />
                                            </div>
                                        </div>
                                        
                                        {/* --- NEW: PROXY ORDERBOOK ROUTING --- */}
                                        <div className={`mt-3 p-3 rounded-lg border transition-all ${form.enableProxyWall ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-black/20 border-white/5'}`}>
                                            <div className="flex items-center justify-between cursor-pointer" onClick={() => handleFormChange('enableProxyWall', !form.enableProxyWall)}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${form.enableProxyWall ? 'bg-indigo-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${form.enableProxyWall ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1">
                                                        Proxy Orderbook Routing (Lead-Lag)
                                                    </span>
                                                </div>
                                            </div>
                                            {form.enableProxyWall && (
                                                <div className="mt-3 space-y-3 animate-fadeIn">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-col gap-1 z-[100] relative">
                                                            <HeatmapSymbolSelector
                                                                exchange={form.proxyExchange}
                                                                symbol={form.proxySymbol || (form.symbol ? form.symbol.split('/')[0] + '/USDT' : 'BTC/USDT')}
                                                                onExchangeChange={(ex) => handleFormChange('proxyExchange', ex)}
                                                                onSymbolChange={(sym) => handleFormChange('proxySymbol', sym)}
                                                            />
                                                        </div>
                                                        <p className="text-[8px] text-gray-500 mt-1 italic leading-tight">Detects massive walls on the Proxy Market ({form.proxyExchange}) but executes trades on the Native Asset {form.symbol} ({form.exchange}). Multi-exchange tracking enables institutional arbitrage setups.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* --- NEW: OIB FILTER INTEGRATION --- */}
                                        <div className={`mt-3 p-3 rounded-lg border transition-all ${form.enableOibFilter ? 'bg-amber-500/10 border-amber-500/50' : 'bg-black/20 border-white/5'}`}>
                                            <div className="flex items-center justify-between cursor-pointer" onClick={() => handleFormChange('enableOibFilter', !form.enableOibFilter)}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${form.enableOibFilter ? 'bg-amber-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${form.enableOibFilter ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1">
                                                        Orderbook Imbalance (OIB) Filter
                                                    </span>
                                                </div>
                                            </div>
                                            {form.enableOibFilter && (
                                                <div className="mt-3 space-y-3 animate-fadeIn">
                                                    <div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Min L2 Dominance</label>
                                                            <span className="text-xs font-mono font-bold text-amber-400">{Math.round(form.minOibThreshold * 100)}%</span>
                                                        </div>
                                                        <input type="range" min="0.5" max="0.95" step="0.05" className="w-full h-1.5 accent-amber-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.minOibThreshold} onChange={(e) => handleFormChange('minOibThreshold', parseFloat(e.target.value))} />
                                                        <p className="text-[8px] text-gray-500 mt-1 italic leading-tight">Blocks "Trap" entries. Validates if your entry direction controls at least {Math.round(form.minOibThreshold * 100)}% of the Top 10 Limit Order volumes compared to the opposing side.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* CVD ABSORPTION CONFIRMATION */}
                                        <div className={`mt-3 p-3 rounded-lg border transition-all ${form.enableAbsorption ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-black/20 border-white/5'}`}>
                                            <div className="flex items-center justify-between cursor-pointer" onClick={() => handleFormChange('enableAbsorption', !form.enableAbsorption)}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${form.enableAbsorption ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${form.enableAbsorption ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1">
                                                        CVD Absorption Meta-Confirmation
                                                        <div className="group relative">
                                                            <svg className="w-3 h-3 text-gray-400 cursor-help" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black border border-white/10 rounded-lg text-[9px] text-gray-300 hidden group-hover:block z-50 shadow-xl backdrop-blur-md">
                                                                Triggers ONLY if high market volume (Delta) hits the wall but fails to break it. High probability reversal signal.
                                                            </div>
                                                        </div>
                                                    </span>
                                                </div>
                                            </div>
                                            {form.enableAbsorption && (
                                                <div className="mt-3 space-y-3 animate-fadeIn">
                                                    <div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Min. Delta to Absorb ($)</label>
                                                            <span className="text-xs font-mono font-bold text-cyan-400">${form.absorptionThreshold.toLocaleString()}</span>
                                                        </div>
                                                        <input type="range" min="1000" max="1000000" step="1000" className="w-full h-1.5 accent-cyan-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.absorptionThreshold} onChange={(e) => handleFormChange('absorptionThreshold', parseFloat(e.target.value))} />
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Analysis Window (sec)</label>
                                                            <span className="text-xs font-mono font-bold text-cyan-400">{form.absorptionWindow}s</span>
                                                        </div>
                                                        <input type="range" min="1" max="60" className="w-full h-1.5 accent-cyan-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.absorptionWindow} onChange={(e) => handleFormChange('absorptionWindow', parseInt(e.target.value))} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                                        {/* ICEBERG / HIDDEN WALL TRIGGER */}
                                        <div className={`mt-3 p-3 rounded-lg border transition-all ${form.enableIcebergTrigger ? 'bg-purple-500/10 border-purple-500/50' : 'bg-black/20 border-white/5'}`}>
                                            <div className="flex items-center justify-between cursor-pointer" onClick={() => handleFormChange('enableIcebergTrigger', !form.enableIcebergTrigger)}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${form.enableIcebergTrigger ? 'bg-purple-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${form.enableIcebergTrigger ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className="text-[11px] font-black text-white uppercase tracking-wider flex items-center gap-1">
                                                        💎 Iceberg / Hidden Wall Trigger
                                                        <div className="group relative">
                                                            <svg className="w-3 h-3 text-gray-400 cursor-help" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-black border border-white/10 rounded-lg text-[9px] text-gray-300 hidden group-hover:block z-50 shadow-xl backdrop-blur-md">
                                                                Detects hidden institutional limit orders ("Reloading Walls") by correlating high trade tape volume against persistent orderbook depth. Bypasses standard volume rules for highest-priority entry.
                                                            </div>
                                                        </div>
                                                    </span>
                                                </div>
                                                {form.enableIcebergTrigger && (
                                                    <span className="text-[9px] font-bold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full">HIGH PRIORITY</span>
                                                )}
                                            </div>
                                            {form.enableIcebergTrigger && (
                                                <div className="mt-3 space-y-3 animate-fadeIn">
                                                    <div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Min. Absorbed Volume ($)</label>
                                                            <span className="text-xs font-mono font-bold text-purple-400">${form.icebergMinAbsorbedVol.toLocaleString()}</span>
                                                        </div>
                                                        <input type="range" min="5000" max="2000000" step="5000" className="w-full h-1.5 accent-purple-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.icebergMinAbsorbedVol} onChange={(e) => handleFormChange('icebergMinAbsorbedVol', parseFloat(e.target.value))} />
                                                        <p className="text-[8px] text-gray-500 mt-1">Total trade $ that must hit a price level before confirming the hidden wall.</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Detection Window (sec)</label>
                                                            <span className="text-xs font-mono font-bold text-purple-400">{form.icebergTimeWindowSecs}s</span>
                                                        </div>
                                                        <input type="range" min="2" max="60" step="1" className="w-full h-1.5 accent-purple-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.icebergTimeWindowSecs} onChange={(e) => handleFormChange('icebergTimeWindowSecs', parseInt(e.target.value))} />
                                                        <p className="text-[8px] text-gray-500 mt-1">Rolling time window to accumulate and analyse trade tape data.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.enableLiqTrigger ? 'bg-rose-500/5 border-rose-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('enableLiqTrigger', !form.enableLiqTrigger)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.enableLiqTrigger ? 'bg-rose-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableLiqTrigger ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">Liquidation Sniping</span>
                                    </div>
                                </div>
                                {form.enableLiqTrigger && (
                                    <div className="mt-3 pl-1 space-y-4" onClick={e => e.stopPropagation()}>
                                        <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-2">
                                            <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                                <span>Target Liquidation Side</span>
                                            </div>
                                            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                                                <button onClick={() => handleFormChange('liqTargetSide', 'auto')} className={`flex-1 py-1.5 text-[9px] font-bold uppercase rounded transition-all ${form.liqTargetSide === 'auto' ? 'bg-brand-primary text-white' : 'text-gray-500 hover:text-white'}`}>Auto</button>
                                                <button onClick={() => handleFormChange('liqTargetSide', 'long')} className={`flex-1 py-1.5 text-[9px] font-bold uppercase rounded transition-all ${form.liqTargetSide === 'long' ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-white'}`}>Long (Dump)</button>
                                                <button onClick={() => handleFormChange('liqTargetSide', 'short')} className={`flex-1 py-1.5 text-[9px] font-bold uppercase rounded transition-all ${form.liqTargetSide === 'short' ? 'bg-green-500 text-white' : 'text-gray-500 hover:text-white'}`}>Short (Pump)</button>
                                            </div>
                                            <p className="text-[8px] text-gray-500 italic mt-1 leading-tight">Auto: Normal mode snipes Short liqs (pumps). Accumulate Mode snipes Long liqs (dumps).</p>
                                        </div>
                                        
                                        <div className={form.followBtcLiq ? 'opacity-30 pointer-events-none grayscale transition-all' : 'transition-all'}>
                                            <div className="flex justify-between items-end mb-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Local Asset Liq. Threshold ($) {form.followBtcLiq && '(Ignored)'}</label>
                                                <span className="text-xs font-mono font-bold text-rose-500">${form.liqThreshold.toLocaleString()}</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min="1000" 
                                                max="1000000" 
                                                step="1000" 
                                                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-rose-500 bg-white/10" 
                                                value={form.liqThreshold} 
                                                disabled={form.followBtcLiq}
                                                onChange={(e) => setForm({ ...form, liqThreshold: parseFloat(e.target.value) })} 
                                            />
                                        </div>

                                        {/* BTC Follower */}
                                        <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                                            <div className="flex items-center justify-between cursor-pointer" onClick={() => handleFormChange('followBtcLiq', !form.followBtcLiq)}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-10 h-5 rounded-full p-1 transition-colors flex items-center ${form.followBtcLiq ? 'bg-orange-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${form.followBtcLiq ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className="text-[11px] font-black text-white uppercase tracking-wider">Follow BTC Liquidation Flux</span>
                                                </div>
                                            </div>
                                            {form.followBtcLiq && (
                                                <div className="animate-fadeIn pt-1">
                                                    <div className="flex justify-between items-end mb-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase">BTC Threshold ($)</label>
                                                        <span className="text-xs font-mono font-bold text-orange-400">${form.btcLiqThreshold.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex gap-3 items-center">
                                                        <input type="range" min="10000" max="5000000" step="10000" className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-orange-500 bg-white/10" value={form.btcLiqThreshold} onChange={(e) => handleFormChange('btcLiqThreshold', parseFloat(e.target.value))} />
                                                        <input type="number" step="10000" className="w-24 bg-black/40 border border-white/10 rounded-lg p-1 text-white text-center font-mono text-xs" value={form.btcLiqThreshold} onChange={(e) => handleFormChange('btcLiqThreshold', parseFloat(e.target.value))} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Cascade & Dynamic */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className={`bg-black/20 p-3 rounded-lg border cursor-pointer transition-colors ${form.enableLiqCascade ? 'border-rose-500/30 bg-rose-500/5' : 'border-white/5'}`} onClick={() => handleFormChange('enableLiqCascade', !form.enableLiqCascade)}>
                                                <span className="text-[10px] font-bold text-white uppercase block mb-2">Cascade Detection</span>
                                                {form.enableLiqCascade ? (
                                                    <div onClick={e => e.stopPropagation()}>
                                                        <div className="flex justify-between text-[9px] mb-1">
                                                            <span className="text-gray-400">WINDOW</span>
                                                            <span className="text-rose-400 font-mono">{form.liqCascadeWindow}s</span>
                                                        </div>
                                                        <input type="range" min="1" max="60" className="w-full h-1 accent-rose-500" value={form.liqCascadeWindow} onChange={(e) => handleFormChange('liqCascadeWindow', parseInt(e.target.value))} />
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] text-gray-500">Enable to detect liquidations in series</span>
                                                )}
                                            </div>
                                            
                                            <div className={`bg-black/20 p-3 rounded-lg border cursor-pointer transition-colors ${form.enableDynamicLiq ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/5'}`} onClick={() => handleFormChange('enableDynamicLiq', !form.enableDynamicLiq)}>
                                                <span className="text-[10px] font-bold text-white uppercase block mb-2">Dynamic Adapt</span>
                                                {form.enableDynamicLiq ? (
                                                    <div onClick={e => e.stopPropagation()}>
                                                        <div className="flex justify-between text-[9px] mb-1">
                                                            <span className="text-gray-400">MULT</span>
                                                            <span className="text-cyan-400 font-mono">{form.dynamicLiqMultiplier}x</span>
                                                        </div>
                                                        <input type="range" min="0.5" max="5.0" step="0.1" className="w-full h-1 accent-cyan-500" value={form.dynamicLiqMultiplier} onChange={(e) => handleFormChange('dynamicLiqMultiplier', parseFloat(e.target.value))} />
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] text-gray-500">Auto-adjust threshold based on volatility</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Imbalance Filter for Liquidation */}
                                        <div className={`bg-black/20 p-3 rounded-lg border cursor-pointer transition-colors ${form.enableObImbalance ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5'}`} onClick={() => handleFormChange('enableObImbalance', !form.enableObImbalance)}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-bold text-white uppercase">Bid/Ask Imbalance Filter</span>
                                                {form.enableObImbalance && <span className="text-xs font-mono font-bold text-amber-500">{form.obImbalanceRatio}x</span>}
                                            </div>
                                            {form.enableObImbalance && (
                                                <div onClick={e => e.stopPropagation()} className="animate-fadeIn">
                                                    <input type="range" min="1.1" max="10.0" step="0.1" className="w-full h-1.5 accent-amber-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.obImbalanceRatio} onChange={(e) => handleFormChange('obImbalanceRatio', parseFloat(e.target.value))} />
                                                    <p className="text-[8px] text-gray-500 mt-1 italic">Only trigger if orderbook also shows {form.obImbalanceRatio}x imbalance.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* --- UT BOT ALERTS INTEGRATION --- */}
                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.enableUtBot ? 'bg-fuchsia-500/5 border-fuchsia-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('enableUtBot', !form.enableUtBot)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.enableUtBot ? 'bg-fuchsia-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableUtBot ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-2">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${form.enableUtBot ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-white/5 text-gray-500'}`}>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-wider">UT Bot Alerts (PineScript)</h4>
                                                <p className="text-[10px] text-gray-400">Advanced algorithmic signals based on ATR and RMA</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {form.enableUtBot && (
                                    <div className="mt-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${form.enableUtTrendFilter ? 'bg-fuchsia-500/20 border-fuchsia-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableUtTrendFilter', !form.enableUtTrendFilter)}>
                                                <p className="text-xs font-bold text-white uppercase">Trend Filter</p>
                                                <div className={`w-3 h-3 rounded-full ${form.enableUtTrendFilter ? 'bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]' : 'bg-gray-600'}`}></div>
                                            </div>
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${form.enableUtEntryTrigger ? 'bg-fuchsia-500/20 border-fuchsia-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableUtEntryTrigger', !form.enableUtEntryTrigger)}>
                                                <p className="text-xs font-bold text-white uppercase">Entry Trigger</p>
                                                <div className={`w-3 h-3 rounded-full ${form.enableUtEntryTrigger ? 'bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]' : 'bg-gray-600'}`}></div>
                                            </div>
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between col-span-2 ${form.enableUtTrailingSl ? 'bg-fuchsia-500/20 border-fuchsia-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableUtTrailingSl', !form.enableUtTrailingSl)}>
                                                <p className="text-xs font-bold text-white uppercase">Dynamic Trailing SL</p>
                                                <div className={`w-3 h-3 rounded-full ${form.enableUtTrailingSl ? 'bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.8)]' : 'bg-gray-600'}`}></div>
                                            </div>
                                        </div>

                                        {form.enableUtEntryTrigger && (
                                            <div className="mb-4 animate-fadeIn">
                                                <div className={`p-3 rounded-xl border cursor-pointer transition-all ${form.enableUtTrendUnlockMode ? 'bg-fuchsia-500/20 border-fuchsia-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableUtTrendUnlockMode', !form.enableUtTrendUnlockMode)}>
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-bold text-white uppercase flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                                            Trend Unlock Mode
                                                        </p>
                                                        <div className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors duration-200 ${form.enableUtTrendUnlockMode ? 'bg-fuchsia-500' : 'bg-gray-700'}`}>
                                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableUtTrendUnlockMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-2">Unlocks multiple execution signals during an active UT Bot trend after the initial crossover. Recommended for Wave Riding along Orderbook Walls.</p>
                                                </div>
                                            </div>
                                        )}

                                        {(form.enableUtTrendFilter || form.enableUtEntryTrigger || form.enableUtTrailingSl) && (
                                            <div className="grid grid-cols-2 gap-4 animate-fadeIn bg-black/40 p-3 rounded-xl border border-fuchsia-500/20">
                                                <div className="col-span-2">
                                                    <label className="text-[10px] font-bold text-fuchsia-400 uppercase mb-1 block">UT Timeframe</label>
                                                    <select 
                                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-fuchsia-500 text-sm font-bold text-center" 
                                                        value={form.utBotTimeframe} 
                                                        onChange={(e) => handleFormChange('utBotTimeframe', e.target.value)}
                                                    >
                                                        <option value="1m">1 Minute</option>
                                                        <option value="3m">3 Minutes</option>
                                                        <option value="5m">5 Minutes</option>
                                                        <option value="15m">15 Minutes</option>
                                                        <option value="30m">30 Minutes</option>
                                                        <option value="1h">1 Hour</option>
                                                        <option value="4h">4 Hours</option>
                                                        <option value="1d">1 Day</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Sensitivity (Key)</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-fuchsia-500 text-sm font-bold text-center font-mono" 
                                                        value={form.utBotSensitivity} 
                                                        onChange={(e) => handleFormChange('utBotSensitivity', parseFloat(e.target.value))}
                                                        min={0.1}
                                                        step={0.1}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">ATR Period</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-fuchsia-500 text-sm font-bold text-center font-mono" 
                                                        value={form.utBotAtrPeriod} 
                                                        onChange={(e) => handleFormChange('utBotAtrPeriod', parseInt(e.target.value))}
                                                        min={1}
                                                        step={1}
                                                    />
                                                </div>
                                                <div className="col-span-2 flex items-center justify-between bg-white/5 p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleFormChange('utBotUseHeikinAshi', !form.utBotUseHeikinAshi)}>
                                                    <span className="text-[10px] font-black text-white uppercase tracking-wider">Use Heikin Ashi Candles</span>
                                                    <div className={`w-8 h-4 rounded-full p-0.5 flex items-center ${form.utBotUseHeikinAshi ? 'bg-fuchsia-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full transform transition-transform ${form.utBotUseHeikinAshi ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {form.enableUtEntryTrigger && (
                                            <div className="mt-4 bg-black/40 border border-fuchsia-500/20 rounded-xl p-4 shadow-lg animate-fadeIn">
                                                <h5 className="text-[11px] font-black text-fuchsia-400 uppercase tracking-widest mb-3 border-b border-fuchsia-500/20 pb-2">Entry Fakeout Protection</h5>
                                                
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between cursor-pointer group" onClick={() => handleFormChange('utBotCandleClose', !form.utBotCandleClose)}>
                                                        <div>
                                                            <span className="text-[10px] font-bold text-gray-200 uppercase block tracking-wider">Wait for Candle Close</span>
                                                            <span className="text-[9px] text-gray-500 mt-0.5 block">Wait until timeframe candle fully prints</span>
                                                        </div>
                                                        <div className={`w-10 h-5 rounded-full p-1 flex items-center transition-colors duration-200 ${form.utBotCandleClose ? 'bg-fuchsia-500' : 'bg-gray-700'}`}>
                                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.utBotCandleClose ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                        </div>
                                                    </div>

                                                    {!form.utBotCandleClose && (
                                                        <div className="animate-fadeIn bg-black/20 p-3 rounded-lg border border-white/5">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-[10px] font-bold text-gray-300 uppercase">Sustain Validation</span>
                                                                <span className="text-xs font-mono font-bold text-fuchsia-400">{form.utBotValidationSecs}s</span>
                                                            </div>
                                                            <input type="range" min="0" max="300" step="5" className="w-full h-1.5 accent-fuchsia-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.utBotValidationSecs} onChange={(e) => handleFormChange('utBotValidationSecs', parseInt(e.target.value))} />
                                                            <span className="text-[8px] text-gray-500 block mt-2 leading-tight">Wait time before executing to ensure signal doesn't vanish. Set to 0 for instant execution.</span>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between cursor-pointer group pt-3 border-t border-white/10 mt-2" onClick={() => handleFormChange('utBotRetestSnipe', !form.utBotRetestSnipe)}>
                                                        <div>
                                                            <span className="text-[10px] font-bold text-gray-200 uppercase block tracking-wider flex items-center gap-1.5">
                                                                Retest Snipe Limit
                                                                <span className="bg-fuchsia-500/20 text-fuchsia-400 text-[8px] px-1.5 py-0.5 rounded">Pro</span>
                                                            </span>
                                                            <span className="text-[9px] text-gray-500 mt-0.5 block">Place Limit order exactly at UT Support/Resistance</span>
                                                        </div>
                                                        <div className={`w-10 h-5 rounded-full p-1 flex items-center transition-colors duration-200 ${form.utBotRetestSnipe ? 'bg-fuchsia-500' : 'bg-gray-700'}`}>
                                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.utBotRetestSnipe ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* --- MODULAR SUPERTREND INTEGRATION --- */}
                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.enableSupertrendBot ? 'bg-sky-500/5 border-sky-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('enableSupertrendBot', !form.enableSupertrendBot)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.enableSupertrendBot ? 'bg-sky-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableSupertrendBot ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-2">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${form.enableSupertrendBot ? 'bg-sky-500/20 text-sky-400' : 'bg-white/5 text-gray-500'}`}>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-wider">Supertrend (PineScript)</h4>
                                                <p className="text-[10px] text-gray-400">Trend following signals based on ATR</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {form.enableSupertrendBot && (
                                    <div className="mt-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${form.enableSupertrendTrendFilter ? 'bg-sky-500/20 border-sky-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableSupertrendTrendFilter', !form.enableSupertrendTrendFilter)}>
                                                <p className="text-xs font-bold text-white uppercase">Trend Filter</p>
                                                <div className={`w-3 h-3 rounded-full ${form.enableSupertrendTrendFilter ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-gray-600'}`}></div>
                                            </div>
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${form.enableSupertrendEntryTrigger ? 'bg-sky-500/20 border-sky-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableSupertrendEntryTrigger', !form.enableSupertrendEntryTrigger)}>
                                                <p className="text-xs font-bold text-white uppercase">Entry Trigger</p>
                                                <div className={`w-3 h-3 rounded-full ${form.enableSupertrendEntryTrigger ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-gray-600'}`}></div>
                                            </div>
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${form.enableSupertrendTrailingSl ? 'bg-sky-500/20 border-sky-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableSupertrendTrailingSl', !form.enableSupertrendTrailingSl)}>
                                                <p className="text-xs font-bold text-white uppercase">Dynamic Trailing SL</p>
                                                <div className={`w-3 h-3 rounded-full ${form.enableSupertrendTrailingSl ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]' : 'bg-gray-600'}`}></div>
                                            </div>
                                            <div className={`p-3 rounded-xl border cursor-pointer transition-all ${form.enableSupertrendExit ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableSupertrendExit', !form.enableSupertrendExit)}>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-white uppercase">Reversal Dual-Exit</p>
                                                    <div className={`w-3 h-3 rounded-full ${form.enableSupertrendExit ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-gray-600'}`}></div>
                                                </div>
                                                <p className="text-[9px] text-gray-400 mt-1 leading-tight">Fallback to Market if Post-Only Exit unfills in time.</p>
                                            </div>
                                        </div>

                                        {form.enableSupertrendExit && (
                                            <div className="mb-4 animate-fadeIn bg-red-500/5 p-3 rounded-xl border border-red-500/20">
                                                <div className="flex justify-between items-end mb-1">
                                                    <label className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex justify-between w-full">
                                                        <span>Maker-to-Taker Exit Timeout</span>
                                                        <span className="text-xs font-mono text-white">{form.supertrendExitTimeout} Sec</span>
                                                    </label>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="1" 
                                                    max="60" 
                                                    step="1" 
                                                    className="w-full h-1.5 accent-red-500 bg-white/10 rounded-lg appearance-none cursor-pointer" 
                                                    value={form.supertrendExitTimeout} 
                                                    onChange={(e) => handleFormChange('supertrendExitTimeout', parseInt(e.target.value))} 
                                                />
                                            </div>
                                        )}

                                        {form.enableSupertrendEntryTrigger && (
                                            <div className="mb-4 animate-fadeIn">
                                                <div className={`p-3 rounded-xl border cursor-pointer transition-all ${form.enableSupertrendTrendUnlockMode ? 'bg-sky-500/20 border-sky-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('enableSupertrendTrendUnlockMode', !form.enableSupertrendTrendUnlockMode)}>
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-bold text-white uppercase flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                                            Trend Unlock Mode
                                                        </p>
                                                        <div className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors duration-200 ${form.enableSupertrendTrendUnlockMode ? 'bg-sky-500' : 'bg-gray-700'}`}>
                                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableSupertrendTrendUnlockMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-2">Unlocks multiple execution signals during an active Supertrend trend after the initial crossover. Recommended for Wave Riding along Orderbook Walls.</p>
                                                </div>
                                            </div>
                                        )}

                                        {(form.enableSupertrendTrendFilter || form.enableSupertrendEntryTrigger || form.enableSupertrendTrailingSl) && (
                                            <div className="grid grid-cols-2 gap-4 animate-fadeIn bg-black/40 p-3 rounded-xl border border-sky-500/20">
                                                <div className="col-span-2">
                                                    <label className="text-[10px] font-bold text-sky-400 uppercase mb-1 block">Supertrend Timeframe</label>
                                                    <select 
                                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-sky-500 text-sm font-bold text-center" 
                                                        value={form.supertrendTimeframe} 
                                                        onChange={(e) => handleFormChange('supertrendTimeframe', e.target.value)}
                                                    >
                                                        <option value="1m">1 Minute</option>
                                                        <option value="3m">3 Minutes</option>
                                                        <option value="5m">5 Minutes</option>
                                                        <option value="15m">15 Minutes</option>
                                                        <option value="30m">30 Minutes</option>
                                                        <option value="1h">1 Hour</option>
                                                        <option value="4h">4 Hours</option>
                                                        <option value="1d">1 Day</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">ATR Period</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-sky-500 text-sm font-bold text-center font-mono" 
                                                        value={form.supertrendPeriod} 
                                                        onChange={(e) => handleFormChange('supertrendPeriod', parseInt(e.target.value))}
                                                        min={1}
                                                        step={1}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">ATR Multiplier</label>
                                                    <input 
                                                        type="number"
                                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-sky-500 text-sm font-bold text-center font-mono" 
                                                        value={form.supertrendMultiplier} 
                                                        onChange={(e) => handleFormChange('supertrendMultiplier', parseFloat(e.target.value))}
                                                        min={0.1}
                                                        step={0.1}
                                                    />
                                                </div>
                                                <div className="col-span-2 flex items-center justify-between bg-white/5 p-2 rounded-lg cursor-pointer hover:bg-white/10 transition-colors mt-2 border-t border-white/10" onClick={() => handleFormChange('supertrendCandleClose', !form.supertrendCandleClose)}>
                                                    <div>
                                                        <span className="text-[10px] font-black text-white uppercase tracking-wider block">Wait for Candle Close</span>
                                                        <span className="text-[9px] text-gray-500 mt-0.5 block">Wait until timeframe candle fully prints</span>
                                                    </div>
                                                    <div className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors duration-200 ${form.supertrendCandleClose ? 'bg-sky-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.supertrendCandleClose ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-yellow-500/30 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                                    <div className="flex items-center justify-between cursor-pointer" onClick={(e) => { e.stopPropagation(); handleFormChange('enableDualEngine', !form.enableDualEngine); }}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${form.enableDualEngine ? 'bg-yellow-500/20 text-yellow-400' : 'bg-white/5 text-gray-500'}`}>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-wider">⚡ Dual Engine Command Center</h4>
                                                <p className="text-[10px] text-gray-400">Advanced multi-indicator confluence filters</p>
                                            </div>
                                        </div>
                                        <div className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors duration-300 ${form.enableDualEngine ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-gray-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transform transition-transform duration-300 ${form.enableDualEngine ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>

                                    {form.enableDualEngine && (
                                        <div className="mt-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-2 mb-4 p-1 bg-black/20 rounded-lg border border-white/5">
                                                {(['Classic', 'Hybrid', 'Legacy'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        onClick={() => handleFormChange('dualEngineMode', mode)}
                                                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${form.dualEngineMode === mode ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                                    >
                                                        {mode}
                                                    </button>
                                                ))}
                                            </div>
                                            {form.dualEngineMode === 'Classic' ? (
                                                <>
                                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                                                        <div className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${form.dualEngineEmaFilter ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('dualEngineEmaFilter', !form.dualEngineEmaFilter)}>
                                                            <p className="text-[9px] font-bold text-white uppercase text-center xl:whitespace-nowrap">EMA Trend</p>
                                                            <div className={`w-2.5 h-2.5 rounded-full ${form.dualEngineEmaFilter ? 'bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'bg-gray-600'}`}></div>
                                                        </div>
                                                        <div className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${form.dualEngineRsiFilter ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('dualEngineRsiFilter', !form.dualEngineRsiFilter)}>
                                                            <p className="text-[9px] font-bold text-white uppercase text-center xl:whitespace-nowrap">RSI Mom</p>
                                                            <div className={`w-2.5 h-2.5 rounded-full ${form.dualEngineRsiFilter ? 'bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'bg-gray-600'}`}></div>
                                                        </div>
                                                        <div className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${form.dualEngineMacdFilter ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('dualEngineMacdFilter', !form.dualEngineMacdFilter)}>
                                                            <p className="text-[9px] font-bold text-white uppercase text-center xl:whitespace-nowrap">MACD Cross</p>
                                                            <div className={`w-2.5 h-2.5 rounded-full ${form.dualEngineMacdFilter ? 'bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'bg-gray-600'}`}></div>
                                                        </div>
                                                        <div className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${form.dualEngineSqueezeFilter ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('dualEngineSqueezeFilter', !form.dualEngineSqueezeFilter)}>
                                                            <p className="text-[9px] font-bold text-white uppercase text-center xl:whitespace-nowrap">Squeeze</p>
                                                            <div className={`w-2.5 h-2.5 rounded-full ${form.dualEngineSqueezeFilter ? 'bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'bg-gray-600'}`}></div>
                                                        </div>
                                                        <div className={`p-2 rounded-xl border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${form.dualEngineCandleFilter ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-black/20 border-white/10'}`} onClick={() => handleFormChange('dualEngineCandleFilter', !form.dualEngineCandleFilter)}>
                                                            <p className="text-[9px] font-bold text-white uppercase text-center xl:whitespace-nowrap">Candles</p>
                                                            <div className={`w-2.5 h-2.5 rounded-full ${form.dualEngineCandleFilter ? 'bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]' : 'bg-gray-600'}`}></div>
                                                        </div>
                                                    </div>

                                                    {/* Settings Parameters Panel */}
                                                    <div className="space-y-3 bg-black/30 p-4 rounded-xl border border-white/5">
                                                        {form.dualEngineEmaFilter && (
                                                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-2 px-3 border border-yellow-500/10">
                                                                <span className="text-[10px] font-bold text-gray-300 uppercase">EMA Length</span>
                                                                <input type="number" className="bg-transparent text-right text-yellow-400 font-mono text-xs w-16 outline-none" value={form.dualEngineEmaLength} onChange={(e) => handleFormChange('dualEngineEmaLength', e.target.value)} />
                                                            </div>
                                                        )}
                                                        {form.dualEngineRsiFilter && (
                                                            <div className="flex gap-2">
                                                                <div className="flex-1 flex justify-between items-center bg-white/5 rounded-lg p-2 px-3 border border-yellow-500/10">
                                                                    <span className="text-[10px] font-bold text-gray-300 uppercase">RSI Len</span>
                                                                    <input type="number" className="bg-transparent text-right text-yellow-400 font-mono text-xs w-12 outline-none" value={form.dualEngineRsiLength} onChange={(e) => handleFormChange('dualEngineRsiLength', e.target.value)} />
                                                                </div>
                                                                <div className="flex-1 flex justify-between items-center bg-white/5 rounded-lg p-2 px-3 border border-yellow-500/10">
                                                                    <span className="text-[10px] font-bold text-gray-300 uppercase">OB/OS</span>
                                                                    <div className="flex items-center gap-1">
                                                                        <input type="number" className="bg-transparent text-right text-yellow-400 font-mono text-xs w-8 outline-none" value={form.dualEngineRsiOb} onChange={(e) => handleFormChange('dualEngineRsiOb', e.target.value)} />
                                                                        <span className="text-gray-500 text-[10px]">/</span>
                                                                        <input type="number" className="bg-transparent text-left text-yellow-400 font-mono text-xs w-8 outline-none" value={form.dualEngineRsiOs} onChange={(e) => handleFormChange('dualEngineRsiOs', e.target.value)} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {form.dualEngineMacdFilter && (
                                                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-2 px-3 border border-yellow-500/10">
                                                                <span className="text-[10px] font-bold text-gray-300 uppercase">MACD Fast / Slow / Signal</span>
                                                                <div className="flex items-center gap-2">
                                                                    <input type="number" className="bg-transparent text-center text-yellow-400 font-mono text-xs w-8 outline-none" value={form.dualEngineMacdFast} onChange={(e) => handleFormChange('dualEngineMacdFast', e.target.value)} />
                                                                    <input type="number" className="bg-transparent text-center text-yellow-400 font-mono text-xs w-8 outline-none" value={form.dualEngineMacdSlow} onChange={(e) => handleFormChange('dualEngineMacdSlow', e.target.value)} />
                                                                    <input type="number" className="bg-transparent text-center text-yellow-400 font-mono text-xs w-8 outline-none" value={form.dualEngineMacdSignal} onChange={(e) => handleFormChange('dualEngineMacdSignal', e.target.value)} />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {form.dualEngineSqueezeFilter && (
                                                            <div className="flex justify-between items-center bg-white/5 rounded-lg p-2 px-3 border border-yellow-500/10">
                                                                <span className="text-[10px] font-bold text-gray-300 uppercase">Squeeze Len / BB / KC</span>
                                                                <div className="flex items-center gap-2">
                                                                    <input type="number" className="bg-transparent text-center text-yellow-400 font-mono text-xs w-8 outline-none" value={form.dualEngineSqueezeLength} onChange={(e) => handleFormChange('dualEngineSqueezeLength', e.target.value)} />
                                                                    <input type="number" step="0.1" className="bg-transparent text-center text-yellow-400 font-mono text-xs w-10 outline-none" value={form.dualEngineSqueezeBbMult} onChange={(e) => handleFormChange('dualEngineSqueezeBbMult', e.target.value)} />
                                                                    <input type="number" step="0.1" className="bg-transparent text-center text-yellow-400 font-mono text-xs w-10 outline-none" value={form.dualEngineSqueezeKcMult} onChange={(e) => handleFormChange('dualEngineSqueezeKcMult', e.target.value)} />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!form.dualEngineEmaFilter && !form.dualEngineRsiFilter && !form.dualEngineMacdFilter && !form.dualEngineSqueezeFilter && (
                                                            <p className="text-center text-[10px] text-gray-500 uppercase">Enable filters to see parameters</p>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="bg-cyan-500/10 border border-cyan-500/20 p-3 rounded-lg flex items-start gap-3 mt-2 shadow-[0_0_15px_rgba(6,182,212,0.15)] animate-fadeIn">
                                                    <span className="text-cyan-400 text-lg leading-none mt-0.5">🧠</span>
                                                    <div>
                                                        <h4 className="text-cyan-300 text-[10px] font-bold uppercase tracking-wider mb-1">Macro Brain Active</h4>
                                                        <p className="text-[10px] text-cyan-200/80 leading-relaxed">
                                                            Bot will ignore Classic inputs and automatically score <strong>OBV, Market Structure, Momentum, and HTF trends</strong>. It strictly takes entries when the Overall Insight Score hits <strong>+4 or -4</strong>.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    )}
                                </div>
                            </div>
                    )}

                    {activeTab === 'risk' && (
                        <div className="animate-fadeIn space-y-4">

                            {/* --- RISK SL ORDER TYPE --- */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 items-center mb-2 shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] text-gray-400 font-bold uppercase">Risk Exit Execution Type (SL, TSL, Breakeven)</label>
                                    <p className="text-[9px] text-gray-500">How should stop losses execute? Note: Market is safest.</p>
                                </div>
                                <select 
                                    className="w-[200px] bg-black/40 border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-brand-primary text-xs font-bold" 
                                    value={form.slOrderType} 
                                    onChange={(e) => handleFormChange('slOrderType', e.target.value)}
                                >
                                    <option className="bg-[#0B1120]" value="market">Market (Safest)</option>
                                    <option className="bg-[#0B1120]" value="stop_limit">Stop-Limit (Slippage Bound)</option>
                                    <option className="bg-[#0B1120]" value="soft_limit">Soft Limit (Maker Try)</option>
                                    <option className="bg-[#0B1120]" value="limit">Limit (Strict Maker)</option>
                                </select>
                            </div>

                            {/* --- FUTURES SPECIFIC RISK SETTINGS --- */}
                            {tradingMode === 'futures' && (
                                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-4 mb-2">
                                    <div className="flex items-center justify-between cursor-pointer" onClick={() => handleFormChange('reduceOnly', !form.reduceOnly)}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.reduceOnly ? 'bg-orange-500' : 'bg-gray-700'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full transform transition-transform duration-200 ${form.reduceOnly ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                            </div>
                                            <div>
                                                <span className="text-xs font-black text-orange-400 uppercase block">Reduce-Only Orders</span>
                                                <span className="text-[9px] text-gray-400">Prevents SL/TP from opening reverse positions</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div className="flex justify-between items-end mb-1">
                                            <label className="text-[10px] font-bold text-orange-400/80 uppercase">Liquidation Distance Safety (%)</label>
                                            <span className="text-xs font-mono font-bold text-orange-400">{form.liquidationSafetyPct}%</span>
                                        </div>
                                        <input type="range" min="1.0" max="20.0" step="0.5" className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-orange-500 bg-white/10" value={form.liquidationSafetyPct} onChange={(e) => handleFormChange('liquidationSafetyPct', parseFloat(e.target.value))} />
                                        <p className="text-[9px] text-gray-500 mt-1.5">Bot will not enter if liquidation price is closer than this percentage.</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
                                    <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleFormChange('enableRiskSl', !form.enableRiskSl); }}>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Initial Stop-Loss</label>
                                        <div className={`w-8 h-4 rounded-full p-0.5 flex items-center ${form.enableRiskSl ? 'bg-brand-primary' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full transform transition-transform ${form.enableRiskSl ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                    {form.enableRiskSl ? (
                                        <div className="-mx-3 -mb-3 pt-2">
                                            <DualInput
                                                label="Risk Distance"
                                                valuePct={form.risk}
                                                onChangePct={(v: number) => handleFormChange('risk', v)}
                                                currentPrice={currentPrice}
                                                direction={tradeDirection}
                                                mode="stop_loss"
                                                precision={displayDigits}
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-gray-500 text-center py-4 font-mono">Disabled</div>
                                    )}
                                </div>
                                
                                <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
                                    <div className="flex items-center justify-between mb-3">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Trailing SL</label>
                                        <div className={`w-8 h-4 rounded-full p-0.5 flex items-center cursor-pointer ${form.enableTsl ? 'bg-brand-primary' : 'bg-gray-700'}`}
                                             onClick={(e) => { e.stopPropagation(); handleFormChange('enableTsl', !form.enableTsl); }}>
                                            <div className={`w-3 h-3 bg-white rounded-full transform transition-transform ${form.enableTsl ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                    {form.enableTsl ? (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[9px] text-gray-500 uppercase tracking-tighter mb-1 block">Trail Step Distance (%)</label>
                                                <input type="number" step="0.1" className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white outline-none focus:border-brand-primary text-center font-mono text-sm" value={form.tsl} onChange={(e) => handleFormChange('tsl', parseFloat(e.target.value))} />
                                            </div>
                                            <DualInput
                                                label="Start At Profit"
                                                valuePct={form.tslActivationPct}
                                                onChangePct={(v: number) => handleFormChange('tslActivationPct', v)}
                                                currentPrice={currentPrice}
                                                direction={tradeDirection}
                                                mode="take_profit"
                                                precision={displayDigits}
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-gray-500 text-center py-4 font-mono">Disabled</div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-brand-primary/30 transition-colors">
                                <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleFormChange('enablePartialTp', !form.enablePartialTp); }}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-6 rounded-full p-1 flex items-center ${form.enablePartialTp ? 'bg-brand-primary' : 'bg-gray-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${form.enablePartialTp ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-black text-white uppercase block">Scale-Out (Partial TP)</span>
                                        </div>
                                    </div>
                                </div>
                                {form.enablePartialTp && (
                                    <div className="flex gap-4 items-center animate-fadeIn p-3 bg-black/20 rounded-xl border border-white/5">
                                        <div className="flex-1">
                                            <DualInput
                                                label="Scale-Out Trigger"
                                                valuePct={form.partialTpTriggerPct}
                                                onChangePct={(v: number) => handleFormChange('partialTpTriggerPct', v)}
                                                currentPrice={currentPrice}
                                                direction={tradeDirection}
                                                mode="take_profit"
                                                precision={displayDigits}
                                            />
                                        </div>
                                        <div className="flex-1 flex flex-col justify-center bg-white/5 border border-white/10 rounded-xl p-3 shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase mb-3 block">Sell Position Amount (%)</label>
                                            <input type="number" step="1" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-brand-primary text-center font-mono text-[16px] transition-all" value={form.partialTp} onChange={(e) => handleFormChange('partialTp', parseFloat(e.target.value))} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* --- NEW: BREAKEVEN SL SECTION --- */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-emerald-500/30 transition-colors mt-4">
                                <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleFormChange('enableBreakevenSl', !form.enableBreakevenSl); }}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-6 rounded-full p-1 flex items-center ${form.enableBreakevenSl ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${form.enableBreakevenSl ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-black text-white uppercase block">Risk-Free (SL to Breakeven)</span>
                                            <span className="text-[9px] text-gray-500 uppercase mt-0.5 block">Moves Stop-Loss based on Profit Target</span>
                                        </div>
                                    </div>
                                </div>
                                {form.enableBreakevenSl && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4 items-center animate-fadeIn p-3 bg-black/20 rounded-xl border border-white/5">
                                            <DualInput
                                                label="Breakeven Trigger"
                                                valuePct={form.breakevenTriggerPct}
                                                onChangePct={(v: number) => handleFormChange('breakevenTriggerPct', v)}
                                                currentPrice={currentPrice}
                                                direction={tradeDirection}
                                                mode="take_profit"
                                                precision={displayDigits}
                                            />
                                            <DualInput
                                                label="Breakeven Target SL"
                                                valuePct={form.breakevenTargetPct}
                                                onChangePct={(v: number) => handleFormChange('breakevenTargetPct', v)}
                                                currentPrice={currentPrice}
                                                direction={tradeDirection}
                                                mode="take_profit"
                                                precision={displayDigits}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'advanced' && (
                        <div className="animate-fadeIn space-y-4">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-cyan-500/30 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                                <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleFormChange('enableMicroScalp', !form.enableMicroScalp); }}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-6 rounded-full p-1 flex items-center ${form.enableMicroScalp ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transform transition-transform ${form.enableMicroScalp ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">Micro-Scalp / Quick Bounce</span>
                                        </div>
                                    </div>
                                </div>
                                {form.enableMicroScalp && (
                                    <div className="p-3 bg-black/20 rounded-xl border border-white/5 space-y-4">
                                        <div className="flex gap-4 items-center">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Static Target (Ticks)</label>
                                                <input type="number" disabled={form.enableDynamicAtrScalp} className={`w-full border rounded-xl p-2.5 text-center transition-all outline-none ${form.enableDynamicAtrScalp ? 'bg-black/20 border-white/5 text-gray-600' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500'}`} value={form.microScalpProfitTicks} onChange={(e) => handleFormChange('microScalpProfitTicks', parseInt(e.target.value))} />
                                            </div>
                                        </div>
                                        
                                        <div className={`p-3 rounded-lg border transition-all ${form.enableDynamicAtrScalp ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-black/40 border-white/5 hover:border-white/20'}`}>
                                            <div className="flex items-center justify-between cursor-pointer" onClick={(e) => { e.stopPropagation(); handleFormChange('enableDynamicAtrScalp', !form.enableDynamicAtrScalp); }}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors flex items-center ${form.enableDynamicAtrScalp ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${form.enableDynamicAtrScalp ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1">
                                                        Dynamic ATR Targeting
                                                    </span>
                                                </div>
                                            </div>
                                            {form.enableDynamicAtrScalp && (
                                                <div className="mt-3 animate-fadeIn border-t border-white/5 pt-3 !cursor-auto" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex justify-between items-end mb-1">
                                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Take-Profit Range (ATR Multiplier)</label>
                                                        <span className="text-xs font-mono font-bold text-cyan-400">{form.microScalpAtrMultiplier}x</span>
                                                    </div>
                                                    <input type="range" min="0.1" max="3.0" step="0.1" className="w-full h-1.5 accent-cyan-500 bg-white/10 rounded-lg appearance-none cursor-pointer" value={form.microScalpAtrMultiplier} onChange={(e) => handleFormChange('microScalpAtrMultiplier', parseFloat(e.target.value))} />
                                                    <p className="text-[8px] text-gray-500 mt-2 italic leading-tight">
                                                        <strong className="text-cyan-500 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)] uppercase">Overrides Ticks!</strong> Target profit dynamically expands or shrinks based on {form.microScalpAtrMultiplier}x of rolling market volatility.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="Spoof Detect Time (Seconds)" value={form.spoofTime} onChange={(v: number) => setForm({ ...form, spoofTime: v })} step={0.5} />
                                <InputField label="Trailing SL Step (%)" value={form.tsl} onChange={(v: number) => setForm({ ...form, tsl: v })} step={0.1} />
                            </div>

                            {/* --- BTC CORRELATION FILTER SECTION --- */}
                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.enableBtcCorrelation ? 'bg-orange-500/5 border-orange-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('enableBtcCorrelation', !form.enableBtcCorrelation)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.enableBtcCorrelation ? 'bg-orange-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableBtcCorrelation ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">BTC Correlation Anti-Fakeout</span>
                                    </div>
                                </div>
                                {form.enableBtcCorrelation && (
                                    <div className="mt-3 pl-1 grid grid-cols-2 gap-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Correlation Threshold (Pearson)</label>
                                            <div className="flex gap-3 items-center">
                                                <input type="range" min="0.1" max="1.0" step="0.1" className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500" value={form.btcCorrelationThreshold} onChange={(e) => handleFormChange('btcCorrelationThreshold', parseFloat(e.target.value))} />
                                                <input type="number" step="0.1" className="w-20 bg-black/40 border border-white/10 rounded-xl p-1.5 text-white text-center font-mono text-sm" value={form.btcCorrelationThreshold} onChange={(e) => handleFormChange('btcCorrelationThreshold', parseFloat(e.target.value))} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Time Window (Mins)</label>
                                            <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-center font-mono" value={form.btcTimeWindow} onChange={(e) => handleFormChange('btcTimeWindow', parseInt(e.target.value))} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Min BTC Move (%)</label>
                                            <input type="number" step="0.05" className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-center font-mono" value={form.btcMinMovePct} onChange={(e) => handleFormChange('btcMinMovePct', parseFloat(e.target.value))} />
                                        </div>
                                        <p className="col-span-2 text-[9px] text-gray-500 mt-1 italic">Only enter trades if BTC aligns with the target asset's direction and has moved the minimum %.</p>
                                    </div>
                                )}
                            </div>

                            {/* --- ADAPTIVE TREND FILTER SECTION --- */}
                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.enableTrendFilter ? 'bg-indigo-500/5 border-indigo-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('enableTrendFilter', !form.enableTrendFilter)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.enableTrendFilter ? 'bg-indigo-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.enableTrendFilter ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">Adaptive Trend Filter</span>
                                    </div>
                                </div>
                                {form.enableTrendFilter && (
                                    <div className="mt-3 pl-1 grid grid-cols-2 gap-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Lookback Period</label>
                                            <input 
                                                type="number"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500 text-sm font-bold text-center font-mono" 
                                                value={form.trendFilterLookback} 
                                                onChange={(e) => handleFormChange('trendFilterLookback', parseInt(e.target.value))}
                                                min={20}
                                                max={2000}
                                                step={10}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Min. Confidence</label>
                                            <select 
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500 text-sm font-bold" 
                                                value={form.trendFilterThreshold} 
                                                onChange={(e) => handleFormChange('trendFilterThreshold', e.target.value)}
                                            >
                                                <option className="bg-[#0B1120]" value="Moderate">Moderate (0.7+)</option>
                                                <option className="bg-[#0B1120]" value="Moderately Strong">Moderately Strong (0.8+)</option>
                                                <option className="bg-[#0B1120]" value="Mostly Strong">Mostly Strong (0.9+)</option>
                                                <option className="bg-[#0B1120]" value="Strong">Strong (0.92+)</option>
                                                <option className="bg-[#0B1120]" value="Very Strong">Very Strong (0.94+)</option>
                                                <option className="bg-[#0B1120]" value="Exceptionally Strong">Exceptionally Strong (0.96+)</option>
                                                <option className="bg-[#0B1120]" value="Ultra Strong">Ultra Strong (0.98+)</option>
                                            </select>
                                        </div>
                                        <p className="col-span-2 text-[9px] text-gray-500 mt-1 italic">Only enter trades if log-scaled linear regression trend supports the trade direction.</p>
                                    </div>
                                )}
                            </div>

                            {/* --- VPVR SECTION --- */}
                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.vpvrEnabled ? 'bg-yellow-500/5 border-yellow-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('vpvrEnabled', !form.vpvrEnabled)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.vpvrEnabled ? 'bg-yellow-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.vpvrEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">VPVR High Volume Node Confirmation</span>
                                    </div>
                                </div>
                                {form.vpvrEnabled && (
                                    <div className="mt-3 pl-1 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Value Area Tolerance (%)</label>
                                        <div className="flex gap-3 items-center">
                                            <input type="range" min="0.05" max="2.0" step="0.05" className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-500" value={form.vpvrTolerance} onChange={(e) => handleFormChange('vpvrTolerance', parseFloat(e.target.value))} />
                                            <input type="number" step="0.05" className="w-20 bg-black/40 border border-white/10 rounded-xl p-1.5 text-white text-center font-mono text-sm" value={form.vpvrTolerance} onChange={(e) => handleFormChange('vpvrTolerance', parseFloat(e.target.value))} />
                                        </div>
                                        <p className="text-[9px] text-gray-500 mt-2 italic">Only enter trades if price is within this % of the Volume Profile High Volume Node.</p>
                                    </div>
                                )}
                            </div>

                            {/* --- ATR SECTION --- */}
                            <div className={`border rounded-xl p-4 transition-colors cursor-pointer ${form.atrEnabled ? 'bg-blue-500/5 border-blue-500/50' : 'bg-transparent border-white/10 hover:border-white/30'}`} onClick={() => handleFormChange('atrEnabled', !form.atrEnabled)}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-5 rounded-full p-1 transition-colors duration-200 flex items-center ${form.atrEnabled ? 'bg-blue-500' : 'bg-gray-700'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${form.atrEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-wider">ATR Volatility Based Stops</span>
                                    </div>
                                </div>
                                {form.atrEnabled && (
                                    <div className="mt-3 pl-1 grid grid-cols-2 gap-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">ATR Period</label>
                                            <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-center font-mono" value={form.atrPeriod} onChange={(e) => handleFormChange('atrPeriod', parseInt(e.target.value))} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Multiplier</label>
                                            <input type="number" step="0.1" className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white text-center font-mono" value={form.atrMultiplier} onChange={(e) => handleFormChange('atrMultiplier', parseFloat(e.target.value))} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* --- FOOTER ACTIONS --- */}
                <div className="pt-4 border-t border-white/10 mt-2 flex-shrink-0">
                    {errorMsg && (
                        <p className={`text-xs font-bold mb-3 animate-pulse text-center py-2 rounded-lg ${errorMsg.includes('Success') ? 'text-green-400 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
                            {errorMsg}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <button onClick={onClose} disabled={isLoading} className="w-[120px] bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold transition-colors">
                            CANCEL
                        </button>
                        <button
                            onClick={handleDeploy}
                            disabled={isLoading}
                            className={`flex-1 h-12 rounded-xl font-black text-white text-sm transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)] ${isLoading ? 'bg-gray-600 cursor-not-allowed opacity-70' : existingBot ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : tradingMode === 'futures' ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:scale-[1.02]' : 'bg-gradient-to-r from-yellow-400 to-orange-600 hover:scale-[1.02]'}`}
                        >
                            {isLoading ? 'PROCESSING...' : existingBot ? '⚙️ UPDATE CONFIGURATION' : tradingMode === 'futures' ? '⚡ DEPLOY FUTURE BOT' : '🚀 DEPLOY SNIPER'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InputField = ({ label, value, onChange, step = 1 }: any) => (
    <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">{label}</label>
        <input type="number" step={step} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-brand-primary" value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
);

const DualInput = ({ 
    label, 
    valuePct, 
    onChangePct, 
    currentPrice, 
    direction, 
    mode, 
    precision = 4 
}: any) => {
    // Internal state for the price input to avoid jitter
    const [priceStr, setPriceStr] = useState('');
    const [inputType, setInputType] = useState<'price' | 'gap'>('price');
    const [lastInputType, setLastInputType] = useState(inputType);

    useEffect(() => {
        let newPrice = currentPrice;
        const newDistance = (valuePct / 100) * currentPrice;

        if (mode === 'stop_loss') {
            newPrice = direction === 'long' 
                ? currentPrice * (1 - valuePct / 100)
                : currentPrice * (1 + valuePct / 100);
        } else {
            newPrice = direction === 'long'
                ? currentPrice * (1 + valuePct / 100)
                : currentPrice * (1 - valuePct / 100);
        }
        
        const forceUpdate = inputType !== lastInputType;
        if (forceUpdate) setLastInputType(inputType);

        if (inputType === 'price') {
            // Initialize or sync if drastically different (e.g. symbol changed)
            if (forceUpdate || !priceStr || Math.abs(parseFloat(priceStr) - newPrice) > (currentPrice * 0.001)) {
                setPriceStr(newPrice.toFixed(precision));
            }
        } else {
            if (forceUpdate || !priceStr || Math.abs(parseFloat(priceStr) - newDistance) > (currentPrice * 0.001)) {
                setPriceStr(newDistance.toFixed(precision));
            }
        }
    }, [valuePct, currentPrice, direction, mode, precision, priceStr, inputType, lastInputType]);

    const handlePriceChange = (e: any) => {
        const pStr = e.target.value;
        setPriceStr(pStr);
        const p = parseFloat(pStr);
        if (isNaN(p) || p <= 0 || currentPrice <= 0) return;

        let newPct = 0;
        if (inputType === 'price') {
            if (mode === 'stop_loss') {
                if (direction === 'long') newPct = (1 - (p / currentPrice)) * 100;
                else newPct = ((p / currentPrice) - 1) * 100;
            } else {
                if (direction === 'long') newPct = ((p / currentPrice) - 1) * 100;
                else newPct = (1 - (p / currentPrice)) * 100;
            }
        } else {
            // It's gap/distance
            newPct = (p / currentPrice) * 100;
        }
        
        if (newPct < 0.01) newPct = 0.01;
        if (newPct > 100 && mode === 'stop_loss') newPct = 100;
        
        onChangePct(parseFloat(newPct.toFixed(2)));
    };

    const toggleInputType = (e: React.MouseEvent) => {
        e.preventDefault();
        setInputType(prev => prev === 'price' ? 'gap' : 'price');
    };

    return (
        <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl p-3 focus-within:border-brand-primary transition-colors hover:bg-white/10">
            <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter flex items-center gap-1.5">
                    {label}
                    <span className="bg-black/40 px-1.5 py-0.5 rounded text-[8px] text-gray-500 font-mono">
                        {direction === 'long' ? 'LONG' : 'SHORT'}
                    </span>
                </label>
            </div>
            <div className="flex gap-2 items-center">
                <div className="relative flex-1 group">
                    <span 
                        className="absolute z-10 left-1 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[9px] cursor-pointer hover:text-white bg-black/50 hover:bg-black/80 px-1.5 py-1 rounded transition-all select-none border border-white/10 shadow-sm"
                        onClick={toggleInputType}
                        title={`Toggle input: currently entering ${inputType === 'price' ? 'Asset Price' : 'Spread Gap'}`}
                    >
                        {inputType === 'price' ? '$' : 'GAP'}
                    </span>
                    <input 
                        type="number" 
                        step={1 / Math.pow(10, precision)}
                        className={`w-full bg-black/40 border border-white/5 rounded-lg py-2 ${inputType === 'price' ? 'pl-8' : 'pl-10'} pr-2 text-white outline-none font-mono text-xs focus:border-brand-primary focus:bg-black transition-all`} 
                        value={priceStr} 
                        onChange={handlePriceChange} 
                        placeholder={inputType === 'price' ? 'Price' : 'Gap/Distance'}
                    />
                </div>
                <div className="text-gray-600 font-black">≈</div>
                <div className="relative w-24 group">
                    <input 
                        type="number" 
                        step="0.1" 
                        className="w-full bg-brand-primary/10 border border-brand-primary/30 rounded-lg py-2 pr-6 pl-2 text-brand-primary outline-none font-mono text-xs text-right focus:bg-brand-primary/20 focus:border-brand-primary transition-all" 
                        value={valuePct} 
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onChangePct(isNaN(val) ? 0 : val);
                            
                            // Re-sync Price String immediately
                            const valNum = isNaN(val) ? 0 : val;
                            if (inputType === 'price') {
                                let newPrice = currentPrice;
                                if (mode === 'stop_loss') {
                                    newPrice = direction === 'long' ? currentPrice * (1 - valNum / 100) : currentPrice * (1 + valNum / 100);
                                } else {
                                    newPrice = direction === 'long' ? currentPrice * (1 + valNum / 100) : currentPrice * (1 - valNum / 100);
                                }
                                setPriceStr(newPrice.toFixed(precision));
                            } else {
                                const newDistance = (valNum / 100) * currentPrice;
                                setPriceStr(newDistance.toFixed(precision));
                            }
                        }} 
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-primary font-mono text-xs group-focus-within:text-white transition-colors">%</span>
                </div>
            </div>
        </div>
    );
};
