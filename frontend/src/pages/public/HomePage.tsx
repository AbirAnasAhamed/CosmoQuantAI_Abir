
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import Button from '@/components/common/Button';
import {
    BacktesterIcon, BotLabIcon, AIFoundryIcon,
    InteractiveBrokersLogo, CoinbaseLogo, BitfinexLogo, TradierLogo, TradingTechnologiesLogo, TerminalLinkLogo, AlpacaLogo,
    TradeStationLogo, CharlesSchwabLogo, KrakenLogo, SscEzeLogo, SamcoLogo, ZerodhaLogo, TdAmeritradeLogo, BinanceLogo,
    IdeaIcon, TestIcon, DeployIcon,
    MOCK_CRYPTO_NEWS
} from '@/constants';
import { useTheme } from '@/context/ThemeContext';
import MarketTicker from '@/components/features/market/MarketTicker';
import { useToast } from '@/context/ToastContext';

// Scroll Animation Hook
const useScrollAnimation = (threshold = 0.1) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            },
            { threshold }
        );
        if (ref.current) observer.observe(ref.current);
        return () => { if (ref.current) observer.unobserve(ref.current); };
    }, [threshold]);
    return ref;
};

// ============================
// Futuristic Animated Background
// ============================
const CyberBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;
        let particles: any[] = [];
        const mouse = { x: -9999, y: -9999 };

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
        };

        class Particle {
            x: number; y: number; vx: number; vy: number; size: number; color: string; alpha: number;
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.size = Math.random() * 1.5 + 0.5;
                const colors = ['rgba(6,182,212,', 'rgba(139,92,246,', 'rgba(59,130,246,', 'rgba(236,72,153,'];
                this.color = colors[Math.floor(Math.random() * colors.length)];
                this.alpha = Math.random() * 0.6 + 0.2;
            }
            update() {
                this.x += this.vx; this.y += this.vy;
                if (this.x > canvas.width) this.x = 0;
                if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0;
                if (this.y < 0) this.y = canvas.height;
                // Mouse repulsion
                const dx = this.x - mouse.x, dy = this.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    this.x += (dx / dist) * 1.5;
                    this.y += (dy / dist) * 1.5;
                }
            }
            draw() {
                ctx!.beginPath();
                ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx!.fillStyle = `${this.color}${this.alpha})`;
                ctx!.fill();
                // Glow
                ctx!.shadowBlur = 8;
                ctx!.shadowColor = `${this.color}0.8)`;
                ctx!.fill();
                ctx!.shadowBlur = 0;
            }
        }

        const init = () => {
            particles = [];
            const count = Math.min(120, window.innerWidth / 12);
            for (let i = 0; i < count; i++) particles.push(new Particle());
        };

        const drawGrid = () => {
            ctx!.strokeStyle = 'rgba(6,182,212,0.025)';
            ctx!.lineWidth = 1;
            const gridSize = 80;
            for (let x = 0; x < canvas.width; x += gridSize) {
                ctx!.beginPath();
                ctx!.moveTo(x, 0);
                ctx!.lineTo(x, canvas.height);
                ctx!.stroke();
            }
            for (let y = 0; y < canvas.height; y += gridSize) {
                ctx!.beginPath();
                ctx!.moveTo(0, y);
                ctx!.lineTo(canvas.width, y);
                ctx!.stroke();
            }
        };

        const animate = () => {
            ctx!.clearRect(0, 0, canvas.width, canvas.height);
            drawGrid();
            particles.forEach(p => { p.update(); p.draw(); });
            // Connect nearby particles
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 100) {
                        const opacity = (1 - dist / 100) * 0.15;
                        ctx!.beginPath();
                        ctx!.strokeStyle = `rgba(6,182,212,${opacity})`;
                        ctx!.lineWidth = 0.5;
                        ctx!.moveTo(particles[i].x, particles[i].y);
                        ctx!.lineTo(particles[j].x, particles[j].y);
                        ctx!.stroke();
                    }
                    // Mouse connections
                    const mdx = particles[i].x - mouse.x;
                    const mdy = particles[i].y - mouse.y;
                    const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
                    if (mdist < 150) {
                        const op = (1 - mdist / 150) * 0.4;
                        ctx!.beginPath();
                        ctx!.strokeStyle = `rgba(139,92,246,${op})`;
                        ctx!.lineWidth = 1;
                        ctx!.moveTo(particles[i].x, particles[i].y);
                        ctx!.lineTo(mouse.x, mouse.y);
                        ctx!.stroke();
                    }
                }
            }
            animId = requestAnimationFrame(animate);
        };

        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
        };

        resize(); init(); animate();
        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', onMouseMove);
        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMouseMove);
            cancelAnimationFrame(animId);
        };
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 z-0 w-full h-full pointer-events-none" />;
};

// ============================
// Floating Orbs
// ============================
const FloatingOrbs: React.FC = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-float-slow" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-violet-500/10 rounded-full blur-[100px] animate-float-medium" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-blue-500/8 rounded-full blur-[90px] animate-float-fast" />
        <div className="absolute top-2/3 right-1/3 w-64 h-64 bg-pink-500/8 rounded-full blur-[80px] animate-float-slow" style={{ animationDelay: '2s' }} />
    </div>
);

// ============================
// Cyber Card / Glow Card
// ============================
const CyberCard: React.FC<{ children: React.ReactNode; className?: string; glowColor?: string }> = ({
    children, className = '', glowColor = 'cyan'
}) => {
    const divRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [opacity, setOpacity] = useState(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!divRef.current) return;
        const rect = divRef.current.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const colorMap: Record<string, string> = {
        cyan: 'rgba(6,182,212,0.15)',
        violet: 'rgba(139,92,246,0.15)',
        green: 'rgba(34,197,94,0.12)',
        blue: 'rgba(59,130,246,0.12)',
        pink: 'rgba(236,72,153,0.12)',
    };

    return (
        <div
            ref={divRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setOpacity(1)}
            onMouseLeave={() => setOpacity(0)}
            className={`relative overflow-hidden rounded-2xl border border-white/8 bg-white/3 backdrop-blur-xl ${className}`}
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}
        >
            {/* Spotlight glow */}
            <div
                className="pointer-events-none absolute -inset-px transition-opacity duration-300 rounded-2xl"
                style={{
                    opacity,
                    background: `radial-gradient(500px circle at ${pos.x}px ${pos.y}px, ${colorMap[glowColor] || colorMap.cyan}, transparent 40%)`,
                }}
            />
            {/* Border glow */}
            <div
                className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
                style={{
                    opacity: opacity * 0.5,
                    boxShadow: `inset 0 0 0 1px ${colorMap[glowColor]?.replace('0.15', '0.5') || 'rgba(6,182,212,0.5)'}`,
                }}
            />
            <div className="relative h-full z-10">{children}</div>
        </div>
    );
};

// ============================
// News Ticker
// ============================
const LandingPageNewsTicker: React.FC = () => {
    const [selectedNews, setSelectedNews] = useState<any>(null);

    return (
        <>
            <div className="w-full bg-[#020A1A]/90 border-t border-cyan-500/10 py-2 px-4 overflow-hidden flex items-center relative z-20 backdrop-blur-sm">
                <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-lg flex-shrink-0 mr-4">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider whitespace-nowrap">Breaking News</span>
                </div>
                <div className="flex-1 overflow-hidden relative h-6">
                    <div className="animate-marquee-slow whitespace-nowrap absolute top-0 left-0 flex items-center h-full text-sm text-slate-400" style={{ animationDuration: '120s' }}>
                        {[...MOCK_CRYPTO_NEWS, ...MOCK_CRYPTO_NEWS, ...MOCK_CRYPTO_NEWS, ...MOCK_CRYPTO_NEWS].map((news, i) => (
                            <div
                                key={`${news.id}-${i}`}
                                className="mx-8 flex flex-shrink-0 items-center cursor-pointer hover:text-cyan-400 transition-colors"
                                onClick={() => setSelectedNews(news)}
                            >
                                <span className="font-bold text-slate-600 text-xs mr-2">[{news.source}]</span>
                                {news.text}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {selectedNews && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" onClick={() => setSelectedNews(null)}>
                    <div
                        className="bg-[#070F20] w-full max-w-md rounded-2xl shadow-2xl border border-cyan-500/20 overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />
                        <div className="p-6 relative">
                            <button onClick={() => setSelectedNews(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                            <div className="flex items-center gap-3 mb-4">
                                <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider">{selectedNews.source}</span>
                                <span className="text-xs text-slate-500 font-mono">{new Date().toLocaleTimeString()}</span>
                            </div>
                            <h3 className="text-lg font-bold text-white leading-snug mb-4">{selectedNews.text}</h3>
                            <div className="p-4 bg-white/3 rounded-xl border border-white/5 mb-4">
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    <strong className="block mb-1 text-slate-300 text-xs uppercase tracking-wider">AI Sentiment Analysis</strong>
                                    Sentiment: <span className={`font-bold capitalize ${selectedNews.sentiment === 'positive' ? 'text-green-400' : selectedNews.sentiment === 'negative' ? 'text-red-400' : 'text-yellow-400'}`}>{selectedNews.sentiment}</span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedNews(null)} className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/8 transition-all">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// ============================
// Market Intelligence Section
// ============================
const MarketIntelligenceSection: React.FC = () => {
    const ref = useScrollAnimation();
    const [activeSignal, setActiveSignal] = useState(0);

    const signals = [
        { pair: 'BTC/USDT', signal: 'BULLISH DIV', conf: 88, type: 'long' },
        { pair: 'SOL/USDT', signal: 'BREAKOUT', conf: 92, type: 'long' },
        { pair: 'PEPE/USDT', signal: 'VOL SPIKE', conf: 75, type: 'short' },
        { pair: 'ETH/BTC', signal: 'SUPPORT HIT', conf: 81, type: 'long' },
    ];

    useEffect(() => {
        const timer = setInterval(() => setActiveSignal(prev => (prev + 1) % signals.length), 2000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div ref={ref} className="py-24 bg-[#030D1A] fade-in-up border-b border-white/5">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section header */}
                <div className="text-center mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        Real-Time Intelligence
                    </div>
                    <h2 className="text-3xl md:text-4xl font-extrabold text-white">
                        Markets at a{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">Glance</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Market Mood */}
                    <CyberCard glowColor="green" className="p-6 group">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Fear & Greed</p>
                                <h3 className="text-4xl font-extrabold text-white">68</h3>
                                <p className="text-sm font-semibold text-green-400 mt-0.5">Greed</p>
                            </div>
                            <div className="w-16 h-16 relative">
                                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#greedGrad)" strokeWidth="3"
                                        strokeDasharray={`${68 * 0.999} ${100 - 68 * 0.999}`} strokeLinecap="round" />
                                    <defs>
                                        <linearGradient id="greedGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#10b981" />
                                            <stop offset="100%" stopColor="#06d654" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-400">68%</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                            {['Extreme\nFear', 'Fear', 'Neutral', 'Greed', 'Extreme\nGreed'].map((label, i) => (
                                <div key={i} className={`h-1.5 rounded-full ${i < 3 ? 'bg-white/10' : i === 3 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-white/5'}`} />
                            ))}
                        </div>
                    </CyberCard>

                    {/* AI Signal Stream */}
                    <CyberCard glowColor="cyan" className="p-6">
                        <div className="flex justify-between items-center mb-5">
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">AI Signal Stream</p>
                                <p className="text-xs text-slate-600">Updated every 30s</p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-lg border border-green-500/20">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                </span>
                                <span className="text-[10px] text-green-400 font-bold">LIVE</span>
                            </div>
                        </div>
                        <div className="space-y-2.5">
                            {signals.map((sig, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-500 ${idx === activeSignal
                                    ? 'bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                                    : 'bg-white/3 border-white/5 opacity-50'
                                }`}>
                                    <span className="font-mono font-bold text-sm text-white">{sig.pair}</span>
                                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${sig.type === 'long' ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>{sig.signal}</span>
                                    <span className="text-xs font-mono font-bold text-cyan-400">{sig.conf}%</span>
                                </div>
                            ))}
                        </div>
                    </CyberCard>

                    {/* Sector Flow */}
                    <CyberCard glowColor="violet" className="p-6 flex flex-col">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Sector Flow (24h)</p>
                        <div className="flex-1 flex items-end gap-3">
                            {[{ n: 'AI', v: 85, c: 'cyan' }, { n: 'DeFi', v: 45, c: 'violet' }, { n: 'L1', v: 60, c: 'blue' }, { n: 'Game', v: 30, c: 'pink' }, { n: 'Meme', v: 95, c: 'green' }].map((sec) => (
                                <div key={sec.n} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                                    <span className="text-xs font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">{sec.v}%</span>
                                    <div className="w-full rounded-t-lg overflow-hidden relative" style={{ height: `${Math.max(sec.v * 1.2, 20)}px` }}>
                                        <div className={`absolute inset-0 opacity-20 ${sec.c === 'cyan' ? 'bg-cyan-500' : sec.c === 'violet' ? 'bg-violet-500' : sec.c === 'blue' ? 'bg-blue-500' : sec.c === 'pink' ? 'bg-pink-500' : 'bg-green-500'}`} />
                                        <div className={`absolute bottom-0 left-0 right-0 h-0 group-hover:h-full transition-all duration-500 ${sec.c === 'cyan' ? 'bg-cyan-500/40' : sec.c === 'violet' ? 'bg-violet-500/40' : sec.c === 'blue' ? 'bg-blue-500/40' : sec.c === 'pink' ? 'bg-pink-500/40' : 'bg-green-500/40'}`} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500">{sec.n}</span>
                                </div>
                            ))}
                        </div>
                    </CyberCard>
                </div>
            </div>
        </div>
    );
};

// ============================
// Stats Section
// ============================
const StatsSection: React.FC = () => {
    const ref = useScrollAnimation();
    const stats = [
        { label: 'Strategies Backtested', value: '2.5M+', icon: '📊', color: 'cyan' },
        { label: 'Trading Volume Processed', value: '$12B+', icon: '💰', color: 'violet' },
        { label: 'Live Bots Active', value: '15,000+', icon: '🤖', color: 'green' },
        { label: 'System Uptime', value: '99.99%', icon: '⚡', color: 'blue' },
    ];

    return (
        <div ref={ref} className="py-24 border-t border-white/5 fade-in-up relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-[#030D1A] to-[#020610]" />
            <div className="container mx-auto px-4 relative z-10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {stats.map((stat, i) => (
                        <CyberCard key={i} glowColor={stat.color} className="p-8 text-center group">
                            <div className="text-3xl mb-3">{stat.icon}</div>
                            <h3 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-2">
                                {stat.value}
                            </h3>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                        </CyberCard>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ============================
// Features Bento Grid
// ============================
const BentoGrid: React.FC = () => {
    const ref = useScrollAnimation(0.1);

    return (
        <div ref={ref} className="py-32 relative fade-in-up bg-[#020610]">
            <div className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-[150px] pointer-events-none" />

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="text-center max-w-3xl mx-auto mb-20">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-widest mb-6">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Platform Suite
                    </div>
                    <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
                        Everything you need to{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400">Build Alpha.</span>
                    </h2>
                    <p className="mt-6 text-lg text-slate-400">
                        A unified ecosystem replacing fragmented tools. From idea to execution in minutes.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
                    {/* AI Foundry - Large */}
                    <CyberCard glowColor="cyan" className="md:col-span-4 group min-h-[320px] flex flex-col">
                        <div className="p-8 pb-0 flex-grow">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] group-hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all group-hover:scale-110 duration-300">
                                    <AIFoundryIcon />
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-white">AI Foundry</h4>
                                    <p className="text-xs text-cyan-400 font-mono">Natural Language → Code</p>
                                </div>
                            </div>
                            <p className="text-slate-400 max-w-md text-sm leading-relaxed">
                                Convert natural language into production-grade Python. Describe your strategy and our fine-tuned LLM builds the logic automatically.
                            </p>
                        </div>
                        {/* Code preview */}
                        <div className="relative h-44 mt-6 border-t border-white/5 bg-black/30 rounded-b-2xl overflow-hidden">
                            <div className="absolute top-4 left-6 right-6 bottom-0 bg-[#0D1117] rounded-t-xl shadow-2xl p-4 border border-white/8 transform translate-y-3 group-hover:translate-y-0 transition-transform duration-500">
                                <div className="flex gap-2 mb-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                    <span className="ml-2 text-[10px] text-slate-500 font-mono">strategy.py</span>
                                </div>
                                <div className="font-mono text-xs leading-5">
                                    <span className="text-violet-400">def</span> <span className="text-yellow-300">on_tick</span><span className="text-slate-300">(self, data):</span><br />
                                    &nbsp;&nbsp;<span className="text-slate-500"># AI Generated Logic ✨</span><br />
                                    &nbsp;&nbsp;<span className="text-violet-400">if</span> <span className="text-slate-300">data.rsi &lt; </span><span className="text-green-400">30</span><span className="text-slate-300">:</span><br />
                                    &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-slate-300">self.</span><span className="text-cyan-400">buy</span><span className="text-slate-300">(size=</span><span className="text-green-400">0.1</span><span className="text-slate-300">)</span>
                                </div>
                            </div>
                        </div>
                    </CyberCard>

                    {/* Bot Lab - Tall */}
                    <CyberCard glowColor="green" className="md:col-span-2 group min-h-[320px] flex flex-col">
                        <div className="p-8">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white mb-5 shadow-[0_0_20px_rgba(34,197,94,0.4)] group-hover:scale-110 transition-transform duration-300">
                                <BotLabIcon />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-2">Bot Lab</h4>
                            <p className="text-xs text-green-400 font-mono mb-3">Cloud Deployment</p>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Deploy strategies to the cloud with 99.9% uptime. Monitor active PnL from a single glass dashboard.
                            </p>
                        </div>
                        <div className="flex-grow relative overflow-hidden flex items-center justify-center pb-6">
                            {/* Animated radial bot network */}
                            <div className="relative w-36 h-36">
                                <div className="absolute top-1/2 left-1/2 w-5 h-5 bg-green-500 rounded-full -translate-x-1/2 -translate-y-1/2 z-10 shadow-[0_0_20px_rgba(34,197,94,0.8)] animate-pulse" />
                                {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                                    <div key={i} className="absolute top-1/2 left-1/2 w-[68px] h-px bg-gradient-to-r from-green-500/60 to-transparent origin-left" style={{ transform: `rotate(${deg}deg)` }}>
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-slate-800 border border-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                    </div>
                                ))}
                                {/* Rotating ring */}
                                <div className="absolute inset-0 rounded-full border border-green-500/20 animate-spin" style={{ animationDuration: '8s' }} />
                                <div className="absolute inset-4 rounded-full border border-cyan-500/10 animate-spin" style={{ animationDuration: '5s', animationDirection: 'reverse' }} />
                            </div>
                        </div>
                    </CyberCard>

                    {/* Backtester - Tall */}
                    <CyberCard glowColor="blue" className="md:col-span-2 group min-h-[320px] flex flex-col">
                        <div className="p-8">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white mb-5 shadow-[0_0_20px_rgba(59,130,246,0.4)] group-hover:scale-110 transition-transform duration-300">
                                <BacktesterIcon />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-2">Backtesting</h4>
                            <p className="text-xs text-blue-400 font-mono mb-3">Historical Analysis</p>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Validate logic against TBs of historical data. Visualize equity curves and max drawdown instantly.
                            </p>
                        </div>
                        {/* Equity curve */}
                        <div className="mt-auto h-28 w-full relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent" />
                            <svg className="absolute bottom-0 left-0 right-0 w-full h-24" preserveAspectRatio="none" viewBox="0 0 200 60">
                                <defs>
                                    <linearGradient id="chartGrad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#06b6d4" />
                                    </linearGradient>
                                </defs>
                                <path d="M0 55 Q 30 50, 50 40 T 90 20 T 130 25 T 180 8 L200 5" fill="none" stroke="url(#chartGrad)" strokeWidth="2.5" className="drop-shadow-md" />
                                <path d="M0 60 L0 55 Q 30 50, 50 40 T 90 20 T 130 25 T 180 8 L200 5 V60 H0 Z" fill="url(#chartGrad)" fillOpacity="0.15" />
                            </svg>
                        </div>
                    </CyberCard>

                    {/* Visual Builder - Wide */}
                    <CyberCard glowColor="violet" className="md:col-span-4 group min-h-[300px] flex flex-col">
                        <div className="grid md:grid-cols-2 h-full">
                            <div className="p-8 flex flex-col justify-center">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-white mb-5 shadow-[0_0_20px_rgba(139,92,246,0.4)] group-hover:scale-110 transition-transform duration-300">
                                    <IdeaIcon className="w-6 h-6" />
                                </div>
                                <h4 className="text-xl font-bold text-white mb-2">Visual Strategy Builder</h4>
                                <p className="text-xs text-violet-400 font-mono mb-3">No-Code Editor</p>
                                <p className="text-slate-400 text-sm leading-relaxed mb-5">
                                    No code? No problem. Drag, drop, and connect indicators, triggers, and actions. Logic visualization made simple.
                                </p>
                                <div>
                                    <button className="text-xs font-semibold px-4 py-2 rounded-xl border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-all">
                                        Try Builder Demo →
                                    </button>
                                </div>
                            </div>
                            <div className="relative min-h-[200px] border-l border-white/5 overflow-hidden flex items-center justify-center p-6">
                                <div className="relative w-full max-w-xs group-hover:scale-105 transform transition-transform duration-500">
                                    {/* Node graph */}
                                    <div className="absolute top-0 left-8 w-28 h-10 rounded-xl bg-blue-500/10 backdrop-blur border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)] flex items-center justify-center text-[10px] font-mono text-blue-400">
                                        📥 Data Input
                                    </div>
                                    <svg className="absolute top-10 left-20 w-1 h-10" overflow="visible">
                                        <path d="M0 0 V 40" stroke="rgba(100,116,139,0.5)" strokeWidth="1.5" strokeDasharray="3 3" />
                                    </svg>
                                    <div className="absolute top-20 left-2 w-32 h-11 rounded-xl bg-yellow-500/10 backdrop-blur border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.15)] flex flex-col items-center justify-center p-2">
                                        <span className="text-[10px] font-mono text-yellow-400">⚡ RSI Condition</span>
                                        <div className="w-5/6 h-1 bg-slate-700 mt-1.5 rounded-full overflow-hidden">
                                            <div className="w-2/3 h-full bg-gradient-to-r from-yellow-500 to-orange-500" />
                                        </div>
                                    </div>
                                    <svg className="absolute top-[118px] left-16 w-12 h-12" overflow="visible">
                                        <path d="M0 0 Q 0 24, 24 24" stroke="rgba(100,116,139,0.5)" strokeWidth="1.5" fill="none" />
                                    </svg>
                                    <div className="absolute top-32 left-32 w-28 h-10 rounded-xl bg-green-500/10 backdrop-blur border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)] flex items-center justify-center text-[10px] font-mono text-green-400">
                                        ✅ Execute Buy
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CyberCard>
                </div>
            </div>
        </div>
    );
};

// ============================
// AI Strategy Generator
// ============================
const AIStrategyGenerator: React.FC = () => {
    const { showToast } = useToast();
    const ref = useScrollAnimation(0.2);
    const [prompt, setPrompt] = useState('Buy BTC when RSI(14) crosses below 30 and sell when it crosses above 70.');
    const [generatedCode, setGeneratedCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const highlightSyntax = (code: string) => {
        const pythonKeywords = ['def', 'return', 'import', 'from', 'class', 'if', 'else', 'elif', 'for', 'while', 'in', 'and', 'or', 'not', 'is', 'None', 'True', 'False'];
        return code
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/(#.*$)/gm, '<span class="token-comment">$1</span>')
            .replace(/('.*?'|".*?")/g, '<span class="token-string">$1</span>')
            .replace(new RegExp(`\\b(${pythonKeywords.join('|')})\\b`, 'g'), '<span class="token-keyword">$1</span>')
            .replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>')
            .replace(/([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="token-function">$1</span>');
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) { showToast('Please enter a description.', 'error'); return; }
        setIsLoading(true); setGeneratedCode('');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: "You are an expert trading algorithm developer. Generate concise Python pseudocode using backtrader style. No markdown blocks.", maxOutputTokens: 300 }
            });
            setGeneratedCode(response.text);
        } catch (error) {
            console.error(error);
            setGeneratedCode("# Error generating code. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div ref={ref} className="py-28 bg-[#030D1A] fade-in-up relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwNmI2ZDQiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIvPjxwYXRoIGQ9Ik0wIDBMMCAxIDE5IDEgMTkgMCIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    {/* Terminal */}
                    <div className="order-2 lg:order-1">
                        <CyberCard glowColor="cyan" className="overflow-hidden">
                            <div className="bg-[#0D1117] px-4 py-3 flex items-center gap-3 border-b border-white/5">
                                <div className="flex gap-1.5">
                                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                                    <span className="text-xs text-slate-400 font-mono">strategy_gen.py</span>
                                </div>
                                <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> gemini-2.5-flash
                                </div>
                            </div>
                            <div className="p-6 h-[380px] overflow-y-auto font-mono text-sm bg-[#0D1117]">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-4">
                                        <div className="relative w-12 h-12">
                                            <div className="absolute inset-0 border-2 border-cyan-500/30 rounded-full" />
                                            <div className="absolute inset-0 border-2 border-transparent border-t-cyan-500 rounded-full animate-spin" />
                                        </div>
                                        <p className="text-cyan-400 text-sm animate-pulse">Synthesizing Alpha...</p>
                                    </div>
                                ) : generatedCode ? (
                                    <code className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightSyntax(generatedCode) }} />
                                ) : (
                                    <div className="text-slate-600">
                                        <p className="mb-1"><span className="text-cyan-500/60">&gt;&gt;</span> Waiting for input...</p>
                                        <p><span className="text-cyan-500/60">&gt;&gt;</span> Describe your strategy on the right to generate code.</p>
                                        <div className="mt-6 flex items-center gap-2">
                                            <div className="w-2 h-4 bg-cyan-500/80 animate-pulse" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CyberCard>
                    </div>

                    {/* Form */}
                    <div className="order-1 lg:order-2">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            Powered by Gemini 2.5 Flash
                        </div>
                        <h2 className="text-4xl font-extrabold text-white mb-4 leading-tight">
                            Talk Trading.{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">Get Code.</span>
                        </h2>
                        <p className="text-lg text-slate-400 mb-8 leading-relaxed">
                            Skip the boilerplate. Describe any technical indicator, entry/exit logic, or risk parameter in plain English — our fine-tuned AI models build the foundation instantly.
                        </p>

                        <div className="relative rounded-2xl border border-white/10 bg-white/3 backdrop-blur focus-within:border-cyan-500/40 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                rows={4}
                                className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-slate-600 resize-none p-5 pr-4 text-sm leading-relaxed outline-none"
                                placeholder="E.g., Buy Ethereum when MACD crosses signal line and volume is above 20-day average..."
                            />
                            <div className="flex items-center justify-between px-4 pb-4">
                                <span className="text-xs text-slate-600">Supports: RSI, MACD, EMA, Bollinger, Volume strategies</span>
                                <button
                                    onClick={handleGenerate}
                                    disabled={isLoading}
                                    className="relative overflow-hidden px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-sm font-semibold shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                                >
                                    {isLoading ? 'Generating...' : '✨ Generate Strategy'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================
// Partners Section
// ============================
const PartnersSection: React.FC = () => {
    const logos = [
        { name: "Binance", component: <BinanceLogo className="h-7 w-auto" /> },
        { name: "Coinbase", component: <CoinbaseLogo className="h-6 w-auto" /> },
        { name: "Kraken", component: <KrakenLogo className="h-6 w-auto" /> },
        { name: "Alpaca", component: <AlpacaLogo className="h-6 w-auto" /> },
        { name: "Bitfinex", component: <BitfinexLogo className="h-6 w-auto" /> },
        { name: "Interactive", component: <InteractiveBrokersLogo className="h-6 w-auto" /> },
        { name: "Schwab", component: <CharlesSchwabLogo className="h-7 w-auto" /> },
        { name: "TD", component: <TdAmeritradeLogo className="h-6 w-auto" /> },
    ];

    return (
        <div className="py-16 bg-[#020610] border-y border-white/5">
            <div className="text-center mb-10">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Integrated with leading platforms</p>
            </div>
            <div className="relative w-full overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#020610] to-transparent z-10" />
                <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#020610] to-transparent z-10" />
                <div className="flex animate-marquee-slow whitespace-nowrap">
                    {[...logos, ...logos, ...logos, ...logos].map((logo, index) => (
                        <div key={index} className="mx-12 flex flex-shrink-0 items-center justify-center opacity-25 hover:opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                            {logo.component}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ============================
// CTA Section
// ============================
const CustomServicesSection: React.FC = () => {
    const ref = useScrollAnimation();
    return (
        <div ref={ref} className="py-32 relative overflow-hidden fade-in-up bg-[#030D1A]">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[150px] animate-float-slow" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[100px] animate-float-medium" />
            </div>

            {/* Grid lines decoration */}
            <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
                backgroundSize: '60px 60px'
            }} />

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-8">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        Custom Solutions
                    </div>
                    <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
                        Need a Custom{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400">
                            Solution?
                        </span>
                    </h2>
                    <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                        Leverage freelance expertise to design, build, and deploy high-performance trading algorithms tailored specifically to your needs. From HFT bots to complex arbitrage systems.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button className="relative overflow-hidden px-10 py-4 text-lg font-semibold rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.6)] transition-all hover:scale-105 group">
                            <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            Book Consultation
                        </button>
                        <button className="px-10 py-4 text-lg font-semibold rounded-2xl border border-white/15 text-white hover:border-cyan-500/40 hover:bg-white/5 transition-all hover:scale-105">
                            View Portfolio
                        </button>
                    </div>

                    {/* Trust indicators */}
                    <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
                        {[
                            { value: '98%', label: 'Client Satisfaction' },
                            { value: '50+', label: 'Projects Delivered' },
                            { value: '24h', label: 'Response Time' },
                        ].map((item, i) => (
                            <div key={i} className="text-center">
                                <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">{item.value}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================
// HOME PAGE
// ============================
const HomePage: React.FC<{ onLogin: () => void; onSignUp: () => void; }> = ({ onLogin, onSignUp }) => {
    const { theme } = useTheme();
    const [activeSymbol, setActiveSymbol] = useState('BTCUSDT');

    useEffect(() => {
        const createWidget = () => {
            const container = document.getElementById('homepage_chart');
            if (!container || !window.TradingView) return;
            container.innerHTML = '';
            new window.TradingView.widget({
                symbol: `BINANCE:${activeSymbol}`,
                interval: '60',
                autosize: true,
                container_id: 'homepage_chart',
                theme: 'Dark',
                style: '1',
                locale: 'en',
                toolbar_bg: '#0D1117',
                enable_publishing: false,
                allow_symbol_change: true,
                hide_top_toolbar: false,
                hide_legend: false,
                hide_side_toolbar: false,
                withdateranges: true,
                hotlist: true,
                calendar: true,
                save_image: false,
                studies: ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"]
            });
        };
        setTimeout(createWidget, 500);
    }, [theme, activeSymbol]);

    const handleTickerClick = (symbol: string) => {
        setActiveSymbol(`${symbol.toUpperCase()}USDT`);
    };

    return (
        <div className="overflow-hidden">
            {/* ========== HERO ========== */}
            <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#020610]">
                <CyberBackground />
                <FloatingOrbs />

                {/* Radial gradient overlay */}
                <div className="absolute inset-0 bg-radial-glow pointer-events-none z-1" />

                <div className="container mx-auto px-4 relative z-10 flex flex-col items-center text-center pt-24 pb-32">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-10 animate-fade-in-down shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
                        </span>
                        Now in Public Beta — Start Free Today
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter text-white mb-8 animate-fade-in-down leading-none" style={{ animationDelay: '0.1s' }}>
                        Stop Guessing.{' '}
                        <br className="hidden md:block" />
                        <span className="relative">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400">
                                Start Quantifying.
                            </span>
                            {/* Underline glow */}
                            <span className="absolute -bottom-2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className="max-w-2xl text-xl text-slate-400 mb-12 leading-relaxed animate-fade-in-down" style={{ animationDelay: '0.2s' }}>
                        The all-in-one platform for algorithmic trading. Build, backtest, and deploy strategies without managing infrastructure.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-down mb-6" style={{ animationDelay: '0.3s' }}>
                        <button
                            onClick={onSignUp}
                            className="relative overflow-hidden px-10 py-4 text-lg font-semibold rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.6)] transition-all hover:scale-105 group"
                        >
                            <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className="flex items-center gap-2">
                                🚀 Get Started for Free
                            </span>
                        </button>
                        <button
                            className="px-10 py-4 text-lg font-semibold rounded-2xl border border-white/15 text-white hover:border-cyan-500/40 hover:bg-white/5 transition-all hover:scale-105 flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            See How It Works
                        </button>
                    </div>

                    {/* Social proof */}
                    <div className="flex items-center gap-4 text-sm text-slate-500 animate-fade-in-down" style={{ animationDelay: '0.4s' }}>
                        <div className="flex -space-x-2">
                            {['🧑', '👩', '🧔', '👨', '👩‍'].map((emoji, i) => (
                                <div key={i} className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-xs">
                                    {emoji}
                                </div>
                            ))}
                        </div>
                        <span>Join <span className="text-cyan-400 font-semibold">15,000+</span> traders already using CosmoQuantAI</span>
                    </div>

                    {/* Chart */}
                    <div className="mt-20 w-full max-w-6xl relative animate-fade-in-slide-up">
                        {/* Glow behind chart */}
                        <div className="absolute -inset-4 bg-cyan-500/5 rounded-3xl blur-2xl" />
                        <div className="relative rounded-2xl overflow-hidden border border-white/8 shadow-[0_0_60px_rgba(6,182,212,0.1)] bg-[#0D1117]">
                            {/* Top accent bar */}
                            <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />
                            {/* Window chrome */}
                            <div className="flex items-center gap-2 px-4 py-3 bg-[#0D1117] border-b border-white/5">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                                </div>
                                <span className="ml-2 text-xs text-slate-500 font-mono">CosmoQuant Terminal — Live Chart</span>
                                <div className="ml-auto flex items-center gap-1.5">
                                    <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                                    </span>
                                    <span className="text-[10px] text-green-400 font-mono">LIVE</span>
                                </div>
                            </div>
                            <div id="homepage_chart" className="w-full h-[500px] md:h-[580px]" />
                        </div>
                    </div>
                </div>

                {/* Bottom tickers */}
                <div className="absolute bottom-0 left-0 w-full z-20 flex flex-col">
                    <div className="border-t border-white/5 bg-[#020610]/90 backdrop-blur-md">
                        <MarketTicker variant="overlay" onCoinClick={handleTickerClick} />
                    </div>
                    <LandingPageNewsTicker />
                </div>
            </div>

            <PartnersSection />
            <MarketIntelligenceSection />
            <BentoGrid />
            <AIStrategyGenerator />
            <StatsSection />
            <CustomServicesSection />
        </div>
    );
};

export default HomePage;
