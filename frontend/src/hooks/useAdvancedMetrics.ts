import { useState, useEffect } from 'react';
import api from '../services/api';

export const useAdvancedMetrics = (symbol: string, exchange: string, interval: string) => {
    const [tpoData, setTpoData] = useState<any>(null);
    const [deltaProfile, setDeltaProfile] = useState<any[]>([]);
    const [tradeBubbles, setTradeBubbles] = useState<any[]>([]);
    const [oibData, setOibData] = useState<any>(null);
    const [spoofingData, setSpoofingData] = useState<any[]>([]);
    const [vwapData, setVwapData] = useState<any[]>([]);
    const [divergenceData, setDivergenceData] = useState<any[]>([]);
    const [footprintData, setFootprintData] = useState<any[]>([]);

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                // Fetch TPO (Using 5m interval for precision inside the main chart)
                const tpoRes = api.get('/advanced-metrics/tpo', {
                    params: { symbol, exchange, interval: "5m", limit: 200 }
                });
                
                // Fetch Delta Profile
                const deltaRes = api.get('/advanced-metrics/delta-profile', {
                    params: { symbol, exchange, limit: 1000 }
                });
                
                // Fetch Trade Bubbles
                const bubblesRes = api.get('/advanced-metrics/trade-bubbles', {
                    params: { symbol, exchange, limit: 1000 }
                });
                
                // Fetch OIB
                const oibRes = api.get('/advanced-metrics/oib-oscillator', {
                    params: { symbol, exchange }
                });
                
                // Fetch Spoofing
                const spoofingRes = api.get('/advanced-metrics/spoofing', {
                    params: { symbol, exchange }
                });
                
                // Fetch Anchored VWAP
                const vwapRes = api.get('/advanced-metrics/anchored-vwap', {
                    params: { symbol, exchange, limit: 200 }
                });
                
                // Fetch Delta Divergence
                const divRes = api.get('/advanced-metrics/delta-divergence', {
                    params: { symbol, exchange }
                });
                
                // Fetch Footprint Imbalances
                const footRes = api.get('/advanced-metrics/footprint-imbalances', {
                    params: { symbol, exchange, limit: 1000 }
                });

                const [tpo, delta, bubbles, oib, spoofing, vwap, divergence, footprint] = await Promise.allSettled([
                    tpoRes, deltaRes, bubblesRes, oibRes, spoofingRes, vwapRes, divRes, footRes
                ]);

                if (!isMounted) return;

                if (tpo.status === 'fulfilled' && tpo.value.data?.status === 'success') {
                    setTpoData(tpo.value.data.data);
                }
                
                if (delta.status === 'fulfilled' && delta.value.data?.status === 'success') {
                    setDeltaProfile(delta.value.data.data);
                }
                
                if (bubbles.status === 'fulfilled' && bubbles.value.data?.status === 'success') {
                    setTradeBubbles(bubbles.value.data.data);
                }
                
                if (oib.status === 'fulfilled' && oib.value.data?.status === 'success') {
                    setOibData(oib.value.data.data);
                }
                
                if (spoofing.status === 'fulfilled' && spoofing.value.data?.status === 'success') {
                    setSpoofingData(spoofing.value.data.data);
                }
                
                if (vwap.status === 'fulfilled' && vwap.value.data?.status === 'success') {
                    setVwapData(vwap.value.data.data);
                }
                
                if (divergence.status === 'fulfilled' && divergence.value.data?.status === 'success') {
                    setDivergenceData(divergence.value.data.data);
                }
                
                if (footprint.status === 'fulfilled' && footprint.value.data?.status === 'success') {
                    setFootprintData(footprint.value.data.data);
                }

            } catch (err) {
                console.warn('Error fetching Advanced Metrics:', err);
            }
        };

        fetchData();
        
        // Refresh every 10 seconds for dynamic metrics
        const refreshInterval = setInterval(fetchData, 10000);

        return () => {
            isMounted = false;
            clearInterval(refreshInterval);
        };
    }, [symbol, exchange, interval]);

    return { tpoData, deltaProfile, tradeBubbles, oibData, spoofingData, vwapData, divergenceData, footprintData };
};
