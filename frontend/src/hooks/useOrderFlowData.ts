import { useState, useEffect } from 'react';
import api from '../services/api';
import { VPVRData } from '../components/features/market/VolumeProfileWidget';
import { CVDDataPoint } from '../components/features/market/CVDChart';
import { FootprintCandleData } from '../components/features/market/FootprintRenderer';
import { HeatmapDataPoint } from '../components/features/market/LiquidityHeatmapRenderer';

interface OrderFlowData {
    heatmapData: HeatmapDataPoint[];
    vpvrData: VPVRData[];
    cvdData: CVDDataPoint[];
    footprintData: FootprintCandleData[];
    loading: boolean;
    error: string | null;
}

export const useOrderFlowData = (symbol: string, exchange: string, interval: string): OrderFlowData => {
    const [heatmapData, setHeatmapData] = useState<HeatmapDataPoint[]>([]);
    const [vpvrData, setVpvrData] = useState<VPVRData[]>([]);
    const [cvdData, setCvdData] = useState<CVDDataPoint[]>([]);
    const [footprintData, setFootprintData] = useState<FootprintCandleData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        let activeFootprints: FootprintCandleData[] = [];
        const fetchOrderFlowData = async () => {
            if (!symbol || !exchange || !interval) return;

            setLoading(true);
            setError(null);

            try {
                const params = { symbol: symbol.toUpperCase(), exchange, interval, limit: 500 };

                // Fetch real historic klines and order book heatmap data
                const [klinesRes, heatmapRes] = await Promise.all([
                    api.get('/market-data/klines', { params }).catch(() => ({ data: [] })),
                    api.get('/market-depth/heatmap', { params: { symbol: symbol.toUpperCase(), exchange, bucket_size: 50.0, depth: 100 } }).catch(() => ({ data: { bids: [], asks: [] } }))
                ]);

                if (!isMounted) return;

                const rawKlines = klinesRes.data;
                const heatmap = heatmapRes.data?.bids ? [...heatmapRes.data.bids, ...heatmapRes.data.asks] : [];
                setHeatmapData(heatmap);

                if (rawKlines && rawKlines.length > 0) {
                    const parsedKlines = rawKlines.map((k: any) => ({
                        time: k[0] / 1000,
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5] || 0),
                    }));

                    // 1. Calculate realistic VPVR (Volume Profile Visible Range) from real klines
                    const minPrice = Math.min(...parsedKlines.map((c: any) => c.low));
                    const maxPrice = Math.max(...parsedKlines.map((c: any) => c.high));
                    const step = (maxPrice - minPrice) / 60;

                    const priceBuckets = new Map<number, { vol: number; buy: number; sell: number }>();
                    let currentCvd = 0;
                    const cvd: CVDDataPoint[] = [];
                    const footprints: FootprintCandleData[] = [];

                    // Calculate basic CVD and VPVR from klines for historical context
                    parsedKlines.forEach((c: any) => {
                        const range = c.high - c.low || 1;
                        const buyRatio = Math.max(0, Math.min(1, (c.close - c.low) / range));
                        const sellRatio = 1 - buyRatio;
                        const buyVol = c.volume * buyRatio;
                        const sellVol = c.volume * sellRatio;
                        
                        const delta = buyVol - sellVol;
                        currentCvd += delta;
                        cvd.push({ time: c.time as any, value: currentCvd });

                        const bucketPrice = Math.floor(c.close / step) * step;
                        const existing = priceBuckets.get(bucketPrice) || { vol: 0, buy: 0, sell: 0 };
                        
                        priceBuckets.set(bucketPrice, {
                            vol: existing.vol + c.volume,
                            buy: existing.buy + buyVol,
                            sell: existing.sell + sellVol
                        });

                        // 2. Simulate Footprint Ticks for Historical Data
                        const ticks: import('../components/features/market/FootprintRenderer').FootprintDataTick[] = [];
                        let tickStep = 0.5;
                        if (c.close < 0.1) tickStep = 0.0001;
                        else if (c.close < 1) tickStep = 0.001;
                        else if (c.close < 10) tickStep = 0.01;
                        else if (c.close < 100) tickStep = 0.1;
                        
                        // Roughly 5-10 ticks per candle
                        const roughTicks = Math.max(2, Math.floor(range / tickStep));
                        const tStep = range / roughTicks;
                        
                        let currentPrice = c.low;
                        while(currentPrice <= c.high) {
                            const bPrice = Math.floor(currentPrice / tickStep) * tickStep;
                            if(!ticks.find(t => t.price === bPrice)) {
                                ticks.push({
                                    price: bPrice,
                                    bidVolume: sellVol / roughTicks,
                                    askVolume: buyVol / roughTicks,
                                    isImbalance: false,
                                    imbalanceType: undefined,
                                    isStackedImbalance: false,
                                    isUnfinishedAuction: false,
                                    isAbsorption: false
                                });
                            }
                            currentPrice += tStep;
                            if (tStep === 0) break;
                        }
                        
                        // Post-process historic ticks
                        if (ticks.length > 0) {
                            ticks.sort((a,b) => b.price - a.price);
                            let totalVol = 0;
                            for (let i = 0; i < ticks.length; i++) {
                                totalVol += ticks[i].bidVolume + ticks[i].askVolume;
                            }
                            const avgTickVol = totalVol / ticks.length;

                            for (let i = 0; i < ticks.length; i++) {
                                const t = ticks[i];
                                t.isUnfinishedAuction = (i === 0 || i === ticks.length - 1) && t.bidVolume > 0 && t.askVolume > 0;
                                
                                t.isStackedImbalance = false;
                                if (t.isImbalance && t.imbalanceType) {
                                    if (i < ticks.length - 2) {
                                        const t2 = ticks[i + 1];
                                        const t3 = ticks[i + 2];
                                        if (t2.isImbalance && t3.isImbalance && 
                                            t.imbalanceType === (t2.bidVolume > t2.askVolume ? 'bid' : 'ask') && 
                                            t.imbalanceType === (t3.bidVolume > t3.askVolume ? 'bid' : 'ask')) {
                                                t.isStackedImbalance = true;
                                                t2.isStackedImbalance = true;
                                                t3.isStackedImbalance = true;
                                                t2.imbalanceType = t.imbalanceType;
                                                t3.imbalanceType = t.imbalanceType;
                                        }
                                    }
                                }
                                
                                const tVol = t.bidVolume + t.askVolume;
                                t.isAbsorption = tVol > (avgTickVol * 3.0) && tVol > 0;
                            }
                        }

                        let pocPrice = c.low;
                        let maxVol = 0;
                        let totalDelta = 0;

                        if (ticks.length > 0) {
                            for (let i = 0; i < ticks.length; i++) {
                                const tVol = ticks[i].bidVolume + ticks[i].askVolume;
                                totalDelta += (ticks[i].askVolume - ticks[i].bidVolume);
                                if (tVol > maxVol) {
                                    maxVol = tVol;
                                    pocPrice = ticks[i].price;
                                }
                            }
                        }

                        let isDivergent = false;
                        if (c.close > c.open && totalDelta < 0) isDivergent = true;
                        if (c.close < c.open && totalDelta > 0) isDivergent = true;

                        footprints.push({
                            time: c.time as any,
                            open: c.open,
                            close: c.close,
                            high: c.high,
                            low: c.low,
                            pocPrice: pocPrice,
                            totalDelta: totalDelta,
                            hasDeltaDivergence: isDivergent,
                            ticks: ticks
                        });
                    });

                    const vpvr: VPVRData[] = Array.from(priceBuckets.entries()).map(([price, data]) => ({
                        price,
                        volume: data.vol,
                        buyVolume: data.buy,
                        sellVolume: data.sell
                    }));

                    setVpvrData(vpvr);
                    setCvdData(cvd); // Pre-fill with historical data
                    
                    // Initialize active footprints array so WebSocket knows where to append
                    activeFootprints = footprints.slice(); 
                    setFootprintData(footprints); // Pre-fill with simulated historical footprint data
                } else {
                    setVpvrData([]);
                    setCvdData([]);
                    setFootprintData([]);
                }
            } catch (err) {
                console.error("Failed to fetch order flow data:", err);
                if (isMounted) setError("Failed to load order flow data.");
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchOrderFlowData();
        
        // WebSocket Connection for Order Flow (Real-Time CVD & Footprints)
        let ws: WebSocket | null = null;
        if (symbol) {
             const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
             // Vite proxy forwards paths starting with /ws to backend
             const wsUrl = `${protocol}//${window.location.host}/ws/market-data/${symbol}`;
             ws = new WebSocket(wsUrl);
             
             // defined inside useEffect instead so the historical fetch can modify it
             // activeFootprints has been declared outside and accessible (already defined in let above)
             
             ws.onmessage = (event) => {
                 try {
                     const data = JSON.parse(event.data);
                     
                     // Handle real-time trades
                     if (data.type === "trade" && Array.isArray(data.data)) {
                          let cvdDelta = 0;
                          const trades = data.data;
                          
                          // Align timestamp to the current candlestick interval
                          const nowMs = new Date().getTime();
                          let intervalMs = 60000; // default 1m
                          if (interval.endsWith('m')) intervalMs = parseInt(interval) * 60000;
                          else if (interval.endsWith('h')) intervalMs = parseInt(interval) * 3600000;
                          else if (interval.endsWith('d')) intervalMs = parseInt(interval) * 86400000;
                          
                          const currentCandleTime = Math.floor(nowMs / intervalMs) * (intervalMs / 1000);
                          const now = currentCandleTime; // Use bucketed time for both CVD and Footprint
                          
                          // Process each trade
                          trades.forEach((trade: any) => {
                               const amount = parseFloat(trade.amount);
                               const price = parseFloat(trade.price);
                               const isBuy = trade.type === 'buy';
                               
                               // 1. Update CVD (Buy = +, Sell = -)
                               cvdDelta += isBuy ? amount : -amount;
                               
                               // 2. Update Footprint
                               if (activeFootprints.length === 0 || activeFootprints[activeFootprints.length - 1].time !== now) {
                                   activeFootprints.push({
                                        time: now as any,
                                        open: price,
                                        close: price,
                                        high: price,
                                        low: price,
                                        pocPrice: price,
                                        totalDelta: 0,
                                        hasDeltaDivergence: false,
                                        ticks: []
                                   });
                               }
                               
                               const currentCandle = activeFootprints[activeFootprints.length - 1];
                               currentCandle.close = price;
                               if (price > currentCandle.high) currentCandle.high = price;
                               if (price < currentCandle.low) currentCandle.low = price;
                               
                               // Find or create tick bucket
                               const tickStep = 0.5; // Example tick size
                               const bucketPrice = Math.floor(price / tickStep) * tickStep;
                               let tick = currentCandle.ticks.find(t => t.price === bucketPrice);
                               
                               if (!tick) {
                                   tick = { price: bucketPrice, bidVolume: 0, askVolume: 0, isImbalance: false };
                                   currentCandle.ticks.push(tick);
                                   currentCandle.ticks.sort((a, b) => b.price - a.price); // Descending order
                               }
                               
                               if (isBuy) tick.askVolume += amount; // Buy hits Ask
                               else tick.bidVolume += amount;       // Sell hits Bid
                               
                               tick.isImbalance = Math.max(tick.bidVolume, tick.askVolume) > Math.min(tick.bidVolume, tick.askVolume) * 2;
                               tick.imbalanceType = tick.isImbalance ? (tick.bidVolume > tick.askVolume ? 'bid' : 'ask') : undefined;
                          });
                          
                          // Post-process current candle ticks for advanced footprint features
                          if (activeFootprints.length > 0) {
                              const currentCandle = activeFootprints[activeFootprints.length - 1];
                              const ticks = currentCandle.ticks;
                              if (ticks.length > 0) {
                                  let totalVol = 0;
                                  for (let i = 0; i < ticks.length; i++) {
                                      totalVol += ticks[i].bidVolume + ticks[i].askVolume;
                                  }
                                  const avgTickVol = totalVol / ticks.length;

                                  for (let i = 0; i < ticks.length; i++) {
                                      const t = ticks[i];
                                      
                                      // 1. Unfinished Auction Check (extreme top/bottom)
                                      if (i === 0 || i === ticks.length - 1) {
                                          t.isUnfinishedAuction = t.bidVolume > 0 && t.askVolume > 0;
                                      } else {
                                          t.isUnfinishedAuction = false;
                                      }

                                      // 2. Stacked Imbalance Check (3 consecutive)
                                      t.isStackedImbalance = false;
                                      if (t.isImbalance && t.imbalanceType) {
                                           if (i < ticks.length - 2) {
                                               const t2 = ticks[i + 1];
                                               const t3 = ticks[i + 2];
                                               if (t2.isImbalance && t3.isImbalance && 
                                                   t.imbalanceType === (t2.bidVolume > t2.askVolume ? 'bid' : 'ask') && 
                                                   t.imbalanceType === (t3.bidVolume > t3.askVolume ? 'bid' : 'ask')) {
                                                       t.isStackedImbalance = true;
                                                       t2.isStackedImbalance = true;
                                                       t3.isStackedImbalance = true;
                                                       t2.imbalanceType = t.imbalanceType;
                                                       t3.imbalanceType = t.imbalanceType;
                                               }
                                           }
                                      }

                                      // 3. Absorption Check (Volume > 3x average)
                                      const tVol = t.bidVolume + t.askVolume;
                                      t.isAbsorption = tVol > (avgTickVol * 3.0) && tVol > 0;
                                  }
                                  
                                  // 4. Calculate POC & Delta Divergence
                                  let pocPrice = currentCandle.low;
                                  let maxVol = 0;
                                  let totalDelta = 0;
                                  for (let i = 0; i < ticks.length; i++) {
                                      const tVol = ticks[i].bidVolume + ticks[i].askVolume;
                                      totalDelta += (ticks[i].askVolume - ticks[i].bidVolume);
                                      if (tVol > maxVol) {
                                          maxVol = tVol;
                                          pocPrice = ticks[i].price;
                                      }
                                  }
                                  currentCandle.pocPrice = pocPrice;
                                  currentCandle.totalDelta = totalDelta;
                                  
                                  let isDivergent = false;
                                  const cClose = currentCandle.close || currentCandle.low;
                                  const cOpen = currentCandle.open || currentCandle.low;
                                  if (cClose > cOpen && totalDelta < 0) isDivergent = true;
                                  if (cClose < cOpen && totalDelta > 0) isDivergent = true;
                                  currentCandle.hasDeltaDivergence = isDivergent;
                              }
                          }
                          
                          // Update State Batch
                          if (isMounted) {
                              setCvdData(prev => {
                                  if (prev.length === 0) {
                                      return [{ time: currentCandleTime as any, value: cvdDelta }];
                                  }
                                  
                                  const lastPoint = prev[prev.length - 1];
                                  if (lastPoint.time === currentCandleTime) {
                                      // Update current candle's CVD
                                      const newPrev = [...prev];
                                      newPrev[newPrev.length - 1] = { time: currentCandleTime as any, value: lastPoint.value + cvdDelta };
                                      return newPrev;
                                  } else {
                                      // Start new candle's CVD
                                      return [...prev.slice(-100), { time: currentCandleTime as any, value: lastPoint.value + cvdDelta }];
                                  }
                              });
                              setFootprintData([...activeFootprints.slice(-500)]);
                          }
                     }
                 } catch (e) {
                     console.error("WebSocket order flow parse error", e);
                 }
             };
        }

        return () => {
            isMounted = false;
            if (ws) {
                if (ws.readyState === WebSocket.CONNECTING) {
                    ws.onopen = () => ws?.close();
                } else if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            }
        };
    }, [symbol, exchange, interval]);

    return { heatmapData, vpvrData, cvdData, footprintData, loading, error };
};
