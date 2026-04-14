import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, DollarSign, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { manualTradeService, ApiKey, FastBalanceResponse, FastPositionResponse } from '../../../services/manualTradeService';

const MotionButton = motion.button as any;
const MotionDiv = motion.div as any;

interface ManualTradeModalProps {
  symbol: string;
  currentPrice: number;
}

export const ManualTradeModal: React.FC<ManualTradeModalProps> = ({ symbol, currentPrice }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [orderType, setOrderType] = useState<'Market' | 'Limit'>('Market');
  const [size, setSize] = useState<string>('');
  const [leverage, setLeverage] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedApi, setSelectedApi] = useState<string>('');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [balanceData, setBalanceData] = useState<FastBalanceResponse | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [tradeSide, setTradeSide] = useState<'Buy' | 'Sell'>('Buy');
  const [marginMode, setMarginMode] = useState<'cross' | 'isolated'>('isolated');
  const [reduceOnly, setReduceOnly] = useState<boolean>(false);
  const [isAutoLimit, setIsAutoLimit] = useState<boolean>(true);
  const [positionData, setPositionData] = useState<FastPositionResponse | null>(null);
  const [isLoadingPosition, setIsLoadingPosition] = useState(false);

  // Fetch API Keys
  React.useEffect(() => {
    const fetchKeys = async () => {
      try {
        const keys = await manualTradeService.getApiKeys();
        setApiKeys(keys);
        if (keys.length > 0) {
          setSelectedApi(keys[0].id.toString());
        }
      } catch (e) {
        console.error("Failed to load APIs", e);
      }
    };
    if (isOpen) fetchKeys();
  }, [isOpen]);

  // Fetch balance when selected API or symbol changes
  React.useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedApi || !isOpen) return;
      setIsLoadingBalance(true);
      setIsLoadingPosition(true);
      try {
        const data = await manualTradeService.getFastBalance(Number(selectedApi), symbol);
        setBalanceData(data);
      } catch (e) {
        setBalanceData(null);
      } finally {
        setIsLoadingBalance(false);
      }

      // Automatically try to fetch active position if it's a futures pair
      if (symbol.includes(':')) {
         try {
            const pos = await manualTradeService.getActivePosition(Number(selectedApi), symbol);
            setPositionData(pos);
         } catch(e) {
            setPositionData(null);
         } finally {
            setIsLoadingPosition(false);
         }
      } else {
         setIsLoadingPosition(false);
      }
    };
    fetchBalance();
  }, [selectedApi, symbol, isOpen]);

  // Determine if it is a futures pair (CCXT futures symbols usually contain a colon, e.g. BTC/USDT:USDT)
  const isFutures = symbol.includes(':');

  // For Limit orders
  const [limitPrice, setLimitPrice] = useState<string>(currentPrice ? currentPrice.toString() : '');

  // Update limit price placeholder when currentPrice changes if user hasn't typed
  React.useEffect(() => {
    if (orderType === 'Limit' && !limitPrice && currentPrice) {
      setLimitPrice(currentPrice.toString());
    }
  }, [currentPrice, orderType, limitPrice]);

  const handleTrade = async (side: 'Buy' | 'Sell') => {
    if (!size || isNaN(Number(size))) {
      toast.error('Please enter a valid size');
      return;
    }
    
    setIsSubmitting(true);
    // Simulate API call for now since backend route is not ready
    try {
      if (orderType === 'Limit' && !isAutoLimit && (!limitPrice || Number(limitPrice) <= 0)) {
        toast.error("Please enter a valid limit price or enable Auto Limit.");
        setIsSubmitting(false);
        return;
      }

      const paramsPayload: any = isFutures ? { leverage, marginMode, reduceOnly } : {};
      if (orderType === 'Limit' && isAutoLimit) {
         paramsPayload.autoBestLimit = true;
      }

      const payload = {
        symbol,
        side,
        type: orderType,
        amount: Number(size),
        price: orderType === 'Limit' ? (isAutoLimit ? 0 : Number(limitPrice)) : undefined,
        exchange_id: 'binance', // backend fallback
        api_key_id: selectedApi ? Number(selectedApi) : undefined,
        params: Object.keys(paramsPayload).length > 0 ? paramsPayload : undefined,
        client_timestamp: Date.now()
      };
      await manualTradeService.placeOrder(payload as any);
      toast.success(`Successfully placed ${side} ${orderType} order for ${symbol}`);
      setIsSubmitting(false);
      setIsOpen(false);
    } catch (error: any) {
      toast.error(`Failed to place order: ${error.message}`);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Action Button (above WallHunter button) */}
      <AnimatePresence>
        {!isOpen && (
          <MotionButton
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-[112px] right-8 w-16 h-16 rounded-full flex items-center justify-center bg-brand-primary hover:bg-blue-600 border border-blue-400/30 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)] backdrop-blur-md z-[100] transition-colors focus:outline-none group"
            title="Manual Trade"
          >
            <DollarSign className="w-8 h-8 group-hover:scale-110 transition-transform" />
          </MotionButton>
        )}
      </AnimatePresence>

      {/* Glassmorphism Modal */}
      <AnimatePresence>
        {isOpen && (
          <MotionDiv
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-[112px] right-8 w-80 rounded-2xl bg-[#0B1120]/80 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[100] overflow-hidden"
          >
            {/* Header (Drag area) */}
            <div 
              className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5 cursor-move active:cursor-grabbing"
            >
              <div className="flex flex-col pointer-events-none text-left">
                <span className="font-bold text-white text-lg tracking-wide leading-tight">{symbol}</span>
                <span className="text-[10px] uppercase tracking-wider text-brand-primary">Quick Trade • {isFutures ? 'Futures' : 'Spot'}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div 
              className="p-4 space-y-4 cursor-default"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Buy / Sell Tabs */}
              <div className="flex p-1 rounded-lg bg-black/40 border border-white/5 mb-2">
                <button
                  onClick={() => setTradeSide('Buy')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${
                    tradeSide === 'Buy' 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.15)]' 
                      : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {isFutures ? 'Long' : 'Buy'}
                </button>
                <button
                  onClick={() => setTradeSide('Sell')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${
                    tradeSide === 'Sell' 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.15)]' 
                      : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {isFutures ? 'Short' : 'Sell'}
                </button>
              </div>

              {/* API Account Selector */}
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                    <label className="text-xs text-gray-400 font-medium">Execute With</label>
                </div>
                <div className="relative">
                  <select 
                    value={selectedApi}
                    onChange={(e) => setSelectedApi(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-3 pr-8 text-white text-sm focus:outline-none focus:border-brand-primary/50 transition-colors appearance-none cursor-pointer hover:bg-black/60"
                  >
                    {apiKeys.map(k => (
                       <option key={k.id} value={k.id} className="bg-[#0B1120]">
                           {k.name || k.label || k.key_name || `${k.exchange} - Key`}
                       </option>
                    ))}
                    {apiKeys.length === 0 && <option value="" disabled>No API Keys found</option>}
                  </select>
                  <ChevronDown className="absolute right-3 top-[10px] w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              {/* Order Type Toggle */}
              <div className="flex p-1 rounded-lg bg-black/40 border border-white/5">
                {(['Market', 'Limit'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all uppercase tracking-wider ${
                      orderType === type 
                        ? 'bg-brand-primary text-white shadow-sm' 
                        : 'text-gray-500 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Price (if limit) */}
              <AnimatePresence>
                {orderType === 'Limit' && (
                  <MotionDiv 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    {/* Switch: Auto Best Limit */}
                    <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-brand-primary/20 cursor-pointer" onClick={() => setIsAutoLimit(!isAutoLimit)}>
                       <div className="flex flex-col">
                          <span className="text-xs font-bold text-brand-primary">Auto Best Limit (Post-Only)</span>
                          <span className="text-[10px] text-gray-500">Snipes entry at Best Bid/Ask without Taker Fees</span>
                       </div>
                       <div className={`relative w-8 h-4 rounded-full transition-colors ${isAutoLimit ? 'bg-brand-primary' : 'bg-gray-600'}`}>
                          <MotionDiv 
                             className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full"
                             animate={{ x: isAutoLimit ? 16 : 0 }}
                             transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                       </div>
                    </div>

                    {!isAutoLimit && (
                        <div className="space-y-1">
                          <label className="text-xs text-gray-400 font-medium">Limit Price</label>
                          <div className="relative">
                            <input 
                              type="number"
                              value={limitPrice}
                              disabled={isAutoLimit}
                              onChange={(e) => setLimitPrice(e.target.value)}
                              className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 pl-8 text-white text-sm focus:outline-none focus:border-brand-primary/50 transition-colors disabled:opacity-50"
                            />
                            <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
                          </div>
                        </div>
                    )}
                  </MotionDiv>
                )}
              </AnimatePresence>

              {/* Size */}
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                    <label className="text-xs text-gray-400 font-medium">Order Size ({balanceData ? (balanceData.base || symbol.split('/')[0]) : symbol.split('/')[0]})</label>
                    <span className="text-[10px] text-gray-500 text-right">
                       Balance: <span className="text-gray-300">
                          {isLoadingBalance ? "..." : balanceData ? (
                             isFutures ? `${(balanceData.quote_free || 0).toFixed(2)} ${balanceData.quote || 'USDT'}` :
                             tradeSide === 'Buy' ? `${(balanceData.quote_free || 0).toFixed(2)} ${balanceData.quote || 'USDT'}` :
                             `${(balanceData.base_free || 0).toFixed(4)} ${balanceData.base || symbol.split('/')[0]}`
                          ) : "N/A"}
                       </span>
                       {isFutures && reduceOnly && (
                          <div className="text-[10px] text-brand-primary">
                             Pos: {isLoadingPosition ? "..." : (positionData && positionData.amount > 0 ? `${positionData.amount} (${positionData.side.toUpperCase()})` : "0")}
                          </div>
                       )}
                    </span>
                </div>
                <div className="relative">
                  <input 
                    type="number"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 pl-8 text-white text-sm focus:outline-none focus:border-brand-primary/50 transition-colors"
                  />
                  <DollarSign className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
                </div>
                {/* Size % buttons */}
                <div className="flex justify-between mt-2 gap-2">
                  {['25%', '50%', '75%', '100%'].map(pct => (
                    <button 
                        key={pct} 
                        className="flex-1 py-1 text-[10px] font-bold rounded border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                        onClick={() => {
                          if (balanceData && currentPrice > 0) {
                            const percentage = Number(pct.replace('%','')) / 100;
                            let maxTokens = 0;
                            
                            if (isFutures) {
                               if (reduceOnly && positionData && positionData.amount > 0) {
                                  // contextual sizing: calculation based on active open position size
                                  maxTokens = positionData.amount;
                               } else {
                                  maxTokens = ((balanceData.quote_free || 0) * leverage) / currentPrice;
                               }
                            } else if (tradeSide === 'Buy') {
                               maxTokens = (balanceData.quote_free || 0) / currentPrice;
                            } else {
                               maxTokens = balanceData.base_free || 0;
                            }
                            
                            const val = maxTokens * percentage;
                            // truncate to 4 decimals to avoid precision errors
                            const formattedVal = Math.floor(val * 10000) / 10000;
                            setSize(formattedVal.toString());
                          }
                        }}
                    >
                      {pct}
                    </button>
                  ))}
                </div>
              </div>

              {/* Futures Options Panel */}
              {isFutures && (
                <div className="space-y-3 bg-black/20 p-3 rounded-lg border border-white/5">
                  {/* Margin Mode & Leverage Header */}
                  <div className="flex justify-between items-center text-xs text-gray-400 font-medium">
                    <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
                        <button 
                          onClick={() => setMarginMode('cross')}
                          className={`px-2 py-0.5 rounded transition-colors ${marginMode === 'cross' ? 'bg-brand-primary text-white font-bold' : 'hover:text-white'}`}
                        >
                          Cross
                        </button>
                        <button 
                          onClick={() => setMarginMode('isolated')}
                          className={`px-2 py-0.5 rounded transition-colors ${marginMode === 'isolated' ? 'bg-brand-primary text-white font-bold' : 'hover:text-white'}`}
                        >
                          Isolated
                        </button>
                    </div>
                    <span className="text-xs bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded font-mono font-bold tracking-wider">{leverage}x</span>
                  </div>
                  
                  {/* Leverage Slider */}
                  <input 
                    type="range" 
                    min="1" 
                    max="125" 
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="w-full accent-brand-primary h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer"
                  />

                  {/* Reduce Only Checkbox */}
                  <label className="flex items-center space-x-2 cursor-pointer group w-max">
                    <input 
                       type="checkbox" 
                       checked={reduceOnly}
                       onChange={(e) => setReduceOnly(e.target.checked)}
                       className="form-checkbox bg-black/40 border-white/20 text-brand-primary rounded focus:ring-0 focus:ring-offset-0 cursor-pointer w-4 h-4"
                    />
                    <span className="text-xs text-gray-400 group-hover:text-white transition-colors">Reduce Only (Close Position)</span>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => handleTrade(tradeSide)}
                  disabled={isSubmitting}
                  className={`flex-1 py-3 px-4 rounded-xl font-bold flex flex-col items-center justify-center transition-all disabled:opacity-50 group border ${
                     tradeSide === 'Buy' 
                       ? 'bg-green-500/20 hover:bg-green-500 text-green-400 hover:text-white border-green-500/50 hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                       : 'bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {tradeSide === 'Buy' ? <TrendingUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" /> : <TrendingDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />}
                    <span className="text-sm uppercase tracking-wider">Execute {isFutures ? (tradeSide === 'Buy' ? 'Long' : 'Short') : tradeSide}</span>
                  </div>
                </button>
              </div>
            </div>
            
            {/* Footer Status */}
            <div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center justify-center">
              <span className="text-[10px] text-gray-500 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2 animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]"></span>
                Secure Execution via API
              </span>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </>
  );
};
