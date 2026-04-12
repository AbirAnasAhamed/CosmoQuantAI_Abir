import React from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
    text: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
    return (
        <div className="group relative inline-flex items-center ml-1.5 cursor-help z-50">
            <Info className="w-4 h-4 text-slate-400 hover:text-slate-200 transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black/90 text-xs text-white rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-center border border-slate-700/50">
                {text}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/90"></div>
            </div>
        </div>
    );
};

export default InfoTooltip;
