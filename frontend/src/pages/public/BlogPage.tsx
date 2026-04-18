import React, { useState, useMemo } from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { MOCK_BLOG_POSTS, MOCK_STRATEGY_OF_THE_WEEK, StrategyIcon, TutorialIcon, AnalysisIcon, AiMlIcon } from '@/constants';
import type { BlogPost } from '@/types';

type Category = 'All' | 'Strategies' | 'Tutorials' | 'Market Analysis' | 'AI & ML';

const categoryIcons: Record<Category, React.ReactNode> = {
    'All': <></>,
    'Strategies': <StrategyIcon />,
    'Tutorials': <TutorialIcon />,
    'Market Analysis': <AnalysisIcon />,
    'AI & ML': <AiMlIcon />,
};

const BlogCard: React.FC<{ post: BlogPost; featured?: boolean }> = ({ post, featured }) => (
    <div className={`group relative flex flex-col overflow-hidden rounded-3xl bg-[#070F20]/60 backdrop-blur-xl border border-white/10 shadow-[0_0_20px_rgba(6,182,212,0.05)] hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] hover:border-cyan-500/30 transition-all duration-500 hover:-translate-y-2 ${featured ? 'md:flex-row md:col-span-2 md:h-96' : 'h-full'}`}>
        <div className={`relative overflow-hidden ${featured ? 'md:w-1/2 h-64 md:h-full border-r border-white/10' : 'h-52 border-b border-white/10'}`}>
            <div className="absolute inset-0 bg-[#020610]/40 group-hover:bg-transparent z-10 transition-colors duration-500"></div>
            <img
                src={post.imageUrl}
                alt={post.title}
                className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
            />
            <span className="absolute top-4 left-4 z-20 text-[10px] font-bold uppercase tracking-widest bg-[#020610]/80 backdrop-blur-md px-3 py-1 rounded-full text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                {post.category}
            </span>
        </div>

        <div className={`p-8 flex flex-col flex-grow relative z-10 bg-gradient-to-b from-transparent to-[#020610]/80 ${featured ? 'md:w-1/2 justify-center' : ''}`}>
            <div className="flex items-center gap-3 text-xs text-slate-500 font-mono mb-4">
                <span className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center text-[10px] text-white font-bold shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                        {post.author[0]}
                    </div>
                    <span className="text-slate-300">{post.author}</span>
                </span>
                <span className="text-cyan-500/50">•</span>
                <span>{post.date}</span>
            </div>

            <h3 className={`${featured ? 'text-3xl' : 'text-xl'} font-bold text-white mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-violet-400 transition-all leading-tight`}>
                {post.title}
            </h3>

            <p className="text-slate-400 mb-6 line-clamp-3 leading-relaxed font-light">
                {post.excerpt}
            </p>

            <div className="mt-auto pt-4 border-t border-white/5">
                <span className="text-sm font-bold text-cyan-400 group-hover:text-cyan-300 flex items-center gap-1 transition-all drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                    Decrypt File
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </span>
            </div>
        </div>
    </div>
);

const NewsletterSection: React.FC = () => (
    <div className="relative my-16 rounded-[2rem] overflow-hidden bg-[#070F20]/90 border border-violet-500/20 px-6 py-12 sm:px-12 sm:py-16 lg:flex lg:items-center lg:p-20 shadow-[0_0_50px_rgba(139,92,246,0.15)] backdrop-blur-2xl">
        <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(139,92,246,0.5) 1px, transparent 0)',
                backgroundSize: '24px 24px'
            }}></div>
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] animate-float-slow"></div>
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-violet-600/20 rounded-full blur-[100px] animate-float-medium"></div>
        </div>

        <div className="lg:w-1/2 lg:pr-16 relative z-10">
            <h2 className="text-3xl font-extrabold tracking-tight text-white mb-4 drop-shadow-md">
                Direct <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">Alpha</span> to your Inbox.
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed font-light">
                Join 15,000+ quants receiving our weekly breakdown of market structure, new algo strategies, and machine learning research.
            </p>
        </div>
        <div className="mt-8 lg:mt-0 lg:w-1/2 relative z-10">
            <form className="sm:flex gap-3">
                <input
                    type="email"
                    required
                    className="w-full rounded-xl border border-white/10 bg-[#020610]/80 px-5 py-4 text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-inner font-mono text-sm"
                    placeholder="root@matrix.com"
                />
                <div className="mt-3 sm:mt-0">
                    <button type="submit" className="w-full relative overflow-hidden rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all hover:scale-[1.02] py-4 px-8 whitespace-nowrap group">
                        <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        Init Transfer
                    </button>
                </div>
            </form>
            <p className="mt-4 text-xs text-slate-500 font-mono">
                Encrypted comms only. Review our <a href="#" className="text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">Protocol Policies</a>.
            </p>
        </div>
    </div>
);

const BlogPage: React.FC = () => {
    const [activeCategory, setActiveCategory] = useState<Category>('All');

    // Get the very first featured post for the hero section
    const heroPost = useMemo(() => MOCK_BLOG_POSTS.find(p => p.isFeatured), []);

    // Filter the rest, excluding the hero post if visible
    const filteredPosts = useMemo(() => {
        let posts = MOCK_BLOG_POSTS;
        if (activeCategory !== 'All') {
            posts = posts.filter(p => p.category === activeCategory);
        }
        // If displaying 'All', exclude the hero post from the grid to avoid duplication
        if (activeCategory === 'All' && heroPost) {
            return posts.filter(p => p.id !== heroPost.id);
        }
        return posts;
    }, [activeCategory, heroPost]);

    const categories: Category[] = ['All', 'Strategies', 'Tutorials', 'Market Analysis', 'AI & ML'];

    return (
        <div className="bg-[#020610] min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">

            {/* Header Background */}
            <div className="relative pt-32 pb-48 overflow-hidden">
                {/* Cyber background elements */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'linear-gradient(rgba(139,92,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.15) 1px, transparent 1px)',
                        backgroundSize: '40px 40px'
                    }} />
                    <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px] animate-float-medium" />
                    <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-pink-600/10 rounded-full blur-[100px] animate-float-slow" />
                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#020610] to-transparent"></div>
                </div>

                <div className="container mx-auto px-4 relative z-10 text-center">
                    <span className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-violet-500/10 text-violet-400 text-xs font-bold tracking-widest uppercase mb-6 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                        KNOWLEDGE BASE
                    </span>
                    <h1 className="text-5xl md:text-7xl font-extrabold text-white tracking-tight mb-6 drop-shadow-lg">
                        The Quant <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 animate-gradient-x">Log</span>
                    </h1>
                    <p className="text-xl text-slate-400 font-light max-w-2xl mx-auto">
                        Deep dives into algorithmic trading, machine learning, and market microstructure.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-20 pb-24">

                {/* Category Navigation */}
                <div className="flex justify-center mb-16">
                    <div className="inline-flex p-1.5 bg-[#0D1117]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] overflow-x-auto max-w-full">
                        {categories.map(category => (
                            <button
                                key={category}
                                onClick={() => setActiveCategory(category)}
                                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap flex items-center gap-2 ${activeCategory === category
                                        ? 'bg-gradient-to-r from-violet-600/20 to-pink-600/20 text-white border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.3)]'
                                        : 'text-slate-400 border border-transparent hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className={activeCategory === category ? 'text-violet-400 drop-shadow-[0_0_5px_rgba(139,92,246,0.5)]' : 'opacity-70'}>
                                    {categoryIcons[category]}
                                </span>
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Hero Article (Only visible on 'All') */}
                {activeCategory === 'All' && heroPost && (
                    <div className="mb-12 animate-fade-in-slide-up">
                        <BlogCard post={heroPost} featured={true} />
                    </div>
                )}

                {/* Strategy of the Week - "The Black Box" Look */}
                <section className="mb-20 animate-fade-in-slide-up" style={{ animationDelay: '100ms' }}>
                    <div className="rounded-[2rem] bg-[#070F20]/80 backdrop-blur-xl border border-cyan-500/20 shadow-[0_0_40px_rgba(6,182,212,0.1)] overflow-hidden relative group">
                        {/* Code Background Effect */}
                        <div className="absolute inset-0 opacity-[0.03] font-mono text-xs text-cyan-400 p-4 overflow-hidden leading-relaxed select-none pointer-events-none break-all">
                            {Array(20).fill("if self.rsi < 30: self.buy() \n elif self.rsi > 70: self.sell()").join("\n")}
                        </div>

                        <div className="grid md:grid-cols-2 relative z-10">
                            <div className="p-10 md:p-12 flex flex-col justify-center border-b md:border-b-0 md:border-r border-white/10 bg-gradient-to-br from-[#0D1117]/60 to-transparent">
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(6,182,212,0.2)]">Strategy of the Week</span>
                                </div>
                                <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4 tracking-tight drop-shadow-md">{MOCK_STRATEGY_OF_THE_WEEK.title}</h2>
                                <p className="text-slate-400 mb-10 leading-relaxed font-light">{MOCK_STRATEGY_OF_THE_WEEK.description}</p>

                                <div className="flex gap-8">
                                    <div className="bg-[#020610]/50 p-4 rounded-2xl border border-white/5 flex-1 text-center">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Backtest Target</p>
                                        <p className="text-2xl font-mono font-bold text-green-400 drop-shadow-[0_0_5px_rgba(7ade80,0.5)]">+{MOCK_STRATEGY_OF_THE_WEEK.results.profit}%</p>
                                    </div>
                                    <div className="bg-[#020610]/50 p-4 rounded-2xl border border-white/5 flex-1 text-center">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 font-bold">Max Drawdown</p>
                                        <p className="text-2xl font-mono font-bold text-red-500 drop-shadow-[0_0_5px_rgba(ef4444,0.5)]">{MOCK_STRATEGY_OF_THE_WEEK.results.drawdown}%</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-[#020610]/80 flex flex-col">
                                <div className="flex items-center justify-between text-slate-500 text-xs font-mono mb-3 px-2 border-b border-white/5 pb-2">
                                    <span>ai_foundry_prompt.txt</span>
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500/50 border border-red-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-500/50 border border-yellow-500"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-500/50 border border-green-500"></div>
                                    </div>
                                </div>
                                <div className="flex-grow bg-[#0D1117] rounded-xl p-5 border border-white/5 font-mono text-sm text-slate-300 overflow-hidden relative shadow-inner">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-violet-500"></div>
                                    <div className="pl-4">
                                        <span className="text-violet-400 font-bold">System:</span>
                                        <br />
                                        <span className="text-slate-400">{MOCK_STRATEGY_OF_THE_WEEK.aiPrompt}</span>
                                    </div>
                                    <p className="pl-4 mt-6 text-cyan-400 animate-pulse">_</p>
                                </div>
                                <div className="mt-6 text-right">
                                    <button className="text-xs font-bold font-mono tracking-widest uppercase px-6 py-3 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)]">Execute Script</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Main Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
                    {filteredPosts.map((post, index) => (
                        <div key={post.id} className="animate-fade-in-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
                            <BlogCard post={post} />
                        </div>
                    ))}
                </div>

                <NewsletterSection />
            </div>
        </div>
    );
};

export default BlogPage;
