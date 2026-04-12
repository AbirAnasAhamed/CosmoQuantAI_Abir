import React, { useState, useEffect } from 'react';
import { ActiveBot as Bot } from '../../types';
import { botService } from '../../services/botService';
import { toast } from 'react-hot-toast';

interface BotSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    bot: Bot | null;
    onUpdate: (updatedBot: Bot) => void;
}

const BotSettingsModal: React.FC<BotSettingsModalProps> = ({ isOpen, onClose, bot, onUpdate }) => {
    // ১. সাধারণ সেটিংস স্টেট
    const [generalConfig, setGeneralConfig] = useState({
        trade_value: 0,
        stop_loss: 0,
        take_profit: 0,
        leverage: 1,
        strategy_name: 'RSI Strategy',
    });

    // ২. ডাইনামিক স্ট্র্যাটেজি প্যারামিটার স্টেট
    const [strategyParams, setStrategyParams] = useState<any>({});

    // ৩. স্ট্র্যাটেজি অনুযায়ী ডিফল্ট প্যারামিটার ম্যাপ
    const defaultParams: any = {
        "RSI Strategy": { period: 14, lower: 30, upper: 70 },
        "MACD Strategy": { fast_period: 12, slow_period: 26, signal_period: 9 },
        "Bollinger Bands": { period: 20, devfactor: 2.0 },
        "SMA Cross": { fast_period: 10, slow_period: 30 }
    };

    // ৪. বট ওপেন হলে ডাটা লোড করা
    useEffect(() => {
        if (bot) {
            const currentStrategy = bot.strategy || "RSI Strategy";

            setGeneralConfig({
                trade_value: bot.trade_value || 100,
                stop_loss: bot.config?.riskParams?.stopLoss || 0,
                take_profit: bot.config?.riskParams?.takeProfits?.[0]?.target || 0,
                leverage: bot.config?.leverage || 1,
                strategy_name: currentStrategy,
            });

            // ডাটাবেসে সেভ করা কনফিগ অথবা ডিফল্ট প্যারামিটার লোড
            const savedParams = bot.config || {};
            const defaults = defaultParams[currentStrategy] || {};

            // সেভ করা প্যারামিটারগুলো স্টেটে সেট করা (বাকিগুলো ডিফল্ট)
            setStrategyParams({ ...defaults, ...savedParams });
        }
    }, [bot, isOpen]);

    // ৫. স্ট্র্যাটেজি চেঞ্জ হলে প্যারামিটার রিসেট করা
    const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStrategy = e.target.value;
        setGeneralConfig(prev => ({ ...prev, strategy_name: newStrategy }));
        setStrategyParams(defaultParams[newStrategy] || {});
    };

    // ৬. প্যারামিটার ইনপুট হ্যান্ডলার
    const handleParamChange = (key: string, value: string) => {
        setStrategyParams((prev: any) => ({
            ...prev,
            [key]: Number(value) // সব সময় নাম্বার হিসেবে সেভ হবে
        }));
    };

    // ৭. সেভ ফাংশন
    const handleSave = async () => {
        if (!bot) return;

        try {
            const updatePayload = {
                trade_value: Number(generalConfig.trade_value),
                strategy: generalConfig.strategy_name,
                config: {
                    ...bot.config,
                    ...strategyParams,
                    leverage: Number(generalConfig.leverage),
                    stop_loss: Number(generalConfig.stop_loss),
                    take_profit: Number(generalConfig.take_profit),
                    amount_per_trade: Number(generalConfig.trade_value),
                    riskParams: {
                        ...bot.config?.riskParams,
                        stopLoss: Number(generalConfig.stop_loss),
                        takeProfits: [
                            { target: Number(generalConfig.take_profit), amount: 100 }
                        ]
                    }
                }
            };

            const updatedBot = await botService.updateBot(bot.id, updatePayload);

            toast.success('Configuration updated successfully!');
            onUpdate(updatedBot);
            onClose();

        } catch (error) {
            console.error(error);
            toast.error('Failed to update settings');
        }
    };

    // UI রেন্ডারিং লজিক (ফিল্ড জেনারেটর)
    const renderStrategyInputs = () => {
        return Object.keys(strategyParams).map((key) => {
            const value = strategyParams[key];

            // ১. অবজেক্ট বা অ্যারে বাদ দিন
            if (typeof value === 'object') return null;

            // ২. অপ্রয়োজনীয় কী বাদ দিন
            if (['riskParams', 'leverage', 'deploymentTarget', 'exchange', 'market'].includes(key)) return null;

            // ৩. টাইপ চেক: ভ্যালু যদি স্ট্রিং হয় (যেমন "Market"), তবে টেক্সট ইনপুট দিন, নাহলে নাম্বার
            const inputType = typeof value === 'string' && isNaN(Number(value)) ? 'text' : 'number';

            return (
                <div key={key}>
                    <label className="text-xs text-gray-400 block mb-1 capitalize">
                        {key.replace(/_/g, ' ')}
                    </label>
                    <input
                        type={inputType} // 👈 ডাইনামিক টাইপ
                        value={value !== null && value !== undefined ? value : ''}
                        onChange={(e) => handleParamChange(key, e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-purple-500 outline-none"
                    />
                </div>
            );
        });
    };

    if (!isOpen || !bot) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-lg p-6 shadow-2xl">

                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        ⚙️ Configure {bot.name}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                {/* Scrollable Body */}
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">

                    {/* 1. General Trade Settings */}
                    <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600/50">
                        <h3 className="text-sm font-semibold text-blue-400 mb-3">💰 Trade Settings</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Trade Amount (USDT)</label>
                                <input
                                    type="number"
                                    value={generalConfig.trade_value}
                                    onChange={(e) => setGeneralConfig({ ...generalConfig, trade_value: Number(e.target.value) })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs text-gray-400 block">Leverage</label>
                                    <span className="text-blue-400 font-bold text-xs">{generalConfig.leverage}x</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="125"
                                    step="1"
                                    value={generalConfig.leverage}
                                    onChange={(e) => setGeneralConfig({ ...generalConfig, leverage: Number(e.target.value) })}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 2. Risk Management */}
                    <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600/50">
                        <h3 className="text-sm font-semibold text-red-400 mb-3">🛡️ Risk Management</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Stop Loss (%)</label>
                                <input
                                    type="number"
                                    value={generalConfig.stop_loss}
                                    onChange={(e) => setGeneralConfig({ ...generalConfig, stop_loss: Number(e.target.value) })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-red-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Take Profit (%)</label>
                                <input
                                    type="number"
                                    value={generalConfig.take_profit}
                                    onChange={(e) => setGeneralConfig({ ...generalConfig, take_profit: Number(e.target.value) })}
                                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-green-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 3. Strategy Configuration (Dynamic) */}
                    <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600/50">
                        <h3 className="text-sm font-semibold text-purple-400 mb-3">🧠 Strategy Parameters</h3>

                        {/* Strategy Selector */}
                        <div className="mb-4">
                            <label className="text-xs text-gray-400 block mb-1">Active Strategy</label>
                            <select
                                value={generalConfig.strategy_name}
                                onChange={handleStrategyChange}
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-purple-500 outline-none"
                            >
                                <option value="RSI Strategy">RSI Strategy</option>
                                <option value="MACD Strategy">MACD Strategy</option>
                                <option value="Bollinger Bands">Bollinger Bands</option>
                                <option value="SMA Cross">SMA Crossover</option>
                            </select>
                        </div>

                        {/* Dynamic Inputs */}
                        <div className="grid grid-cols-2 gap-4">
                            {renderStrategyInputs()}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 rounded bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition"
                    >
                        Save Configuration
                    </button>
                </div>

            </div>
        </div>
    );
};

export default BotSettingsModal;
