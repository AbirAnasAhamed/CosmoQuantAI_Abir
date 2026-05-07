import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { manualTradeService, ApiKey, FastBalanceResponse } from '../../../services/manualTradeService';
import { DollarSign, Wallet } from 'lucide-react';

interface QuickTradeToolbarProps {
  symbol: string;
  currentPrice: number | null;
  onDragStart: (side: 'Buy' | 'Sell') => void;
  onDragMove: (y: number) => void;
  onDragEnd: (side: 'Buy' | 'Sell', y: number, size: string, apiId: string) => void;
  isFullscreen?: boolean;
}

export const QuickTradeToolbar: React.FC<QuickTradeToolbarProps> = ({
  symbol,
  currentPrice,
  onDragStart,
  onDragMove,
  onDragEnd,
  isFullscreen
}) => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedApi, setSelectedApi] = useState<string>('');
  const [balanceData, setBalanceData] = useState<FastBalanceResponse | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  
  const [percentage, setPercentage] = useState<number>(0);
  const [dragState, setDragState] = useState<{ side: 'Buy' | 'Sell', x: number, y: number } | null>(null);
  
  const dragControls = useDragControls();
  
  const baseCurrency = symbol.split('/')[0] || 'BASE';
  const quoteCurrency = symbol.split('/')[1]?.split(':')[0] || 'USDT';
  const isFutures = symbol.includes(':');

  useEffect(() => {
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
    fetchKeys();
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedApi) return;
      setIsLoadingBalance(true);
      try {
        const data = await manualTradeService.getFastBalance(Number(selectedApi), symbol);
        setBalanceData(data);
      } catch (e) {
        setBalanceData(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };
    fetchBalance();
    
    // Auto-refresh balance every 10 seconds
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [selectedApi, symbol]);

  // Calculate order size based on percentage and balance
  const getOrderSize = (side: 'Buy' | 'Sell'): string => {
    if (!balanceData || percentage === 0) return '0';
    
    if (side === 'Buy' || isFutures) {
      // Using Quote Currency (USDT)
      const free = balanceData.quote_free || 0;
      const budget = free * (percentage / 100);
      // For size, we convert budget to token amount if needed, or just send budget if it's market. 
      // Wait, Limit orders usually require the token amount, not quote amount!
      // But if user drags a price, we don't know the exact price until drop.
      // So we can compute the approximate token amount using currentPrice.
      if (!currentPrice || currentPrice <= 0) return '0';
      const tokenAmount = budget / currentPrice;
      return tokenAmount.toFixed(4);
    } else {
      // Spot Sell: Using Base Currency (e.g. DOGE)
      const free = balanceData.base_free || 0;
      const tokenAmount = free * (percentage / 100);
      return tokenAmount.toFixed(4);
    }
  };

  const getDollarValue = (): number => {
    if (!balanceData || percentage === 0) return 0;
    
    // For Spot Sell
    if (!isFutures && balanceData.base_free > 0 && currentPrice) {
      // In Spot, if they only have Base, show Base value in USD
      // Actually, let's keep it simple: Show how much of Quote they are using
      return (balanceData.quote_free || 0) * (percentage / 100);
    }
    
    return (balanceData.quote_free || 0) * (percentage / 100);
  };

  // Drag Handlers
  const handlePointerDown = (e: React.PointerEvent, side: 'Buy' | 'Sell') => {
    e.preventDefault();
    if (!selectedApi) return;
    if (percentage === 0) {
      // Default to 50% if they didn't select
      setPercentage(50);
    }
    
    onDragStart(side);
    setDragState({ side, x: e.clientX, y: e.clientY });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setDragState({ side, x: moveEvent.clientX, y: moveEvent.clientY });
      onDragMove(moveEvent.clientY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      setDragState(null);
      // Re-calculate size right before drop to ensure it's fresh
      // Since percentage is in closure, we use a ref or just recalculate
      const finalSize = getOrderSize(side); // Uses current state
      onDragEnd(side, upEvent.clientY, finalSize, selectedApi);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // If no API keys, don't show the toolbar
  if (apiKeys.length === 0) return null;

  return (
    <>
      {/* Ghost Pill that follows the mouse */}
      {dragState && (
        <div 
          className={`fixed pointer-events-none z-[9999] px-3 py-1.5 rounded-full font-bold text-xs uppercase tracking-wider text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] border flex items-center gap-1 ${
            dragState.side === 'Buy' 
              ? 'bg-green-500/80 border-green-400 shadow-[0_0_15px_rgba(34,197,94,0.5)]' 
              : 'bg-red-500/80 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
          }`}
          style={{ 
            left: dragState.x, 
            top: dragState.y,
            transform: 'translate(-50%, -50%)' // Center on mouse
          }}
        >
          {dragState.side} {percentage > 0 ? `${percentage}%` : ''} 
          <span className="opacity-70 text-[10px] ml-1">DROP TO LIMIT</span>
        </div>
      )}

      {/* Main Toolbar */}
      <motion.div 
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        className={`fixed right-8 top-1/2 -translate-y-1/2 z-[999] flex flex-col items-center gap-2 bg-[#000000]/80 backdrop-blur-xl border border-white/10 rounded-2xl py-3 px-2 w-[72px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]`}
      >
        {/* Drag Handle */}
        <div 
          className="w-full flex flex-col justify-center items-center pt-2 pb-1 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-100 transition-opacity"
          onPointerDown={(e) => dragControls.start(e)}
          title="Drag Toolbar"
        >
          <div className="w-5 h-1 bg-white rounded-full mb-1" />
          <div className="w-5 h-1 bg-white rounded-full" />
        </div>

        {/* Minimize Toggle */}
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className="w-full flex justify-center pb-2 opacity-50 hover:opacity-100 text-white transition-opacity"
          title={isMinimized ? "Expand" : "Minimize"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isMinimized ? 'rotate-90' : '-rotate-90'}`}>
             <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>

        <AnimatePresence initial={false}>
          {!isMinimized && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-2 overflow-hidden w-full"
            >
              {/* Balance Indicator */}
              <div className="flex flex-col items-center gap-1 border-b border-white/10 pb-2 mb-1 cursor-help" title={`Quote Balance: ${(balanceData?.quote_free || 0).toFixed(2)} ${quoteCurrency}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${isLoadingBalance ? 'border-brand-primary/50 text-brand-primary animate-pulse' : 'border-white/20 text-gray-400 hover:text-white hover:border-white/40'}`}>
                  <Wallet className="w-4 h-4" />
                </div>
              </div>

              {/* Percentages */}
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  onClick={() => setPercentage(pct)}
                  className={`w-12 h-10 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center ${
                    percentage === pct 
                      ? 'bg-brand-primary text-white shadow-[0_0_10px_rgba(99,102,241,0.5)] border-transparent scale-105' 
                      : 'bg-black/40 text-gray-400 border border-white/10 hover:text-white hover:border-white/30 hover:bg-white/5'
                  }`}
                >
                  {pct}%
                </button>
              ))}

              {/* Selected Value Hint */}
              <div className="text-[8px] text-center font-mono text-gray-500 my-1 min-h-[12px]">
                {percentage > 0 ? `$${getDollarValue().toFixed(0)}` : 'Size'}
              </div>

              {/* Draggable Buy */}
              <div 
                className="w-12 h-10 rounded-xl bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500 hover:text-white transition-all flex flex-col items-center justify-center cursor-grab active:cursor-grabbing group shadow-[0_0_10px_rgba(34,197,94,0.15)]"
                title="Drag to place Buy Limit"
                onPointerDown={(e) => handlePointerDown(e, 'Buy')}
              >
                <span className="text-[10px] font-black uppercase tracking-widest">Buy</span>
              </div>

              {/* Draggable Sell */}
              <div 
                className="w-12 h-10 rounded-xl bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-white transition-all flex flex-col items-center justify-center cursor-grab active:cursor-grabbing group shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                title="Drag to place Sell Limit"
                onPointerDown={(e) => handlePointerDown(e, 'Sell')}
              >
                <span className="text-[10px] font-black uppercase tracking-widest">Sell</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};
