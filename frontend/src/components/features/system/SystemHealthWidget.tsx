
import React, { useState, useEffect } from 'react';
import { Activity, Database, Server, Cpu } from 'lucide-react';
import { systemService, SystemHealth } from '@/services/systemService';

const SystemHealthWidget: React.FC = () => {
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);

    const fetchHealth = async () => {
        try {
            // setError(false); // Optional: reset error on retry?
            // If we want to show 'offline' on error, we handle it in catch
            const data = await systemService.getSystemHealth();
            setHealth(data);
            setError(false);
        } catch (err) {
            console.error("Health Check Failed:", err);
            setError(true);
            setHealth(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    // Helper for status colors
    const getStatusColor = (status: string) => {
        if (status === 'online' || status === 'healthy') return 'bg-green-500 text-green-500';
        if (status === 'degraded') return 'bg-yellow-500 text-yellow-500';
        return 'bg-red-500 text-red-500';
    };

    const getBadgeColor = (status: string) => {
        if (status === 'online' || status === 'healthy') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
        if (status === 'degraded') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    };

    // If initial loading
    if (loading && !health && !error) {
        return (
            <div className="rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg animate-pulse">
                <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                <div className="space-y-3">
                    <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                    <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                </div>
            </div>
        );
    }

    // Determine overall display state
    const overallStatus = error ? 'unhealthy' : (health?.status || 'unhealthy');
    const dbStatus = error ? 'offline' : (health?.services.database || 'offline');
    const redisStatus = error ? 'offline' : (health?.services.redis || 'offline');
    const celeryStatus = error ? 'offline' : (health?.services.celery_worker || 'offline');

    return (
        <div className="rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg staggered-fade-in">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-brand-primary" /> System Status
                </h2>

                {/* Pulsing Dot for Overall Status */}
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${overallStatus === 'healthy' ? 'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20' : overallStatus === 'degraded' ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-900/20' : 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20'}`}>
                    <div className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${overallStatus === 'healthy' ? 'bg-green-500' : overallStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${overallStatus === 'healthy' ? 'bg-green-500' : overallStatus === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                    </div>
                    <span className={`text-xs font-bold uppercase ${overallStatus === 'healthy' ? 'text-green-700 dark:text-green-400' : overallStatus === 'degraded' ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                        {overallStatus}
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {/* Database */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-brand-darkest/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-brand-dark shadow-sm text-blue-500">
                            <Database className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Database</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getBadgeColor(dbStatus)}`}>
                        {dbStatus}
                    </span>
                </div>

                {/* Redis */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-brand-darkest/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-brand-dark shadow-sm text-red-500">
                            <Server className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Redis Cache</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getBadgeColor(redisStatus)}`}>
                        {redisStatus}
                    </span>
                </div>

                {/* Celery Worker */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-brand-darkest/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white dark:bg-brand-dark shadow-sm text-orange-500">
                            <Cpu className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">AI Workers</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getBadgeColor(celeryStatus)}`}>
                        {celeryStatus === 'online' ? 'Active' : celeryStatus}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default SystemHealthWidget;
