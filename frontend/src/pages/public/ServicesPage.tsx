
import React from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { 
    AIFoundryIcon, 
    BacktesterIcon, 
    BotLabIcon,
    TradingIcon,
    PortfolioIcon, 
    AlphaEngineIcon,
    IdeaIcon,
    TestIcon,
    DeployIcon
} from '@/constants';

const ServiceCard: React.FC<{ 
    icon: React.ReactNode; 
    title: string; 
    description: string; 
    delay: number;
}> = ({ icon, title, description, delay }) => (
  <div 
    className="group relative p-8 bg-[#070F20]/60 backdrop-blur-xl border border-white/10 shadow-[0_0_20px_rgba(6,182,212,0.05)] rounded-3xl hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] hover:border-cyan-500/30 transition-all duration-500 hover:-translate-y-2 overflow-hidden"
    style={{ animationDelay: `${delay}ms` }}
  >
    {/* Hover Glow Effect */}
    <div className="absolute -right-10 -top-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-[50px] group-hover:bg-cyan-500/20 transition-all duration-500 pointer-events-none"></div>
    
    <div className="relative z-10 flex flex-col h-full">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-110 group-hover:rotate-3 group-hover:border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)] group-hover:shadow-[0_0_25px_rgba(6,182,212,0.3)] transition-all duration-500">
            {icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-violet-400 transition-all">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed font-light">{description}</p>
    </div>
  </div>
);

const ProcessStep: React.FC<{ number: string; title: string; desc: string }> = ({ number, title, desc }) => (
    <div className="relative pl-10 border-l border-white/10 last:border-l-transparent pb-10 last:pb-0 group">
        <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-slate-600 group-hover:bg-cyan-400 transition-colors shadow-[0_0_10px_rgba(6,182,212,0)] group-hover:shadow-[0_0_15px_rgba(6,182,212,0.8)]"></div>
        <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-mono font-bold text-slate-500 group-hover:text-cyan-500/50 transition-colors">[{number}]</span>
            <h4 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">{title}</h4>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed font-light">{desc}</p>
    </div>
);

const ServicesPage: React.FC = () => {
    const platformFeatures = [
        {
            icon: <AIFoundryIcon />,
            title: "AI Foundry",
            description: "Natural language processing turns your trading ideas into Python code instantly. No syntax errors, just logic."
        },
        {
            icon: <BacktesterIcon />,
            title: "Backtesting Engine",
            description: "Validate strategies against terabytes of historical data. Visualize equity curves, drawdowns, and Sharpe ratios."
        },
        {
            icon: <BotLabIcon />,
            title: "Visual Strategy Builder",
            description: "A node-based drag-and-drop interface for constructing complex logic without writing a single line of code."
        },
        {
            icon: <TradingIcon />,
            title: "Cloud Execution",
            description: "Deploy your bots to our low-latency cloud infrastructure. Run 24/7 with 99.99% uptime guarantee."
        },
        {
            icon: <PortfolioIcon />,
            title: "Portfolio Command",
            description: "Unified tracking across Binance, Coinbase, and DeFi wallets. Real-time P&L and risk exposure analysis."
        },
        {
            icon: <AlphaEngineIcon />,
            title: "Alpha Signals",
            description: "Alternative data feeds including sentiment analysis, on-chain whale movements, and dark pool prints."
        },
    ];

    return (
        <div className="relative bg-[#020610] min-h-screen overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
            
            {/* Decorative Background Elements */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: 'linear-gradient(rgba(6,182,212,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.15) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full animate-float-medium" />
                <div className="absolute top-40 right-1/4 w-[500px] h-[500px] bg-violet-600/10 blur-[150px] rounded-full animate-float-slow" />
            </div>

            {/* Hero Section */}
            <div className="relative pt-32 pb-20 text-center px-4 z-10">
                <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold tracking-widest uppercase mb-6 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    SYS.CAPABILITIES
                </span>
                <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6 drop-shadow-lg">
                    Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 animate-gradient-x">Edge</span>
                </h1>
                <p className="text-xl text-slate-400 font-light max-w-2xl mx-auto leading-relaxed">
                    Whether you want to build it yourself with our advanced tools or need a bespoke solution engineered for you, we have the infrastructure.
                </p>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-32 relative z-10">
                <div className="grid lg:grid-cols-12 gap-12 xl:gap-16">
                    
                    {/* Left Column: SaaS Platform (The Engine) */}
                    <div className="lg:col-span-7 flex flex-col">
                        <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-3xl font-extrabold text-white tracking-tight">The Quant Engine</h2>
                                <p className="text-xs font-mono text-cyan-500/80 uppercase tracking-widest mt-2 flex items-center gap-2">
                                    <span className="w-1 h-1 bg-cyan-500 rounded-full"></span>
                                    Self-Service Platform
                                </p>
                            </div>
                            <div className="self-start sm:self-auto px-4 py-1.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold border border-green-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(74,222,128,0.15)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                LIVE ACCESS
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-6">
                            {platformFeatures.map((feature, index) => (
                                <ServiceCard 
                                    key={index} 
                                    {...feature} 
                                    delay={index * 100} 
                                />
                            ))}
                        </div>

                        <div className="mt-10 p-8 rounded-3xl bg-[#070F20]/80 backdrop-blur-xl border border-cyan-500/30 shadow-[0_0_40px_rgba(6,182,212,0.15)] flex flex-col sm:flex-row items-center justify-between gap-8 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-bold text-white mb-2">Start Building Today</h3>
                                <p className="text-slate-400 text-sm font-light">Free tier available. No credit card required.</p>
                            </div>
                            <button className="relative z-10 whitespace-nowrap overflow-hidden px-8 py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all hover:scale-[1.02] group/btn">
                                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                Launch Terminal
                            </button>
                        </div>
                    </div>

                    {/* Right Column: Freelance Services (The Architect) */}
                    <div className="lg:col-span-5">
                        <div className="sticky top-32 h-full">
                            <div className="relative h-full bg-[#050A15]/80 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col group">
                                {/* Cyber Pattern Background */}
                                <div className="absolute inset-0 z-0 pointer-events-none">
                                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(139,92,246,0.3) 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 blur-[80px] rounded-full group-hover:bg-violet-500/20 transition-colors duration-700"></div>
                                </div>
                                
                                <div className="relative z-10 mb-12">
                                    <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">Custom Engineering</h2>
                                    <p className="text-[10px] font-mono text-violet-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                                        <span className="w-1 h-1 bg-violet-500 rounded-full"></span>
                                        Freelance & Consulting
                                    </p>
                                    <p className="text-slate-400 text-sm leading-relaxed font-light">
                                        Need something unique? I provide white-glove development services for hedge funds, prop desks, and serious individual traders.
                                    </p>
                                </div>

                                {/* Process Timeline */}
                                <div className="relative z-10 flex-grow mb-12 border-l border-white/5 ml-1 pt-2">
                                    <ProcessStep 
                                        number="00" 
                                        title="Comms Encoded (Discovery)" 
                                        desc="We analyze your alpha hypothesis and define technical requirements." 
                                    />
                                    <ProcessStep 
                                        number="01" 
                                        title="Quantitative Development" 
                                        desc="I build your custom algo using Rust or Python with institutional-grade risk controls." 
                                    />
                                    <ProcessStep 
                                        number="10" 
                                        title="Backtesting & Optimization" 
                                        desc="Rigorous stress testing across multiple market regimes to ensure robustness." 
                                    />
                                    <ProcessStep 
                                        number="11" 
                                        title="Production Deployment" 
                                        desc="Live deployment into our automated serverless cluster." 
                                    />
                                </div>

                                <div className="relative z-10 mt-auto">
                                    <button className="w-full py-4 rounded-xl font-bold bg-[#0D1117] border border-white/10 text-white hover:bg-white/5 hover:border-violet-500/50 hover:text-violet-400 transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                                        Schedule Briefing
                                    </button>
                                    <p className="text-center text-[10px] uppercase tracking-widest text-slate-600 mt-5 font-mono">
                                        Bandwidth: Limited Availability
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ServicesPage;

