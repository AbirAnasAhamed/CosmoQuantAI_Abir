
import React, { useState, useEffect } from 'react';
import Button from '@/components/common/Button';
import { Logo } from '@/constants';
import HomePage from './HomePage';
import ServicesPage from './ServicesPage';
import PricingPage from './PricingPage';
import BlogPage from './BlogPage';
import PortfolioPage from './PortfolioPage';

type PublicView = 'Home' | 'Services' | 'Pricing' | 'Portfolio' | 'Blog';

interface PublicWebsiteProps {
    onLogin: () => void;
    onSignUp: () => void;
}

const NavLink: React.FC<{
    children: React.ReactNode;
    onClick: () => void;
    isActive: boolean;
}> = ({ children, onClick, isActive }) => (
    <button
        onClick={onClick}
        className={`relative px-4 py-2 text-sm font-medium transition-all duration-300 group ${isActive
                ? 'text-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
    >
        {isActive && (
            <span className="absolute inset-0 bg-cyan-500/10 rounded-lg border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]" />
        )}
        <span className="relative z-10">{children}</span>
        <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent transition-all duration-300 ${isActive ? 'w-full' : 'w-0 group-hover:w-2/3'}`} />
    </button>
);

const PublicHeader: React.FC<{
    onLogin: () => void;
    onSignUp: () => void;
    currentView: PublicView;
    setCurrentView: (view: PublicView) => void;
}> = ({ onLogin, onSignUp, currentView, setCurrentView }) => {
    const navItems: PublicView[] = ['Services', 'Portfolio', 'Pricing', 'Blog'];
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 flex justify-center pt-4 px-4 pointer-events-none`}>
            <nav className={`pointer-events-auto w-full max-w-[95%] transition-all duration-500 border flex items-center justify-between ${scrolled
                    ? 'bg-[#050A14]/90 backdrop-blur-xl border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)] py-3 px-6 rounded-2xl'
                    : 'bg-[#050A14]/60 backdrop-blur-md border-white/5 shadow-lg py-4 px-8 rounded-2xl'
                }`}>

                {/* Left: Logo + Nav */}
                <div className="flex items-center gap-6 lg:gap-10">
                    <button onClick={() => setCurrentView('Home')} className="transform hover:scale-105 transition-transform group">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)] group-hover:shadow-[0_0_25px_rgba(6,182,212,0.7)] transition-all">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <Logo className="!text-lg !text-white" />
                        </div>
                    </button>

                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => (
                            <NavLink key={item} onClick={() => setCurrentView(item)} isActive={currentView === item}>
                                {item}
                            </NavLink>
                        ))}
                    </div>
                </div>

                {/* Center: Search */}
                <div className="hidden lg:block flex-1 max-w-sm mx-8">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-3.5 w-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Search assets, strategies..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:bg-white/8 transition-all"
                        />
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    {/* Live indicator */}
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-green-400 uppercase tracking-wide">Live</span>
                    </div>

                    <div className="w-px h-5 bg-white/10 hidden md:block" />

                    <button
                        onClick={onLogin}
                        className="hidden md:block text-sm font-medium text-slate-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
                    >
                        Log In
                    </button>
                    <button
                        onClick={onSignUp}
                        className="relative overflow-hidden text-sm font-semibold px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all hover:scale-105 group"
                    >
                        <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        Get Started
                    </button>
                </div>
            </nav>
        </header>
    );
};

const PublicFooter: React.FC = () => (
    <footer className="relative bg-[#020610] border-t border-white/5 pt-16 pb-8 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <Logo className="!text-lg !text-white" />
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Empowering traders with institutional-grade algorithms and AI-driven insights. Stop guessing, start quantifying.
                    </p>
                    <div className="flex gap-3 mt-6">
                        {['T', 'D', 'G'].map((social, i) => (
                            <div key={i} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs text-slate-400 hover:border-cyan-500/40 hover:text-cyan-400 cursor-pointer transition-all">
                                {social}
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Platform</h3>
                    <ul className="space-y-2.5">
                        {['AI Foundry', 'Backtester', 'Bot Lab', 'Portfolio'].map(item => (
                            <li key={item}><a href="#" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">{item}</a></li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Resources</h3>
                    <ul className="space-y-2.5">
                        {['Documentation', 'API Reference', 'Blog', 'Community'].map(item => (
                            <li key={item}><a href="#" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">{item}</a></li>
                        ))}
                    </ul>
                </div>
                <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Stay Updated</h3>
                    <p className="text-xs text-slate-500 mb-3">Get alpha signals delivered to your inbox.</p>
                    <div className="flex flex-col gap-2">
                        <input
                            type="email"
                            placeholder="Enter your email"
                            className="bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all"
                        />
                        <button className="py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-violet-500/30 transition-all">
                            Subscribe
                        </button>
                    </div>
                </div>
            </div>
            <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                <p className="text-xs text-slate-600">© {new Date().getFullYear()} CosmoQuantAI. All rights reserved.</p>
                <div className="flex gap-6 text-xs text-slate-600">
                    <a href="#" className="hover:text-cyan-400 transition-colors">Privacy Policy</a>
                    <a href="#" className="hover:text-cyan-400 transition-colors">Terms of Service</a>
                    <a href="#" className="hover:text-cyan-400 transition-colors">Cookie Policy</a>
                </div>
            </div>
        </div>
    </footer>
);


const PublicWebsite: React.FC<PublicWebsiteProps> = ({ onLogin, onSignUp }) => {
    const [currentView, setCurrentView] = useState<PublicView>('Home');

    const renderContent = () => {
        switch (currentView) {
            case 'Services': return <ServicesPage />;
            case 'Pricing': return <PricingPage />;
            case 'Blog': return <BlogPage />;
            case 'Portfolio': return <PortfolioPage onSignUp={onSignUp} />;
            case 'Home':
            default:
                return <HomePage onLogin={onLogin} onSignUp={onSignUp} />;
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#020610] text-white selection:bg-cyan-500/30">
            <PublicHeader onLogin={onLogin} onSignUp={onSignUp} currentView={currentView} setCurrentView={setCurrentView} />
            <main className="flex-grow pt-20">
                {renderContent()}
            </main>
            {currentView === 'Home' && <PublicFooter />}
        </div>
    );
};

export default PublicWebsite;
