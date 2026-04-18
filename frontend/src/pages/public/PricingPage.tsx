
import React, { useState } from 'react';
import Button from '@/components/common/Button';
import { CheckCircleIcon } from '@/constants';

type BillingCycle = 'monthly' | 'yearly';

interface PricingTier {
    name: string;
    monthlyPrice: string;
    yearlyPrice: string;
    description: string;
    features: string[];
    cta: string;
    isFeatured: boolean;
    highlightColor: string;
}

const PRICING_TIERS: PricingTier[] = [
    {
        name: "Hobbyist",
        monthlyPrice: "$0",
        yearlyPrice: "$0",
        description: "Perfect for learning the ropes and testing basic strategies.",
        features: ["1 Connected Exchange", "10 Backtests / month", "1 Active Bot (Pre-made)", "Basic Portfolio Tracking", "Community Support"],
        cta: "Start for Free",
        isFeatured: false,
        highlightColor: "border-white/10 shadow-[0_0_15px_rgba(6,182,212,0.02)]"
    },
    {
        name: "Pro Trader",
        monthlyPrice: "$49",
        yearlyPrice: "$39",
        description: "For serious traders who demand power, speed, and AI insights.",
        features: ["5 Connected Exchanges", "Unlimited Backtests", "10 Active Bots (Custom & AI)", "AI Foundry Access (GPT-4)", "Real-time Sentiment Analysis", "Priority Support"],
        cta: "Go Pro",
        isFeatured: true,
        highlightColor: "border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
    },
    {
        name: "Enterprise",
        monthlyPrice: "Custom",
        yearlyPrice: "Custom",
        description: "Tailored infrastructure for funds and high-frequency desks.",
        features: ["Unlimited Exchanges", "Dedicated Cloud Node", "Custom Algorithm Development", "White-glove Onboarding", "SLA & 24/7 Phone Support", "Direct Market Access (DMA)"],
        cta: "Contact Sales",
        isFeatured: false,
        highlightColor: "border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.1)]"
    }
];

const COMPARISON_FEATURES = [
    { name: "Backtesting Engine", free: "Standard", pro: "High-Speed Parallel", ent: "Dedicated Server" },
    { name: "AI Strategy Generation", free: "Limited (3/mo)", pro: "Unlimited", ent: "Unlimited + Fine-tuning" },
    { name: "Data Granularity", free: "1 Hour", pro: "1 Minute", ent: "Tick Level" },
    { name: "API Access", free: "Read-only", pro: "Full Access", ent: "High Rate Limits" },
    { name: "Support", free: "Community", pro: "Email (24h)", ent: "Dedicated Account Manager" },
];

const FAQS = [
    { q: "Can I switch plans later?", a: "Absolutely. You can upgrade or downgrade your plan at any time from your settings dashboard." },
    { q: "Is my API key secure?", a: "Yes. We use AES-256 encryption to store your keys and they never leave our secure enclave. We only use them to execute trades you authorize." },
    { q: "Do you offer a refund?", a: "We offer a 14-day money-back guarantee for the Pro plan if you're not satisfied with the platform." },
    { q: "What exchanges do you support?", a: "We currently support Binance, Coinbase, Kraken, and KuCoin. More integrations are added monthly." },
];

const PricingPage: React.FC = () => {
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
    const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

    return (
        <div className="bg-[#020610] min-h-screen font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
            {/* Hero Section */}
            <div className="relative pt-32 pb-20 overflow-hidden">
                {/* Cyber background elements */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(6,182,212,0.3) 1px, transparent 0)',
                        backgroundSize: '32px 32px'
                    }}></div>
                    <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 blur-[150px] rounded-full animate-float-medium" />
                    <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-violet-600/10 blur-[150px] rounded-full animate-float-slow" />
                </div>
                
                <div className="container mx-auto px-4 text-center relative z-10">
                    <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold tracking-widest uppercase mb-6 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        SYS.BILLING.NODE
                    </span>
                    <h1 className="text-4xl md:text-7xl font-extrabold text-white tracking-tight mb-6 drop-shadow-lg">
                        Unlock Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 animate-gradient-x">Trading Edge</span>
                    </h1>
                    <p className="text-lg text-slate-400 font-light max-w-2xl mx-auto mb-12">
                        Powerful tools shouldn't be reserved for Wall Street. Choose a plan that scales with your ambition.
                    </p>

                    {/* Billing Toggle */}
                    <div className="flex justify-center items-center gap-4 mb-16">
                        <span className={`text-sm font-bold uppercase tracking-wider ${billingCycle === 'monthly' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-slate-500'}`}>Monthly</span>
                        <button 
                            onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
                            className="relative w-16 h-8 bg-[#0D1117] border border-white/10 rounded-full p-1 transition-all focus:outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
                        >
                            <div className={`w-6 h-6 bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.8)] transform transition-transform duration-300 ${billingCycle === 'yearly' ? 'translate-x-8 from-violet-400 to-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.8)]' : ''}`}></div>
                        </button>
                        <span className={`text-sm font-bold uppercase tracking-wider ${billingCycle === 'yearly' ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-slate-500'}`}>
                            Yearly <span className="ml-2 inline-block bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shadow-[0_0_10px_rgba(6,182,212,0.2)]">Save 20%</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Pricing Cards */}
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-24 relative z-10">
                <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
                    {PRICING_TIERS.map((tier, index) => (
                        <div 
                            key={tier.name} 
                            className={`relative bg-[#070F20]/60 backdrop-blur-2xl border rounded-[2rem] p-8 md:p-10 flex flex-col transition-all duration-500 hover:-translate-y-2 hover:bg-[#070F20]/80 group ${tier.highlightColor} ${tier.isFeatured ? 'z-10 lg:scale-105' : ''}`}
                        >
                            {tier.isFeatured && (
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cyan-500/20 border border-cyan-400 text-cyan-400 text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.5)] backdrop-blur-md">
                                    <span className="inline-block w-1.5 h-1.5 bg-cyan-400 rounded-full mr-2 animate-pulse" />
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-8">
                                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">{tier.name}</h3>
                                <p className="text-sm text-slate-400 h-10 leading-relaxed font-light">{tier.description}</p>
                            </div>

                            <div className="mb-8">
                                <div className="flex items-baseline">
                                    <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 drop-shadow-md">
                                        {billingCycle === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice}
                                    </span>
                                    {tier.monthlyPrice !== 'Custom' && (
                                        <span className="text-slate-500 ml-2 font-mono text-sm">/ month</span>
                                    )}
                                </div>
                                {billingCycle === 'yearly' && tier.monthlyPrice !== 'Custom' && tier.monthlyPrice !== '$0' && (
                                    <p className="text-xs text-cyan-400 mt-2 font-mono font-bold tracking-wider">Billed ${parseInt(tier.yearlyPrice.replace('$','')) * 12} yearly</p>
                                )}
                            </div>

                            {tier.isFeatured ? (
                                <button className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all hover:scale-[1.02] mb-10 relative overflow-hidden group/btn">
                                    <span className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                    {tier.cta}
                                </button>
                            ) : (
                                <button className="w-full py-4 rounded-xl font-bold bg-[#0D1117] border border-white/10 text-white hover:bg-white/5 hover:border-cyan-500/30 transition-all mb-10 shadow-[0_0_15px_rgba(0,0,0,0.5)] text-sm">
                                    {tier.cta}
                                </button>
                            )}

                            <div className="flex-grow pt-8 border-t border-white/10">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">What's included</p>
                                <ul className="space-y-4">
                                    {tier.features.map((feature, i) => (
                                        <li key={i} className="flex items-center gap-3">
                                            <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${tier.isFeatured ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            </div>
                                            <span className="text-sm text-slate-300">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Comparison Table */}
            <div className="relative border-y border-white/5 py-24 bg-[#050A15]/50 backdrop-blur-xl">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl relative z-10">
                    <h2 className="text-3xl font-extrabold text-white text-center mb-16 tracking-tight">System Specifications</h2>
                    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#070F20]/80 shadow-2xl backdrop-blur-md">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="border-b border-white/10 bg-[#0D1117]">
                                    <th className="py-5 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-1/3">Features</th>
                                    <th className="py-5 px-4 text-center font-bold text-white w-1/5">Hobbyist</th>
                                    <th className="py-5 px-4 text-center font-bold text-cyan-400 w-1/5">Pro Trader</th>
                                    <th className="py-5 px-4 text-center font-bold text-violet-400 w-1/5">Enterprise</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {COMPARISON_FEATURES.map((row, index) => (
                                    <tr key={index} className="hover:bg-white/5 transition-colors group">
                                        <td className="py-4 px-6 text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{row.name}</td>
                                        <td className="py-4 px-4 text-sm text-center text-slate-500 font-mono tracking-tight group-hover:text-slate-400">{row.free}</td>
                                        <td className="py-4 px-4 text-sm text-center font-bold text-cyan-400 font-mono tracking-tight drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]">{row.pro}</td>
                                        <td className="py-4 px-4 text-sm text-center text-slate-500 font-mono tracking-tight group-hover:text-violet-300">{row.ent}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* FAQ Section */}
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-24 max-w-3xl relative z-10">
                <h2 className="text-3xl font-extrabold text-white text-center mb-12 tracking-tight">Frequently Asked Questions</h2>
                <div className="space-y-4">
                    {FAQS.map((faq, index) => (
                        <div key={index} className="border border-white/5 rounded-2xl overflow-hidden bg-[#0D1117]/80 backdrop-blur-md hover:border-cyan-500/20 transition-all hover:bg-[#0D1117]">
                            <button 
                                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                                className="w-full flex justify-between items-center p-6 text-left focus:outline-none group"
                            >
                                <span className="font-bold text-white group-hover:text-cyan-400 transition-colors">{faq.q}</span>
                                <div className={`w-8 h-8 rounded-full border border-white/10 flex items-center justify-center transition-all duration-300 group-hover:border-cyan-500/30 group-hover:bg-cyan-500/10 ${openFaqIndex === index ? 'rotate-180 bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'text-slate-500'}`}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>
                            <div className={`px-6 text-sm text-slate-400 leading-relaxed font-light overflow-hidden transition-all duration-300 ${openFaqIndex === index ? 'max-h-40 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}>
                                {faq.a}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PricingPage;

