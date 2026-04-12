
import React, { useState } from 'react';
import { useWeb3Swap } from '@/hooks/useWeb3Swap';
import Button from '@/components/common/Button';
import { ArrowDown, Wallet, RefreshCw, Zap } from 'lucide-react';

const PROTOCOLS = [
    { id: 'UNISWAP_V3', name: 'Uniswap V3 (ETH)', chainId: 1 },
    { id: 'PANCAKESWAP', name: 'PancakeSwap (BSC)', chainId: 56 },
];

const DEXExecutionWidget: React.FC = () => {
    const { connectWallet, getQuote, executeSwap, account, isConnected, isConnecting, error } = useWeb3Swap();

    const [protocol, setProtocol] = useState(PROTOCOLS[0].id);
    const [tokenIn, setTokenIn] = useState('');
    const [tokenOut, setTokenOut] = useState('');
    const [amount, setAmount] = useState('');
    const [estimatedOut, setEstimatedOut] = useState<string | null>(null);
    const [isQuoting, setIsQuoting] = useState(false);

    const handleConnect = () => {
        connectWallet();
    };

    const handleGetQuote = async () => {
        if (!tokenIn || !tokenOut || !amount) return;
        setIsQuoting(true);
        // Mock path for now, in real app would use a routing API
        const path = [tokenIn, tokenOut];
        try {
            const quote = await getQuote(protocol as any, amount, path);
            setEstimatedOut(quote);
        } finally {
            setIsQuoting(false);
        }
    };

    const handleSwap = async () => {
        if (!tokenIn || !tokenOut || !amount) return;
        // Mock execution
        await executeSwap(protocol as any, amount, estimatedOut || '0', [tokenIn, tokenOut], account || '', Date.now() + 1200);
        alert("Swap transaction prepared (Mock execution)");
    };

    return (
        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Zap size={120} />
            </div>

            <div className="flex justify-between items-start mb-6 align-top">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <RefreshCw size={20} className="text-cyan-400" />
                        DeFi Execution Protocol
                    </h3>
                    <p className="text-xs text-gray-400">Direct Router Interaction</p>
                </div>
                {!isConnected ? (
                    <Button
                        size="sm"
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="bg-orange-600/20 text-orange-400 border-orange-600/50 hover:bg-orange-600/30"
                    >
                        {isConnecting ? 'Connecting...' : <><Wallet size={16} className="mr-2" /> Connect Wallet</>}
                    </Button>
                ) : (
                    <div className="text-xs font-mono bg-cyan-950/50 text-cyan-400 px-3 py-1 rounded-full border border-cyan-500/20">
                        {account?.slice(0, 6)}...{account?.slice(-4)}
                    </div>
                )}
            </div>

            {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 text-red-200 text-xs rounded-lg">{error}</div>}

            <div className="space-y-4 relative z-10">

                {/* Protocol Selection */}
                <div>
                    <label className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1 block">Protocol</label>
                    <select
                        value={protocol}
                        onChange={(e) => setProtocol(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50 text-sm"
                    >
                        {PROTOCOLS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>

                {/* Swap Form */}
                <div className="p-4 bg-black/20 rounded-xl border border-white/5 space-y-2">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-400 mb-1 block">Token In (Address)</label>
                            <input
                                type="text"
                                placeholder="0x..."
                                value={tokenIn}
                                onChange={(e) => setTokenIn(e.target.value)}
                                className="w-full bg-transparent border-b border-white/10 focus:border-cyan-500 text-sm py-1 text-white outline-none"
                            />
                        </div>
                        <div className="w-1/3">
                            <label className="text-[10px] text-gray-400 mb-1 block">Amount</label>
                            <input
                                type="number"
                                placeholder="0.0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-transparent border-b border-white/10 focus:border-cyan-500 text-sm py-1 text-white outline-none text-right font-mono"
                            />
                        </div>
                    </div>

                    <div className="flex justify-center py-1">
                        <div className="bg-slate-800 p-1.5 rounded-full border border-white/10">
                            <ArrowDown size={14} className="text-gray-400" />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-400 mb-1 block">Token Out (Address)</label>
                            <input
                                type="text"
                                placeholder="0x..."
                                value={tokenOut}
                                onChange={(e) => setTokenOut(e.target.value)}
                                className="w-full bg-transparent border-b border-white/10 focus:border-cyan-500 text-sm py-1 text-white outline-none"
                            />
                        </div>
                        <div className="w-1/3">
                            <label className="text-[10px] text-gray-400 mb-1 block">Estimated Out</label>
                            <div className="text-right text-sm py-1 font-mono text-cyan-400 min-h-[24px]">
                                {isQuoting ? <span className="animate-pulse">Loading...</span> : estimatedOut || '-'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGetQuote}
                        className="flex-1 border-white/10 text-gray-300 hover:text-white"
                        disabled={!isConnected || !tokenIn || !tokenOut || !amount}
                    >
                        Check Rates
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleSwap}
                        className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600"
                        disabled={!isConnected || !estimatedOut}
                    >
                        Execute Swap (Test)
                    </Button>
                </div>

            </div>
        </div>
    );
};

export default DEXExecutionWidget;
