import React, { useState } from 'react';
import StandardLiquidationView from './StandardLiquidationView';
import GodModeLiquidationView from './GodModeLiquidationView';

const LiquidationMap: React.FC = () => {
    const [isGodMode, setIsGodMode] = useState(false);

    return (
        <div className="h-full flex flex-col relative overflow-hidden">
            {/* Toggle Switch Header (Absolute positioned to float over the top right) */}
            <div className="absolute top-4 right-4 z-[100]">
                <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md p-1.5 px-3 rounded-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] cursor-pointer" onClick={() => setIsGodMode(!isGodMode)}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${!isGodMode ? 'text-brand-primary drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]' : 'text-gray-500'}`}>Standard</span>
                    
                    <div 
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-500 focus:outline-none ${isGodMode ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]' : 'bg-gray-700'}`}
                    >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-500 ease-in-out ${isGodMode ? 'translate-x-4.5' : 'translate-x-1'}`} style={{ transform: isGodMode ? 'translateX(18px)' : 'translateX(4px)' }} />
                    </div>

                    <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${isGodMode ? 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]' : 'text-gray-500'}`}>God Mode</span>
                </div>
            </div>

            {/* View Container */}
            <div className="flex-1 min-h-0 relative">
                {/* We use key to force unmount/remount to cleanly handle heavy charting libraries */}
                {isGodMode ? (
                    <div key="god-mode" className="absolute inset-0 animate-fade-in">
                        <GodModeLiquidationView />
                    </div>
                ) : (
                    <div key="standard-mode" className="absolute inset-0 animate-fade-in text-white pt-4">
                        <StandardLiquidationView />
                    </div>
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeIn {
                    from { opacity: 0; filter: blur(4px); }
                    to { opacity: 1; filter: blur(0); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.4s ease-out forwards;
                }
            `}} />
        </div>
    );
};

export default LiquidationMap;
