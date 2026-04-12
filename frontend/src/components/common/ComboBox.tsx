import React, { useState, useRef, useEffect } from 'react';

interface ComboBoxProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    inputClassName?: string;
    icon?: React.ReactNode;
}

const ComboBox: React.FC<ComboBoxProps> = ({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    disabled = false,
    className = '',
    inputClassName = '',
    icon
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Initial search term is the value
    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search term if not matched with an option
                if (!options.includes(searchTerm)) {
                    setSearchTerm(value);
                }
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [wrapperRef, searchTerm, value, options]);

    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            {icon && (
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    {icon}
                </div>
            )}
            <input
                type="text"
                value={isOpen ? searchTerm : value}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => {
                    setSearchTerm('');
                    setIsOpen(true);
                }}
                disabled={disabled}
                placeholder={placeholder}
                className={`bg-black/30 border border-white/10 rounded-md py-1 px-2 text-xs font-mono text-white w-full focus:border-brand-primary outline-none cursor-text hover:bg-black/40 transition-colors ${icon ? 'pl-9' : ''} ${inputClassName}`}
            />
            
            {/* Custom Arrow */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {isOpen && (
                <ul className="absolute z-50 w-full mt-1 bg-brand-darkest border border-white/10 rounded-md shadow-lg max-h-48 overflow-y-auto custom-scrollbar no-scrollbar">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                            <li
                                key={option}
                                onClick={() => {
                                    onChange(option);
                                    setSearchTerm(option);
                                    setIsOpen(false);
                                }}
                                className={`px-2 py-1.5 text-xs font-mono text-white cursor-pointer hover:bg-brand-primary/20 hover:text-brand-primary transition-colors ${option === value ? 'bg-brand-primary/10 text-brand-primary' : ''}`}
                            >
                                {option}
                            </li>
                        ))
                    ) : (
                        <li className="px-2 py-1.5 text-xs font-mono text-gray-500 text-center">
                            No match
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
};

export default ComboBox;
