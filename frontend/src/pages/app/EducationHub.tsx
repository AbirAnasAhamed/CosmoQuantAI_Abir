import React, { useState, useEffect } from 'react';
import {
    BookOpen,
    GraduationCap,
    Newspaper,
    PlayCircle,
    TrendingUp,
    Shield,
    Cpu,
    Search,
    ChevronRight,
    Clock,
    Zap
} from 'lucide-react';
import Card from '@/components/common/Card';
import { educationService } from '@/services/educationService';
import type { EducationResource } from '@/types';

// --- Components ---

const LevelBadge = ({ level }: { level: string }) => {
    const colors: Record<string, string> = {
        'Level 1': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
        'Level 2': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
        'Level 3': 'bg-violet-500/20 text-violet-400 border-violet-500/50',
        'Level 4': 'bg-orange-500/20 text-orange-400 border-orange-500/50',
        'Level 5': 'bg-rose-500/20 text-rose-400 border-rose-500/50',
    };
    return (
        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border ${colors[level] || 'bg-gray-800 text-gray-400'}`}>
            {level}
        </span>
    );
};

const EducationHub: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'curriculum' | 'news'>('curriculum');
    const [selectedLevel, setSelectedLevel] = useState<string>('Level 1');
    const [resources, setResources] = useState<EducationResource[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleInit = async () => {
        setLoading(true);
        try {
            await educationService.initializeAcademy();
            // Data loaded, refresh with Level 1 default
            const data = await educationService.getAllResources('Level 1');
            setResources(data);
            setSelectedLevel('Level 1');
        } catch (error) {
            console.error("Init failed", error);
        } finally {
            setLoading(false);
        }
    };

    // --- Data Fetching ---
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                let data;
                if (activeTab === 'news') {
                    data = await educationService.getAllResources(undefined, 'News');
                } else {
                    data = await educationService.getAllResources(selectedLevel);
                }
                setResources(data);
            } catch (error) {
                console.error("Failed to load academy data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeTab, selectedLevel]);

    // --- Levels Definition ---
    const levels = [
        { id: 'Level 1', title: 'Foundation', icon: <Shield className="w-4 h-4" />, desc: 'Blockchain & Security Basics' },
        { id: 'Level 2', title: 'Trading 101', icon: <TrendingUp className="w-4 h-4" />, desc: 'Spot, Futures & Orders' },
        { id: 'Level 3', title: 'Technical Analysis', icon: <BookOpen className="w-4 h-4" />, desc: 'Charts, Patterns & Indicators' },
        { id: 'Level 4', title: 'Risk Mastery', icon: <GraduationCap className="w-4 h-4" />, desc: 'Psychology & Portfolio Mgmt' },
        { id: 'Level 5', title: 'Quant & Algo', icon: <Cpu className="w-4 h-4" />, desc: 'Automated Bots & Strategies' },
    ];

    return (
        <div className="min-h-screen bg-[#0B0E14] text-white font-sans selection:bg-blue-500/30">

            {/* --- Hero Section with Glow --- */}
            <div className="relative overflow-hidden bg-gradient-to-b from-blue-900/20 to-transparent pb-10 pt-6 px-6 md:px-12 border-b border-white/5">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-500/20 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="relative z-10 max-w-5xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-4 animate-fade-in">
                        <Zap className="w-3 h-3" /> Cosmo Academy
                    </div>
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-gray-400">
                        Zero to <span className="text-blue-500">Quant Hero.</span>
                    </h1>
                    <p className="text-gray-400 max-w-2xl mx-auto text-lg mb-8">
                        Master the markets with our structured curriculum. From blockchain basics to deploying your first algorithmic trading bot.
                    </p>

                    {/* Tab Switcher */}
                    <div className="flex justify-center mb-8">
                        <div className="p-1 bg-white/5 rounded-xl border border-white/10 flex gap-1">
                            <button
                                onClick={() => setActiveTab('curriculum')}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'curriculum'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <GraduationCap className="w-4 h-4" /> Curriculum
                            </button>
                            <button
                                onClick={() => setActiveTab('news')}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'news'
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <Newspaper className="w-4 h-4" /> Market Intel
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 flex flex-col md:flex-row gap-8">

                {/* --- Left Sidebar: Roadmap (Only for Curriculum) --- */}
                {activeTab === 'curriculum' && (
                    <div className="w-full md:w-80 flex-shrink-0">
                        <div className="sticky top-24 bg-[#131722] border border-white/5 rounded-2xl p-2 shadow-2xl">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-4 py-3 mb-2">Learning Path</h3>
                            <div className="space-y-1">
                                {levels.map((lvl, idx) => (
                                    <button
                                        key={lvl.id}
                                        onClick={() => setSelectedLevel(lvl.id)}
                                        className={`w-full group flex items-center gap-4 p-3 rounded-xl transition-all border ${selectedLevel === lvl.id
                                            ? 'bg-blue-500/10 border-blue-500/50'
                                            : 'bg-transparent border-transparent hover:bg-white/5'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${selectedLevel === lvl.id ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400 group-hover:bg-white/20'
                                            }`}>
                                            {idx + 1}
                                        </div>
                                        <div className="text-left">
                                            <p className={`text-sm font-bold ${selectedLevel === lvl.id ? 'text-white' : 'text-gray-300'}`}>{lvl.title}</p>
                                            <p className="text-[10px] text-gray-500">{lvl.desc}</p>
                                        </div>
                                        {selectedLevel === lvl.id && <ChevronRight className="w-4 h-4 text-blue-500 ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- Main Content Area --- */}
                <div className="flex-1">
                    {/* Search & Filter Bar */}
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            {activeTab === 'curriculum' ? (
                                <>
                                    <span className="text-blue-500">{selectedLevel}:</span>
                                    {levels.find(l => l.id === selectedLevel)?.desc}
                                </>
                            ) : (
                                <>
                                    <span className="text-emerald-500 animate-pulse">●</span> Live Market News
                                </>
                            )}
                        </h2>
                        <div className="relative hidden md:block">
                            <input
                                type="text"
                                placeholder="Search topic..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-[#131722] border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500 w-64 transition-all"
                            />
                            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                    </div>

                    {/* Content Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-48 bg-white/5 rounded-2xl animate-pulse"></div>
                            ))}
                        </div>
                    ) : resources.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
                            {resources
                                .filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map((resource) => (
                                    <Card
                                        key={resource.id}
                                        className="!bg-[#131722] !border-white/5 hover:!border-blue-500/30 transition-all duration-300 group overflow-hidden relative"
                                    >
                                        {/* Image Overlay Gradient */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#131722] via-transparent to-transparent z-10 pointer-events-none"></div>

                                        {/* Background Image (Mock if null) */}
                                        <div className="h-32 w-full overflow-hidden relative">
                                            <img
                                                src={resource.image_url || `https://source.unsplash.com/random/800x600/?crypto,${resource.category}`}
                                                alt={resource.title}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-80"
                                            />
                                            <div className="absolute top-3 right-3 z-20">
                                                <LevelBadge level={resource.level || 'News'} />
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-5 relative z-20 -mt-10">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg shadow-blue-900/50">
                                                    {resource.category}
                                                </span>
                                                {resource.source && (
                                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-black/30 px-2 py-0.5 rounded backdrop-blur-sm border border-white/5">
                                                        <Clock className="w-3 h-3" /> {resource.source}
                                                    </span>
                                                )}
                                            </div>

                                            <h3 className="text-lg font-bold text-white mb-2 leading-tight group-hover:text-blue-400 transition-colors">
                                                {resource.title}
                                            </h3>
                                            <p className="text-sm text-gray-400 line-clamp-2 mb-4">
                                                {resource.description}
                                            </p>

                                            <a
                                                href={resource.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 text-sm font-bold text-white bg-white/5 hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/25 border border-white/10 hover:border-transparent px-4 py-2 rounded-lg transition-all w-full justify-center"
                                            >
                                                {activeTab === 'curriculum' ? (
                                                    <><PlayCircle className="w-4 h-4" /> Start Lesson</>
                                                ) : (
                                                    <><Newspaper className="w-4 h-4" /> Read Article</>
                                                )}
                                            </a>
                                        </div>
                                    </Card>
                                ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-[#131722] rounded-3xl border border-dashed border-white/10 col-span-full">
                            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search className="w-8 h-8 text-gray-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-300">No content found</h3>
                            <p className="text-gray-500 mt-2 mb-6">Database is empty. Initialize to load starter content.</p>

                            <button
                                onClick={handleInit}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-full transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 mx-auto"
                            >
                                <Zap className="w-4 h-4" /> Initialize Academy Data
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EducationHub;
