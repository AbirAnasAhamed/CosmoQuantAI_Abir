import React, { useState, useEffect } from 'react';
import api from '@/services/client';

interface AssetSearchControlProps {
    activeExchange: string;
    setActiveExchange: (exchange: string) => void;
    activePair: string;
    setActivePair: (pair: string) => void;
}

interface Exchange {
    id: string;
    name: string;
    popular: boolean;
}

const AssetSearchControl: React.FC<AssetSearchControlProps> = ({
    activeExchange,
    setActiveExchange,
    activePair,
    setActivePair
}) => {
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const [pairs, setPairs] = useState<string[]>([]);
    const [loadingExchanges, setLoadingExchanges] = useState(false);
    const [loadingPairs, setLoadingPairs] = useState(false);

    // Initial load of exchanges
    useEffect(() => {
        const fetchExchanges = async () => {
            setLoadingExchanges(true);
            try {
                // Assuming we have a base URL set in client or this is relative to API
                const response = await api.get('/market/exchanges');
                setExchanges(response.data);

                // Set default if none selected and data exists
                if (!activeExchange && response.data.length > 0) {
                    // Optionally set a default like 'binance' if present
                    const binance = response.data.find((e: Exchange) => e.id === 'binance');
                    if (binance) setActiveExchange('binance');
                }
            } catch (error) {
                console.error("Failed to load exchanges", error);
            } finally {
                setLoadingExchanges(false);
            }
        };
        fetchExchanges();
    }, []);

    // Load pairs when exchange changes
    useEffect(() => {
        if (!activeExchange) return;

        const fetchPairs = async () => {
            setLoadingPairs(true);
            try {
                const response = await api.get(`/market/pairs/${activeExchange}`);
                setPairs(response.data);
            } catch (error) {
                console.error(`Failed to load pairs for ${activeExchange}`, error);
                setPairs([]);
            } finally {
                setLoadingPairs(false);
            }
        };

        fetchPairs();
    }, [activeExchange]);

    return (
        <div className="flex gap-2 w-full md:w-auto">
            {/* Exchange Selector */}
            <div className="relative min-w-[120px]">
                <select
                    value={activeExchange}
                    onChange={(e) => {
                        setActiveExchange(e.target.value);
                        setActivePair(''); // Reset pair when exchange changes
                    }}
                    disabled={loadingExchanges}
                    className="w-full bg-white dark:bg-brand-dark/50 border border-brand-border-light dark:border-brand-border-dark rounded-md px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none appearance-none cursor-pointer"
                >
                    <option value="" disabled>Select Exchange</option>
                    {loadingExchanges ? (
                        <option>Loading...</option>
                    ) : (
                        exchanges.map(ex => (
                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))
                    )}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>

            {/* Pair Selector */}
            <div className="relative min-w-[160px] flex-1">
                <SearchableDropdown
                    options={pairs}
                    value={activePair}
                    onChange={setActivePair}
                    placeholder="Select Pair"
                    disabled={!activeExchange || loadingPairs}
                    isLoading={loadingPairs}
                />
            </div>
        </div>
    );
};

// Internal reusable searchable dropdown (simplified version of SearchableSelect or reusing logic)
// To keep it self-contained or we can import existing SearchableSelect if it supports what we need.
// The existing SearchableSelect looks good, let's wrap it or use similar logic if we need customization.
// Looking at the requirements, the user wants "Searchable Dropdown". 
// The existing `SearchableSelect.tsx` is:
// interface SearchableSelectProps { options: string[]; value: string; onChange: ... }
// It exactly fits our needs for the pair selector.

import SearchableSelect from './SearchableSelect';

const SearchableDropdown: React.FC<any> = ({ options, value, onChange, placeholder, disabled, isLoading }) => {
    if (isLoading) {
        return (
            <div className="w-full bg-white dark:bg-brand-dark/50 border border-brand-border-light dark:border-brand-border-dark rounded-md px-3 py-2 text-sm text-gray-500">
                Loading markets...
            </div>
        )
    }

    return (
        <SearchableSelect
            options={options}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
        />
    )
}

export default AssetSearchControl;
