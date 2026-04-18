import React, { useState } from 'react';
import Button from '@/components/common/Button';
import { loginUser } from '@/services/auth';
import { Logo, GoogleLogo, GithubLogo } from '@/constants';

interface LoginFormModalProps {
    onClose: () => void;
    onLoginSuccess: () => void;
    onSwitchToSignup: () => void;
    onSwitchToForgotPassword: () => void;
}

const LoginFormModal: React.FC<LoginFormModalProps> = ({ onClose, onLoginSuccess, onSwitchToSignup, onSwitchToForgotPassword }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(onClose, 300);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const data = await loginUser({
                email: email,
                password: password
            });

            localStorage.setItem('accessToken', data.access_token);
            localStorage.setItem('refreshToken', data.refresh_token);

            console.log('Login Successful!', data);
            onLoginSuccess();
        } catch (err: any) {
            console.error(err);
            let errMsg = err.response?.data?.detail || 'Invalid email or password.';
            if (typeof errMsg !== 'string') {
                errMsg = JSON.stringify(errMsg);
            }
            setError(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const inputClasses = "w-full bg-[#0D1117] border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]";

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            role="dialog"
            aria-modal="true"
        >
            <div className="absolute inset-0 bg-[#020610]/80 backdrop-blur-xl" onClick={handleClose}></div>

            <div
                className={`relative w-full max-w-md bg-[#070F20]/90 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden transform transition-all duration-300 ${isClosing ? 'scale-95 translate-y-4' : 'scale-100 translate-y-0 animate-modal-content-slide-down'}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />
                
                {/* Background Details */}
                <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'linear-gradient(rgba(6,182,212,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.2) 1px, transparent 1px)',
                        backgroundSize: '30px 30px'
                    }} />
                    <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] animate-float-medium" />
                    <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-violet-600/10 rounded-full blur-[100px] animate-float-slow" />
                </div>

                <button onClick={handleClose} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/10 z-20">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="p-6 md:p-8 relative z-10 flex flex-col justify-center">
                    <div className="text-center mb-6">
                        <div className="flex justify-center mb-4">
                            <Logo className="!text-2xl !text-white" />
                        </div>
                        <h2 className="text-2xl font-extrabold text-white tracking-tight">Access Terminal</h2>
                        <p className="text-sm text-slate-400 mt-1">Enter credentials to authenticate into the network.</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-3 animate-fade-in-down shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className={inputClasses}
                                placeholder="Commlink (Email Address)"
                            />
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H5v-2H3v-2H1v-4a6 6 0 017.743-5.743z" /></svg>
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className={inputClasses}
                                placeholder="Passcode Security"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-white transition-colors cursor-pointer outline-none"
                            >
                                {showPassword ?
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> :
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                }
                            </button>
                        </div>

                        <div className="flex justify-between items-center text-sm px-1">
                            <label className="flex items-center space-x-2.5 cursor-pointer">
                                <input type="checkbox" className="w-3.5 h-3.5 rounded border-white/20 bg-transparent text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 transition-colors" />
                                <span className="text-slate-400 text-sm">Remember credentials</span>
                            </label>
                            <button type="button" onClick={onSwitchToForgotPassword} className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors">Access Recovery?</button>
                        </div>

                        <div className="pt-1">
                            <button 
                                type="submit" 
                                disabled={isLoading} 
                                className="relative overflow-hidden w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] group"
                            >
                                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Establishing Uplink...
                                    </span>
                                ) : 'Authenticate'}
                            </button>
                        </div>
                    </form>

                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-mono text-slate-500">
                            <span className="bg-[#070F20] px-3">
                                External Providers
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button className="flex items-center justify-center py-2.5 border border-white/10 bg-white/5 rounded-xl hover:bg-white/10 hover:border-cyan-500/30 transition-all group">
                            <GoogleLogo className="w-4 h-4 grayscale group-hover:grayscale-0 transition-all" />
                        </button>
                        <button className="flex items-center justify-center py-2.5 border border-white/10 bg-white/5 rounded-xl hover:bg-white/10 hover:border-cyan-500/30 transition-all group">
                            <GithubLogo className="w-4 h-4 text-slate-400 group-hover:text-white transition-all" />
                        </button>
                    </div>

                    <div className="mt-6 text-center text-xs text-slate-500">
                        No active credentials?{' '}
                        <button onClick={onSwitchToSignup} className="font-bold text-cyan-400 text-xs hover:text-cyan-300 hover:underline decoration-cyan-400/30 underline-offset-4 transition-all">
                            Initialize Registration
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginFormModal;
