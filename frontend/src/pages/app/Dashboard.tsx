import React, { useState, useCallback, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Sector } from 'recharts';
import { BotLabIcon, BacktesterIcon, AIFoundryIcon, TradingIcon } from '@/constants';
import { useTheme } from '@/context/ThemeContext';
import { getDashboardSummary, DashboardSummary } from '@/services/dashboard';
import { getPerformanceMetrics, PerformanceMetrics } from '@/services/analytics';
import WhaleMovementWidget from './WhaleMovementWidget';
import SystemHealthWidget from '@/components/features/system/SystemHealthWidget';

// Icons for the dashboard
const TrendingUpIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
);

const WalletIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CpuIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
);

const ActivityIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const AnimatedNumber: React.FC<{ value: number; isCurrency?: boolean }> = ({ value, isCurrency = false }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let start = 0;
        const end = value;
        if (start === end) return;

        const duration = 1500;
        const range = end - start;
        let current = start;
        const increment = end > start ? 1 : -1;
        const stepTime = Math.abs(Math.floor(duration / range));

        const timer = setInterval(() => {
            current += increment * Math.max(1, Math.floor(range / 100));
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                current = end;
                clearInterval(timer);
            }
            setDisplayValue(current);
        }, stepTime > 0 ? stepTime : 1);

        return () => clearInterval(timer);
    }, [value]);

    return (
        <span className="animate-count-up inline-block">
            {isCurrency ? `$${Math.round(displayValue).toLocaleString()}` : displayValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </span>
    );
};

const KpiCard: React.FC<{
    title: string;
    value: number;
    isCurrency?: boolean;
    change?: number;
    icon: React.ReactNode;
    colorClass: string;
    animationDelay: number
}> = ({ title, value, isCurrency = false, change, icon, colorClass, animationDelay }) => (
    <div
        className={`relative group p-6 rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl staggered-fade-in`}
        style={{ animationDelay: `${animationDelay}ms` }}
    >
        {/* Background Glow */}
        <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 group-hover:opacity-20 transition-opacity blur-2xl ${colorClass}`}></div>

        <div className="flex justify-between items-start relative z-10">
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
                <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
                    <AnimatedNumber value={value} isCurrency={isCurrency} />
                </h3>
                {change !== undefined && (
                    <div className={`flex items-center mt-2 text-sm font-bold ${change >= 0 ? 'text-brand-success' : 'text-brand-danger'}`}>
                        <span className="mr-1">{change >= 0 ? '▲' : '▼'}</span>
                        {Math.abs(change)}%
                        <span className="ml-2 text-gray-400 font-normal text-xs">vs last 24h</span>
                    </div>
                )}
            </div>
            <div className={`p-3 rounded-xl bg-gray-50 dark:bg-white/5 ${colorClass.replace('bg-', 'text-').replace('opacity-10', '')}`}>
                {icon}
            </div>
        </div>
    </div>
);

const ActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
    return (
        <g className="pie-explode">
            <text x={cx} y={cy - 10} dy={8} textAnchor="middle" fill={fill} className="text-lg font-bold dark:fill-white">
                {payload.name}
            </text>
            <text x={cx} y={cy + 10} dy={8} textAnchor="middle" fill="#9CA3AF" className="text-sm">
                {`$${payload.value.toLocaleString()}`}
            </text>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 8}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
            />
            <Sector
                cx={cx}
                cy={cy}
                startAngle={startAngle}
                endAngle={endAngle}
                innerRadius={outerRadius + 12}
                outerRadius={outerRadius + 13}
                fill={fill}
            />
        </g>
    );
};

const QuickActionBtn: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void }> = ({ icon, label, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center justify-center p-4 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-transparent hover:border-brand-primary/30 transition-all duration-300 group">
        <div className="w-10 h-10 rounded-full bg-white dark:bg-brand-darkest flex items-center justify-center text-brand-primary mb-2 shadow-sm group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
    </button>
);

const Dashboard: React.FC = () => {
    const { theme } = useTheme();
    const COLORS = ['#6366F1', '#818CF8', '#A78BFA', '#F472B6', '#10B981', '#F59E0B'];

    const axisColor = theme === 'dark' ? '#9CA3AF' : '#6B7280';
    const gridColor = theme === 'dark' ? '#334155' : '#E2E8F0';
    const tooltipStyle = theme === 'dark'
        ? { backgroundColor: 'rgba(30, 41, 59, 0.9)', border: '1px solid #334155', borderRadius: '12px', color: '#FFF', backdropFilter: 'blur(4px)' }
        : { backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #E2E8F0', borderRadius: '12px', color: '#000', backdropFilter: 'blur(4px)' };

    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [dashboardData, setDashboardData] = useState<DashboardSummary | null>(null);
    const [analyticsData, setAnalyticsData] = useState<PerformanceMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTimeframe, setActiveTimeframe] = useState<string>('1M');

    const onPieEnter = useCallback((_: any, index: number) => {
        setActiveIndex(index);
    }, []);

    const onPieLeave = useCallback(() => {
        setActiveIndex(null);
    }, []);

    // Initial Data Fetch
    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getDashboardSummary();
                const analytics = await getPerformanceMetrics();
                setDashboardData(data);
                setAnalyticsData(analytics);
            } catch (error) {
                console.error("Failed to fetch dashboard data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    // Websocket Connection
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = token
            ? `${protocol}//${window.location.host}/api/v1/dashboard/ws?token=${token}`
            : null;

        if (!wsUrl) return; // No token = no WS

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to Dashboard WS');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'DASHBOARD_UPDATE' && message.data) {
                    setDashboardData(prev => prev ? {
                        ...prev,
                        ...message.data
                    } : null);
                }
            } catch (err) {
                console.error("WS Message Error", err);
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, []);

    // Fallback or Loading State
    const totalPortfolioValue = dashboardData?.total_equity || 0;
    const totalBots = dashboardData?.active_bots || 0;
    const winRate = dashboardData?.avg_win_rate || 0;
    const bots = dashboardData?.bots || [];
    const recentBacktests = dashboardData?.recent_backtests || [];
    const portfolioValueData = dashboardData?.portfolio_value || [];
    const portfolioAllocationData = dashboardData?.portfolio_allocation || [];

    if (isLoading && !dashboardData) {
        return <div className="p-10 text-center">Loading Dashboard...</div>;
    }

    return (
        <div className="space-y-8">

            {/* Welcome Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in-down">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                        Command Center
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Welcome back, <span className="text-brand-primary font-semibold">Abir</span>. Systems are optimal.
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-brand-dark/50 px-4 py-2 rounded-full border border-brand-border-light dark:border-brand-border-dark shadow-sm">
                    <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-success opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-success"></span>
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Market Pulse: Bullish</span>
                </div>
            </div>

            {/* KPI Grid - Bento Style */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    title="Total Equity"
                    value={totalPortfolioValue}
                    isCurrency={true}
                    change={dashboardData?.equity_change_24h}
                    icon={<WalletIcon className="w-6 h-6" />}
                    colorClass="bg-brand-primary"
                    animationDelay={100}
                />
                <KpiCard
                    title="24h Profit"
                    value={dashboardData?.total_profit_24h || 0}
                    isCurrency={true}
                    change={dashboardData?.profit_change_24h}
                    icon={<TrendingUpIcon className="w-6 h-6" />}
                    colorClass="bg-brand-success"
                    animationDelay={200}
                />
                <KpiCard
                    title="Active Bots"
                    value={totalBots}
                    icon={<CpuIcon className="w-6 h-6" />}
                    colorClass="bg-blue-500"
                    animationDelay={300}
                />
                <KpiCard
                    title="Win Rate"
                    value={winRate}
                    change={dashboardData?.win_rate_change_24h}
                    icon={<ActivityIcon className="w-6 h-6" />}
                    colorClass="bg-purple-500"
                    animationDelay={400}
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Area Chart */}
                <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg staggered-fade-in" style={{ animationDelay: '500ms' }}>
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Portfolio Performance</h2>
                            <p className="text-xs text-gray-500">Net Asset Value over time</p>
                        </div>
                        <div className="flex gap-2">
                            {['1W', '1M', '1Y', 'ALL'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => setActiveTimeframe(t)}
                                    className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                                        t === activeTimeframe
                                            ? 'bg-brand-primary text-white'
                                            : 'bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-80 w-full min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={portfolioValueData}>
                                <defs>
                                    <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} opacity={0.5} />
                                <XAxis dataKey="name" stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke={axisColor} tickFormatter={(value) => `$${Number(value) / 1000}k`} fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#6366F1', strokeWidth: 1, strokeDasharray: '5 5' }} />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#6366F1"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#portfolioGradient)"
                                    activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Asset Allocation Donut */}
                <div className="lg:col-span-1 rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg flex flex-col staggered-fade-in" style={{ animationDelay: '600ms' }}>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Allocation</h2>
                    <div className="flex-1 relative min-h-[300px]" style={{ minHeight: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={portfolioAllocationData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                    {...({ activeIndex: activeIndex !== null ? activeIndex : undefined } as any)}
                                    activeShape={ActiveShape}
                                    onMouseEnter={onPieEnter}
                                    onMouseLeave={onPieLeave}
                                    paddingAngle={5}
                                    cornerRadius={4}
                                >
                                    {portfolioAllocationData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bottom Section Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Active Bots Command Center */}
                <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg staggered-fade-in" style={{ animationDelay: '700ms' }}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <CpuIcon className="w-5 h-5 text-brand-primary" /> Active Bot Matrix
                        </h2>
                        <button className="text-xs font-bold text-brand-primary hover:underline">View All Bots &rarr;</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {bots.length > 0 ? bots.map((bot) => (
                            <div key={bot.id} className="flex items-center p-4 rounded-xl bg-gray-50 dark:bg-brand-darkest/50 border border-transparent hover:border-brand-primary/30 transition-all duration-300 group">
                                <div className="relative">
                                    <div className={`w-3 h-3 rounded-full ${bot.pnl >= 0 ? 'bg-brand-success' : 'bg-brand-danger'} animate-pulse`}></div>
                                </div>
                                <div className="ml-4 flex-1">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-brand-primary transition-colors">{bot.name}</h4>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{bot.market} • {bot.strategy}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold text-sm ${bot.pnl >= 0 ? 'text-brand-success' : 'text-brand-danger'}`}>
                                                {bot.pnl >= 0 ? '+' : ''}${bot.pnl.toFixed(2)}
                                            </p>
                                            <p className="text-[10px] text-gray-400">ROI: {bot.pnl_percent}%</p>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-1 rounded-full mt-3 overflow-hidden">
                                        <div
                                            className="bg-brand-primary h-full rounded-full transition-all duration-500"
                                            style={{ width: `${Math.min(Math.max(Math.abs(bot.pnl_percent), 0), 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="col-span-2 text-center text-gray-500 py-10">
                                No active bots running. Start a strategy to see metrics here.
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions & Recent Backtests */}
                <div className="lg:col-span-1 space-y-6">
                    {/* System Health Widget */}
                    <SystemHealthWidget />

                    {/* Quick Actions */}
                    <div className="rounded-2xl bg-gradient-to-br from-brand-primary to-purple-600 p-6 shadow-lg text-white staggered-fade-in" style={{ animationDelay: '800ms' }}>
                        <h2 className="text-lg font-bold mb-4">Quick Launch</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <QuickActionBtn icon={<BotLabIcon />} label="New Bot" />
                            <QuickActionBtn icon={<BacktesterIcon />} label="Backtest" />
                            <QuickActionBtn icon={<AIFoundryIcon />} label="AI Foundry" />
                            <QuickActionBtn icon={<TradingIcon />} label="Trade" />
                        </div>
                    </div>


                    {/* Risk Analysis Card */}
                    <div className="rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg staggered-fade-in" style={{ animationDelay: '850ms' }}>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Risk Analysis</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-50 dark:bg-brand-darkest/50 rounded-xl">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Sharpe Ratio</p>
                                <p className="text-xl font-bold text-brand-primary">{analyticsData?.sharpe_ratio?.toFixed(2) || '0.00'}</p>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-brand-darkest/50 rounded-xl">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Win Rate</p>
                                <p className="text-xl font-bold text-brand-success">{analyticsData?.win_rate?.toFixed(1) || '0.0'}%</p>
                            </div>
                        </div>
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">Max Drawdown</p>
                                <p className="text-lg font-bold text-red-600 dark:text-red-400">{analyticsData?.max_drawdown?.toFixed(2) || '0.00'}%</p>
                            </div>
                            <div className="w-full bg-red-100 dark:bg-red-900/30 h-1.5 rounded-full overflow-hidden">
                                <div
                                    className="bg-red-500 h-full rounded-full"
                                    style={{ width: `${Math.min(analyticsData?.max_drawdown || 0, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* Whale Alert Widget */}
                    <WhaleMovementWidget />

                    {/* Recent Log */}
                    <div className="rounded-2xl bg-white dark:bg-brand-dark border border-brand-border-light dark:border-brand-border-dark p-6 shadow-lg flex-1 staggered-fade-in" style={{ animationDelay: '900ms' }}>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Backtests</h2>
                        <div className="space-y-3">
                            {recentBacktests.length > 0 ? recentBacktests.slice(0, 3).map(result => (
                                <div key={result.id} className="flex justify-between items-center text-sm p-2 hover:bg-gray-50 dark:hover:bg-brand-darkest/50 rounded-lg transition-colors cursor-pointer">
                                    <div>
                                        <p className="font-semibold text-slate-900 dark:text-white">{result.strategy}</p>
                                        <p className="text-xs text-gray-500">{result.market} • {result.timeframe}</p>
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs font-bold ${result.profit_percent >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
                                        {result.profit_percent > 0 ? '+' : ''}{result.profit_percent}%
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center text-gray-500 py-4">
                                    No recent backtests.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
