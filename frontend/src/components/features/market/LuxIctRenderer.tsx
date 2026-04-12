import React, { useEffect, useRef } from 'react';
import { ISeriesApi, Time } from 'lightweight-charts';
import { LuxIctConfigs, LuxIctResult } from '../../../utils/luxIctConcepts';

interface LuxIctRendererProps {
    chart: any;
    series: ISeriesApi<"Candlestick"> | null;
    luxIctData: LuxIctResult | null;
    configs: LuxIctConfigs;
    visibleLogicalRange: any;
}

export const LuxIctRenderer: React.FC<LuxIctRendererProps> = ({ chart, series, luxIctData, configs, visibleLogicalRange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const drawRequested = useRef<boolean>(false);

    const requestDraw = () => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                draw();
            });
        }
    };

    const configsRef = useRef(configs);
    const luxDataRef = useRef(luxIctData);

    useEffect(() => {
        configsRef.current = configs;
        luxDataRef.current = luxIctData;
    }, [configs, luxIctData]);

    const draw = () => {
        const currentConfigs = configsRef.current;
        const currentData = luxDataRef.current;

        if (!chart || !series || !currentData || !currentConfigs.luxShowIndicator) return;

        const paneElement = chart.chartElement();

        if (!containerRef.current) {
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.top = '0';
            div.style.left = '0';
            div.style.width = '100%';
            div.style.height = '100%';
            div.style.pointerEvents = 'none';
            div.style.zIndex = '5';
            paneElement.appendChild(div);
            (containerRef as any).current = div;
        }
        
        const container = containerRef.current;
        if (!container) return;

        if (!canvasRef.current) {
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            container.appendChild(canvas);
            (canvasRef as any).current = canvas;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Sync canvas size
        const clientRect = container.getBoundingClientRect();
        if (canvas.width !== clientRect.width || canvas.height !== clientRect.height) {
            canvas.width = clientRect.width;
            canvas.height = clientRect.height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let timeScale;
        try {
            timeScale = chart.timeScale();
            series.priceScale(); // Check to ensure it doesn't throw during coordinate translation
        } catch (e) {
            return;
        }
        
        if (!timeScale) return;

        // Helper to convert time -> x
        const getX = (time: any) => {
            let tsTime = time;
            // Native Lightweight charts time resolution check
            if (typeof time === 'number' && time > 10000000000) {
                tsTime = Math.floor(time / 1000) as Time;
            }
            const coord = timeScale.timeToCoordinate(tsTime);
            return coord !== null ? coord : -1;
        };
        // Helper to convert price -> y
        const getY = (price: number) => {
            const coord = series.priceToCoordinate(price);
            return coord !== null ? coord : -1;
        };

        // Helper to draw fibonacci levels
        const drawFib = (x1: number, x2: number, yt: number, yb: number, color: string, modeType: string) => {
            if (currentConfigs.fibMode !== modeType) return;
            const rightX = currentConfigs.fibExtend ? canvas.width : x2;

            // 0.5 (50% Equilibrium)
            const yMid = (yt + yb) / 2;
            ctx.beginPath();
            ctx.moveTo(x1, yMid);
            ctx.lineTo(rightX, yMid);
            ctx.strokeStyle = color;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]); // Reset
            
            ctx.font = '8px Arial';
            ctx.fillStyle = color;
            ctx.textAlign = 'right';
            ctx.fillText('0.5/EQ', rightX - 2, yMid - 2);
        };

        // --- DRAWING LOGIC ---

        // 1. Draw MSS & BOS (ZigZag Lines)
        if (currentConfigs.showMSS || currentConfigs.showBOS) {
            currentData.msLines.forEach(line => {
                const x1 = getX(line.x1);
                const x2 = getX(line.x2);
                const y = getY(line.y);
                if (x1 !== -1 && x2 !== -1 && y !== -1) {
                    ctx.beginPath();
                    ctx.moveTo(x1, y);
                    ctx.lineTo(x2, y);
                    ctx.strokeStyle = line.dir === 'bull' ? '#00e6a1' : '#e60400';
                    ctx.setLineDash([2, 4]); // Dotted line
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Text
                    ctx.font = '10px Arial';
                    ctx.fillStyle = line.dir === 'bull' ? '#00e6a1' : '#e60400';
                    ctx.textAlign = 'center';
                    ctx.fillText(line.type, (x1 + x2) / 2, line.dir === 'bull' ? y + 12 : y - 4);
                }
            });
            ctx.setLineDash([]); // Reset
        }

        // 2. Draw Volume Imbalances (VI)
        if (currentConfigs.showVIMB) {
            currentData.vimbs.forEach(vimb => {
                const x1 = getX(vimb.x1);
                // Draw 4 bars forward statically
                const x2 = x1 + 20; 
                const yt = getY(vimb.top);
                const yb = getY(vimb.bottom);
                if (x1 !== -1 && yt !== -1 && yb !== -1) {
                     ctx.fillStyle = '#06b2d030';
                     ctx.fillRect(x1, yt, x2 - x1, yb - yt);
                     ctx.strokeStyle = '#06b2d080';
                     ctx.strokeRect(x1, yt, x2 - x1, yb - yt);
                     drawFib(x1, x2, yt, yb, '#06b2d0', 'VI');
                }
            });
        }

        // 3. Draw Order Blocks (OB)
        if (currentConfigs.showOB) {
            currentData.obs.forEach(ob => {
                const x1 = getX(ob.left);
                const x2 = Math.max(x1 + 10, getX(ob.right));
                const yt = getY(ob.top);
                const yb = getY(ob.bottom);
                
                if (x1 !== -1 && yt !== -1 && yb !== -1 && x2 !== -1) {
                     const colorStr = ob.type === 'bull' ? '#3e89fa' : '#FF3131';
                     ctx.fillStyle = ob.type === 'bull' 
                        ? (ob.breaker ? '#4785f920' : '#3e89fa30')
                        : (ob.breaker ? '#f9ff5720' : '#FF313130');

                     ctx.fillRect(x1, yt, x2 - x1, yb - yt);

                     if (currentConfigs.showOBLabels) {
                         ctx.font = '9px Arial';
                         ctx.fillStyle = colorStr;
                         ctx.textAlign = 'left';
                         ctx.fillText(`OB ${ob.breaker ? 'BRK' : ''}`, x1 + 2, yt - 4);
                     }
                     drawFib(x1, x2, yt, yb, colorStr, 'OB');
                }
            });
        }

        // 4. Draw Liquidity (EqH / EqL)
        if (currentConfigs.showLiq) {
            currentData.liqs.forEach(liq => {
                const x1 = getX(liq.left);
                const x2 = Math.max(x1 + 10, getX(liq.right));
                const yt = getY(liq.top);
                const yb = getY(liq.bottom);

                if (x1 !== -1 && x2 !== -1 && yt !== -1 && yb !== -1) {
                     const colorStr = liq.type === 'buyside' ? '#fa451c' : '#1ce4fa';
                     ctx.fillStyle = liq.type === 'buyside' ? (liq.broken ? '#fa451c80' : '#fa451c10') : (liq.broken ? '#1ce4fa80' : '#1ce4fa10');
                     ctx.fillRect(x1, yt, x2 - x1, yb - yt);

                     ctx.font = '9px Arial';
                     ctx.fillStyle = colorStr;
                     ctx.textAlign = 'left';
                     ctx.fillText(liq.type === 'buyside' ? 'Buyside Liquidity' : 'Sellside Liquidity', x1 + 2, yt - 4);
                     drawFib(x1, x2, yt, yb, colorStr, 'Liq');
                }
            });
        }

        // 5. Draw FVGs
        if (currentConfigs.showFVG) {
             currentData.fvgs.forEach(fvg => {
                 const x1 = getX(fvg.left);
                 const x2 = Math.max(x1 + 10, getX(fvg.right));
                 const yt = getY(fvg.top);
                 const yb = getY(fvg.bottom);

                 if (x1 !== -1 && x2 !== -1 && yt !== -1 && yb !== -1) {
                     const color = fvg.type === 'bull' ? '#00e676' : '#ff5252';
                     ctx.fillStyle = `${color}${fvg.broken ? '10' : '30'}`;
                     ctx.fillRect(x1, yt, x2 - x1, yb - yt);
                     
                     ctx.strokeStyle = `${color}40`;
                     if (fvg.broken) ctx.setLineDash([2, 2]);
                     ctx.strokeRect(x1, yt, x2 - x1, yb - yt);
                     ctx.setLineDash([]);
                     drawFib(x1, x2, yt, yb, color, 'FVG');
                 }
             });
        }

        // 6. Draw BPRs
        if (currentConfigs.bpr) {
             currentData.bprs.forEach(bpr => {
                 const x1 = getX(bpr.left);
                 const x2 = Math.max(x1 + 10, getX(bpr.right));
                 const yt = getY(bpr.top);
                 const yb = getY(bpr.bottom);

                 if (x1 !== -1 && x2 !== -1 && yt !== -1 && yb !== -1) {
                     const color = bpr.type === 'bull' ? '#00e676' : '#ff5252';
                     ctx.fillStyle = `${color}60`; // BPR is stronger
                     ctx.fillRect(x1, yt, x2 - x1, yb - yt);

                     ctx.font = 'bold 9px Arial';
                     ctx.fillStyle = color;
                     ctx.textAlign = 'right';
                     ctx.fillText(`BPR`, x2 - 2, yt + 12);
                     drawFib(x1, x2, yt, yb, color, 'BPR');
                 }
             });
        }

        // 7. Draw NWOG / NDOG
        if (currentConfigs.showNWOG || currentConfigs.showNDOG) {
             currentData.gaps.forEach(gap => {
                 const x1 = getX(gap.left);
                 const x2 = canvas.width; // Draw to the end
                 const yt = getY(gap.top);
                 const yb = getY(gap.bottom);
                 
                 if (x1 !== -1 && yt !== -1 && yb !== -1) {
                     const colorLine = gap.type === 'NWOG' ? '#ff5252' : '#ff9800';
                     const colorBg = gap.type === 'NWOG' ? '#b2b5be50' : '#4dd0e165';

                     ctx.fillStyle = colorBg;
                     ctx.fillRect(x1, yt, x2 - x1, yb - yt);

                     ctx.beginPath();
                     ctx.moveTo(x1, (yt + yb)/2);
                     ctx.lineTo(x2, (yt + yb)/2);
                     ctx.strokeStyle = colorLine;
                     ctx.setLineDash([2, 4]);
                     ctx.lineWidth = 1;
                     ctx.stroke();
                     ctx.setLineDash([]);
                     
                     ctx.font = '9px Arial';
                     ctx.fillStyle = colorLine;
                     ctx.textAlign = 'left';
                     ctx.fillText(gap.type, x1 + 2, yt - 2);
                     drawFib(x1, canvas.width, yt, yb, colorLine, 'NWOG'); // Treats both NWOG/NDOG equally for fib
                 }
             });
        }
    };

    // Data or config changes trigger a draw
    useEffect(() => {
        requestDraw();
    }, [luxIctData, configs, visibleLogicalRange]);

    // Subscriptions to chart panning/zooming
    useEffect(() => {
        if (!chart || !series) return;
        
        let timeScale;
        try {
            timeScale = chart.timeScale();
        } catch (e) {
            return;
        }

        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        timeScale.subscribeSizeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);

        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
            timeScale.unsubscribeSizeChange(requestDraw);
            chart.unsubscribeCrosshairMove(requestDraw);
        };
    }, [chart, series]);

    // Cleanup on unmount or indicator disable
    useEffect(() => {
        if (!configs.luxShowIndicator) {
             if (containerRef.current) {
                 if (containerRef.current.parentNode) {
                     containerRef.current.parentNode.removeChild(containerRef.current);
                 }
                 (containerRef as any).current = null;
                 (canvasRef as any).current = null;
             }
        }
    }, [configs.luxShowIndicator]);

    // Cleanup exclusively on unmount
    useEffect(() => {
        return () => {
            if (containerRef.current) {
                if (containerRef.current.parentNode) {
                    containerRef.current.parentNode.removeChild(containerRef.current);
                }
                (containerRef as any).current = null;
                (canvasRef as any).current = null;
            }
        };
    }, []);

    return null; // pure logic component rendering via canvas
}
