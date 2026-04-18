
import React from 'react';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import { MOCK_PORTFOLIO_PROJECTS, MOCK_CLIENT_TESTIMONIALS, CheckCircleIcon } from '@/constants';
import type { PortfolioProject } from '@/types';

interface PortfolioPageProps {
    onSignUp: () => void;
}

const MetricBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex flex-col bg-white/5 border border-white/10 rounded-lg p-2 text-center min-w-[80px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-sm font-bold text-cyan-400">{value}</span>
    </div>
);

const ProjectCard: React.FC<{ project: PortfolioProject; index: number }> = ({ project, index }) => (
    <div 
        className="group relative bg-[#070F20]/60 backdrop-blur-xl border border-white/10 shadow-[0_0_20px_rgba(6,182,212,0.05)] rounded-3xl overflow-hidden hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] hover:border-cyan-500/30 transition-all duration-500 hover:-translate-y-2 flex flex-col h-full staggered-fade-in"
        style={{ animationDelay: `${index * 100}ms` }}
    >
        {/* Image Overlay Effect */}
        <div className="relative h-56 overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 bg-[#020610]/40 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
            <img 
                src={project.imageUrl} 
                alt={project.title} 
                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" 
            />
            <div className="absolute top-4 left-4 z-20">
                <span className="px-3 py-1 text-xs font-bold bg-[#020610]/80 backdrop-blur-md rounded-full text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                    {project.category}
                </span>
            </div>
        </div>

        <div className="p-6 md:p-8 flex flex-col flex-grow relative bg-gradient-to-b from-transparent to-[#020610]/80">
            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-violet-400 transition-all">
                {project.title}
            </h3>
            
            <p className="text-sm text-slate-400 leading-relaxed mb-6 flex-grow">
                {project.description}
            </p>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 mb-6">
                {project.metrics.map((metric, idx) => (
                    <MetricBadge key={idx} label={metric.label} value={metric.value} />
                ))}
            </div>

            {/* Tags & Action */}
            <div className="pt-5 border-t border-white/10 flex justify-between items-center mt-auto">
                <div className="flex flex-wrap gap-2">
                    {project.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">#{tag}</span>
                    ))}
                </div>
                <button className="text-sm font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 group-hover:translate-x-1 transition-all drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                    Inspect &rarr;
                </button>
            </div>
        </div>
    </div>
);

const SkillCategory: React.FC<{ title: string; skills: string[] }> = ({ title, skills }) => (
    <div className="bg-[#070F20]/50 backdrop-blur-xl border border-white/10 shadow-[0_0_15px_rgba(139,92,246,0.05)] rounded-2xl p-8 hover:border-violet-500/30 transition-all hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] group">
        <h4 className="text-xl font-bold text-white mb-5 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.8)] group-hover:animate-pulse"></div>
            {title}
        </h4>
        <div className="flex flex-wrap gap-2.5">
            {skills.map(skill => (
                <span key={skill} className="px-3.5 py-1.5 bg-[#0D1117] border border-white/5 rounded-lg text-xs font-medium text-slate-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] cursor-default hover:text-white hover:border-violet-500/50 transition-colors">
                    {skill}
                </span>
            ))}
        </div>
    </div>
);

const PortfolioPage: React.FC<PortfolioPageProps> = ({ onSignUp }) => {
    const coreSkills = ['Python (Pandas, NumPy)', 'Rust', 'C++', 'Quantitative Analysis', 'Statistical Arbitrage'];
    const mlSkills = ['TensorFlow', 'PyTorch', 'LSTM / GRU Networks', 'Reinforcement Learning', 'Sentiment NLP'];
    const infraSkills = ['Docker & Kubernetes', 'AWS / GCP', 'WebSocket APIs', 'Low Latency Systems', 'PostgreSQL / TimescaleDB'];

    return (
        <div className="bg-[#020610] min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">
            
            {/* Hero Section */}
            <div className="relative pt-32 pb-20 overflow-hidden">
                {/* Cyber grid and animated background */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'linear-gradient(rgba(6,182,212,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.15) 1px, transparent 1px)',
                        backgroundSize: '40px 40px'
                    }} />
                    <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] animate-float-medium" />
                    <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-[100px] animate-float-slow" />
                </div>
                
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                    <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold tracking-widest uppercase mb-6 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        SYS.PORTFOLIO.ARCHIVE
                    </span>
                    <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-8 drop-shadow-lg">
                        Architecting <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 animate-gradient-x">Alpha</span>
                    </h1>
                    <p className="mt-4 max-w-2xl mx-auto text-lg text-slate-400 leading-relaxed font-light">
                        I design institutional-grade algorithmic trading systems, custom machine learning models, and high-frequency execution engines for discerning clients.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-24 pb-24">
                
                {/* Featured Projects */}
                <section className="relative z-10">
                    <div className="flex items-center justify-between mb-12">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Mission Logs</h2>
                        <div className="hidden md:block h-px flex-1 bg-gradient-to-r from-cyan-500/50 to-transparent ml-8"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {MOCK_PORTFOLIO_PROJECTS.map((project, index) => (
                            <ProjectCard key={project.id} project={project} index={index} />
                        ))}
                    </div>
                </section>
                
                {/* Tech Stack Radar */}
                <section className="relative z-10">
                    <h2 className="text-3xl font-extrabold text-white mb-12 text-center tracking-tight">Technical Arsenal</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <SkillCategory title="Core Quant" skills={coreSkills} />
                        <SkillCategory title="AI & Machine Learning" skills={mlSkills} />
                        <SkillCategory title="Infrastructure & DevOps" skills={infraSkills} />
                    </div>
                </section>
                
                {/* Testimonials */}
                <section className="relative z-10">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#070F20]/50 to-transparent -skew-y-2 transform origin-left scale-110 rounded-3xl z-0 border-y border-white/5"></div>
                    <div className="relative z-10 py-16">
                        <h2 className="text-3xl font-extrabold text-white mb-12 text-center tracking-tight">Encrypted Comms (Feedback)</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {MOCK_CLIENT_TESTIMONIALS.map((testimonial, i) => (
                                <div key={testimonial.id} className="bg-[#0D1117]/80 backdrop-blur-md p-8 rounded-3xl border border-white/10 relative hover:border-cyan-500/30 transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] group">
                                    <div className="text-6xl text-cyan-500/10 font-serif absolute top-4 left-6 group-hover:text-cyan-500/20 transition-colors">"</div>
                                    <p className="text-slate-300 italic relative z-10 mb-8 leading-relaxed">
                                        {testimonial.quote}
                                    </p>
                                    <div className="flex items-center gap-4 border-t border-white/10 pt-6">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center text-lg font-bold text-cyan-400 group-hover:border-cyan-500/50 transition-colors">
                                            {testimonial.author[0]}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-white">{testimonial.author}</p>
                                            <p className="text-xs text-slate-500 font-mono tracking-wider">{testimonial.role}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
                
                {/* CTA Section */}
                <section className="relative rounded-[2rem] overflow-hidden bg-[#070F20]/90 border border-cyan-500/20 text-white py-20 px-8 text-center shadow-[0_0_50px_rgba(6,182,212,0.15)] backdrop-blur-2xl">
                    {/* Abstract Tech Background */}
                    <div className="absolute inset-0 z-0">
                        <div className="absolute inset-0 opacity-10" style={{
                            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(6,182,212,0.5) 1px, transparent 0)',
                            backgroundSize: '24px 24px'
                        }}></div>
                        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] animate-float-medium"></div>
                        <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-600/10 rounded-full blur-[100px] animate-float-slow text-pink-500"></div>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />
                    </div>

                    <div className="relative z-10 max-w-3xl mx-auto">
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Ready to Build Your Edge?</h2>
                        <p className="text-lg text-slate-400 mb-10 leading-relaxed max-w-2xl mx-auto">
                            Whether you need a custom HFT bot, a risk management system, or a full-stack trading platform, let's engineer a solution that fits your strategy.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-5 justify-center">
                            <button className="relative overflow-hidden px-8 py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all hover:scale-[1.02] group">
                                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                Initiate Comms
                            </button>
                            <button 
                                onClick={onSignUp}
                                className="px-8 py-4 rounded-xl font-bold bg-[#0D1117] border border-white/10 hover:bg-white/5 hover:border-cyan-500/30 text-white transition-all shadow-lg z-10 relative"
                            >
                                Deploy Serverless Node
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PortfolioPage;

