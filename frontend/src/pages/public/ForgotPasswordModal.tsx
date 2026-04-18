import React, { useState } from 'react';
import Button from '@/components/common/Button';
import { sendForgotPasswordRequest } from '@/services/auth';

interface ForgotPasswordModalProps {
    onClose: () => void;
    onBackToLogin: () => void;
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ onClose, onBackToLogin }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setStatus('idle');

        try {
            await sendForgotPasswordRequest(email);
            setStatus('success');
            setMessage(`Check your inbox! We've sent a reset link to ${email}.`);
        } catch (err: any) {
            setStatus('error');
            setMessage('Something went wrong. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    };

    const inputClasses = "w-full bg-[#0D1117] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]";

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#020610]/80 backdrop-blur-xl" onClick={onClose}></div>
            
            <div className="relative w-full max-w-sm bg-[#070F20]/90 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden p-6 md:p-8 animate-modal-fade-in group">
                
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />
                
                {/* Background Subtleties */}
                <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] animate-float-medium" />
                </div>

                <div className="relative z-10">
                    <div className="flex justify-center mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-600/20 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                            <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                    </div>

                    <h2 className="text-2xl font-extrabold text-white text-center tracking-tight mb-2">Access Recovery</h2>
                    <p className="text-sm text-slate-400 text-center mb-6">
                        Enter your commlink address to receive protocol reset instructions.
                    </p>

                    {status === 'success' ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-xl text-emerald-400 text-center text-sm mb-4 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            <div className="flex justify-center mb-3">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            {message}
                            <div className="mt-6">
                                <button
                                    onClick={onBackToLogin}
                                    className="w-full py-3 rounded-xl font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-cyan-500/30 transition-all"
                                >
                                    Return to Authentication
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={inputClasses}
                                    placeholder="Commlink (Email Address)"
                                />
                            </div>

                            {status === 'error' && (
                                <p className="text-xs text-red-400 text-center flex items-center justify-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {message}
                                </p>
                            )}

                            <div className="pt-2">
                                <button 
                                    type="submit" 
                                    disabled={isLoading} 
                                    className="relative overflow-hidden w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02]"
                                >
                                    <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {isLoading ? 'Transmitting...' : 'Transmit Recovery Link'}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="mt-8 text-center">
                        <button onClick={onBackToLogin} className="text-sm text-slate-500 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2 w-full font-medium">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Abort & Return
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordModal;
