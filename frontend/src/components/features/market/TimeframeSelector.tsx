import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronDown, Check } from 'lucide-react';

export interface TimeframeSelectorProps {
    interval: string;
    onIntervalChange: (newInterval: string) => void;
}

interface TimeGroup {
    label: string;
    items: string[];
}

const TIME_GROUPS: TimeGroup[] = [
    { label: 'Seconds', items: ['1s', '5s', '15s', '30s'] },
    { label: 'Minutes', items: ['1m', '3m', '5m', '15m', '30m', '45m'] },
    { label: 'Hours', items: ['1h', '2h', '4h', '6h', '12h'] },
    { label: 'Daily', items: ['1d', '1w', '1M'] }
];

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({ interval, onIntervalChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Compute fixed position from button's bounding rect when opening
    const openDropdown = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 8, left: rect.left });
        }
        setIsOpen(true);
    };

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                buttonRef.current && !buttonRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Re-position on scroll/resize while open
    useEffect(() => {
        if (!isOpen) return;
        const update = () => {
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setDropdownPos({ top: rect.bottom + 8, left: rect.left });
            }
        };
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [isOpen]);

    const dropdown = isOpen ? (
        <div
            ref={dropdownRef}
            style={{ top: dropdownPos.top, left: dropdownPos.left, position: 'fixed', zIndex: 9999 }}
            className="w-[240px] bg-white/95 dark:bg-[#080D17]/95 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] p-2"
        >
            <div className="space-y-3 p-1">
                {TIME_GROUPS.map((group) => (
                    <div key={group.label}>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-[0.15em] px-2 mb-1.5 flex items-center gap-2">
                            {group.label}
                            <div className="h-px flex-1 bg-gray-100 dark:bg-white/5"></div>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {group.items.map((item) => {
                                const isSelected = interval === item;
                                return (
                                    <button
                                        key={item}
                                        onClick={() => { onIntervalChange(item); setIsOpen(false); }}
                                        className={`px-2 py-1.5 text-xs font-mono font-bold rounded-lg transition-all relative group
                                            ${isSelected
                                                ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25'
                                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-slate-950 dark:hover:text-white'
                                            }`}
                                    >
                                        {item}
                                        {isSelected && (
                                            <div className="absolute -top-1 -right-1 bg-white dark:bg-indigo-500 text-brand-primary dark:text-white rounded-full p-0.5 shadow-sm border border-brand-primary/10">
                                                <Check size={8} strokeWidth={4} />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/5 text-center">
                <span className="text-[9px] text-gray-400/60 font-medium tracking-tight">Select Chart Resolution</span>
            </div>
        </div>
    ) : null;

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                ref={buttonRef}
                onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
                className={`
                    flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300
                    ${isOpen
                        ? 'bg-white dark:bg-[#0B1120] border-brand-primary/60 shadow-[0_0_15px_rgba(59,130,246,0.2)] dark:shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                        : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-brand-primary/40 dark:hover:border-brand-primary/30 hover:bg-gray-50 dark:hover:bg-white/10'
                    }
                `}
            >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors
                    ${isOpen ? 'bg-brand-primary/20 text-brand-primary' : 'bg-gray-100 dark:bg-black/30 text-gray-500 dark:text-gray-400'}`}>
                    <Clock size={14} className={isOpen ? 'animate-pulse' : ''} />
                </div>
                <span className="text-sm font-mono font-bold tracking-tight text-slate-900 dark:text-white">
                    {interval}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-brand-primary' : ''}`} />
            </button>

            {/* Dropdown rendered via Portal — escapes any overflow:hidden parent */}
            {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
        </div>
    );
};
