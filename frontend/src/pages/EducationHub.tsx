import React, { useState, useEffect } from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { educationService } from '@/services/educationService';
import { BookOpenIcon, PlayIcon, FireIcon } from '@heroicons/react/24/solid';

const EducationHub: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'course' | 'news'>('course');
    const [activeLevel, setActiveLevel] = useState('Level 1');
    const [resources, setResources] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Data loading function
    const loadData = async () => {
        setLoading(true);
        try {
            // Filter by type='News' if news tab, or level if course tab
            const type = activeTab === 'news' ? 'News' : undefined;
            const level = activeTab === 'course' ? activeLevel : undefined;

            const data = await educationService.getAllResources(level, type);
            setResources(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, [activeTab, activeLevel]);

    const levels = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'];

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="text-center py-10 bg-slate-900 rounded-3xl relative overflow-hidden">
                <div className="absolute inset-0 bg-blue-600/10 animate-pulse"></div>
                <h1 className="text-4xl font-bold text-white relative z-10">Cosmo Academy</h1>
                <p className="text-gray-400 mt-2 relative z-10">Master Crypto Trading: Zero to Hero</p>
            </div>

            {/* Tabs */}
            <div className="flex justify-center gap-4">
                <Button
                    variant={activeTab === 'course' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('course')}
                >
                    🎓 Full Course
                </Button>
                <Button
                    variant={activeTab === 'news' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('news')}
                >
                    📰 Latest News
                </Button>
            </div>

            {/* Course Levels (Only show if Course tab is active) */}
            {activeTab === 'course' && (
                <div className="flex overflow-x-auto gap-2 pb-4 justify-center">
                    {levels.map(lvl => (
                        <button
                            key={lvl}
                            onClick={() => setActiveLevel(lvl)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeLevel === lvl
                                    ? 'bg-blue-500 text-white shadow-lg scale-105'
                                    : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                                }`}
                        >
                            {lvl}
                        </button>
                    ))}
                </div>
            )}

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <p className="text-center col-span-full text-gray-500">Loading knowledge...</p>
                ) : resources.length > 0 ? (
                    resources.map((res) => (
                        <Card key={res.id} className="hover:shadow-xl transition-all border-l-4 border-blue-500">
                            <div className="flex justify-between items-start mb-3">
                                <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded">
                                    {res.category}
                                </span>
                                {res.type === 'News' && <FireIcon className="h-5 w-5 text-orange-500" />}
                            </div>
                            <h3 className="font-bold text-lg mb-2 line-clamp-2">{res.title}</h3>
                            <p className="text-sm text-gray-500 mb-4 line-clamp-3">{res.description}</p>
                            <a
                                href={res.link}
                                target="_blank"
                                className="text-blue-500 text-sm font-bold hover:underline flex items-center gap-1"
                            >
                                {res.type === 'Course' ? 'Start Lesson' : 'Read Article'} <PlayIcon className="h-4 w-4" />
                            </a>
                        </Card>
                    ))
                ) : (
                    <div className="col-span-full text-center py-10 bg-gray-50 dark:bg-white/5 rounded-xl border border-dashed">
                        <BookOpenIcon className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                        <p>No content found. Please run the initialization script.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EducationHub;
