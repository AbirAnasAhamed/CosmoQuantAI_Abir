import React from 'react';
import { BarChart2, TrendingUp, X } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import Button from '@/components/common/Button';
import type { ActiveBot, BacktestResult } from '@/types';

interface BacktestResultModalProps {
    bot: ActiveBot;
    result: BacktestResult;
    onClose: () => void;
}

const BacktestResultModal: React.FC<BacktestResultModalProps> = ({ bot, result, onClose }) => {
    // const { theme } = useTheme(); // Unused in original code, but imported.

    // Helper Component
    const StatBox = ({ label, value, isPositive }: any) => (
        <div className="bg-white/5 border border-white/5 p-5 rounded-2xl text-center hover:bg-white/10 transition-colors">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-bold font-mono ${isPositive === true ? 'text-emerald-400' : isPositive === false ? 'text-rose-400' : 'text-white'}`}>
                {value}
            </p>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="bg-slate-900 border border-white/10 w-full max-w-5xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-white/10 bg-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <BarChart2 className="text-cyan-400" /> Backtest Simulation Results
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">{bot.name} • {result.date}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatBox label="Total Profit" value={`${result.profitPercent > 0 ? '+' : ''}${result.profitPercent.toFixed(2)}%`} isPositive={result.profitPercent >= 0} />
                        <StatBox label="Max Drawdown" value={`${result.maxDrawdown.toFixed(2)}%`} isPositive={false} />
                        <StatBox label="Win Rate" value={`${result.winRate.toFixed(1)}%`} />
                        <StatBox label="Sharpe Ratio" value={result.sharpeRatio.toFixed(2)} />
                    </div>

                    {/* Chart Area */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2"><TrendingUp size={16} /> Equity Curve Simulation</h3>
                        {result.equity_curve && result.equity_curve.length > 0 ? (
                            <div className="h-80 w-full bg-black/20 rounded-2xl p-4 border border-white/5 relative overflow-hidden">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={result.equity_curve}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="name" stroke="#64748b" axisLine={false} tickLine={false} dy={10} fontSize={10} />
                                        <YAxis stroke="#64748b" tickFormatter={(value) => `$${Number(value) / 1000}k`} axisLine={false} tickLine={false} dx={-10} fontSize={10} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Line type="monotone" dataKey="value" name="Equity" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-80 w-full bg-black/20 rounded-2xl border border-white/5 flex items-center justify-center text-gray-500">
                                <p>No chart data available</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end bg-white/5">
                    <Button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white border-0">Close Report</Button>
                </div>
            </div>
        </div>
    );
};

export default BacktestResultModal;
