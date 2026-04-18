import React, { useState } from 'react';
import Button from '@/components/common/Button';
import { registerUser } from '@/services/auth';
import { Logo, GoogleLogo, GithubLogo, AppleLogo, UserCircleIcon, KeyIcon } from '@/constants';

const MailIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
);

interface InputFieldProps {
    id: string;
    type: string;
    placeholder: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    icon: React.ReactNode;
}

const InputField: React.FC<InputFieldProps> = ({ id, type, placeholder, value, onChange, icon }) => (
    <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
            {icon}
        </div>
        <input
            id={id}
            type={type}
            value={value}
            onChange={onChange}
            required
            className="w-full bg-[#0D1117] border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-500 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all duration-300 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
            placeholder={placeholder}
        />
    </div>
);

interface SignUpFormModalProps {
    onClose: () => void;
    onRegister: () => void;
}

const SignUpFormModal: React.FC<SignUpFormModalProps> = ({ onClose, onRegister }) => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

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
            await registerUser({
                full_name: fullName,
                email: email,
                password: password
            });
            console.log('Registration Successful!');
            onRegister();
        } catch (err: any) {
            console.error(err);
            const errMsg = err.response?.data?.detail || 'Registration failed. Please try again.';
            setError(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
            role="dialog"
            aria-modal="true"
        >
            <div className="absolute inset-0 bg-[#020610]/80 backdrop-blur-xl" onClick={handleClose}></div>

            <div
                className={`relative w-full max-w-5xl bg-[#070F20]/90 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col md:flex-row transform transition-all duration-300 ${isClosing ? 'scale-95 translate-y-4' : 'scale-100 translate-y-0 animate-modal-content-slide-down'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Glow outlines */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />

                {/* Left Side - Creative Panel */}
                <div className="hidden md:flex md:w-5/12 relative overflow-hidden flex-col justify-between p-10 text-white bg-gradient-to-b from-[#0D1117] to-[#020610] border-r border-white/5">
                    {/* Cyber grids & orbs */}
                    <div className="absolute inset-0 z-0">
                        <div className="absolute inset-0 opacity-10" style={{
                            backgroundImage: 'linear-gradient(rgba(6,182,212,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.2) 1px, transparent 1px)',
                            backgroundSize: '30px 30px'
                        }} />
                        <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-500/20 rounded-full blur-[100px] animate-float-medium" />
                        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-violet-600/20 rounded-full blur-[100px] animate-float-slow" />
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <Logo className="!text-xl !text-white" />
                        </div>
                    </div>

                    <div className="relative z-10 space-y-6 my-auto">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            Next-Gen Trading
                        </div>
                        <h3 className="text-3xl md:text-4xl font-extrabold leading-tight text-white shadow-black drop-shadow-md">
                            Welcome to the <br /> 
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400">Future of Alpha</span>
                        </h3>
                        <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
                            Join elite quants building, testing, and deploying strategies on the most advanced AI-powered infrastructure.
                        </p>

                        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-white/10">
                            <div>
                                <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">99.9%</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Uptime</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-pink-400">&lt;10ms</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Latency</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 text-xs text-slate-600 font-mono">
                        SYS.AUTH.REGISTRATION_MODULE
                    </div>
                </div>

                {/* Right Side - Form */}
                <div className="w-full md:w-7/12 p-8 md:p-12 relative flex flex-col justify-center">
                    <button
                        onClick={handleClose}
                        className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/10 z-20"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    <div className="mb-10 text-center md:text-left">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Initialize Protocol</h2>
                        <p className="text-sm text-slate-400 mt-2">Establish your access credentials for the network.</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-3 animate-fade-in-down shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <InputField
                            id="fullName"
                            type="text"
                            placeholder="Designation (Full Name)"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            icon={<UserCircleIcon />}
                        />
                        <InputField
                            id="email"
                            type="email"
                            placeholder="Commlink (Email Address)"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            icon={<MailIcon />}
                        />
                        <InputField
                            id="password"
                            type="password"
                            placeholder="Passcode Security"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            icon={<KeyIcon />}
                        />

                        <div className="pt-2">
                            <button 
                                type="submit" 
                                disabled={isLoading} 
                                className="relative overflow-hidden w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] group"
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
                                ) : 'Initialize Access Sequence'}
                            </button>
                        </div>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-mono text-slate-500">
                            <span className="bg-[#070F20] px-4">
                                External Identity Providers
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { Icon: GoogleLogo, id: 'google' },
                            { Icon: GithubLogo, id: 'github' },
                            { Icon: AppleLogo, id: 'apple' }
                        ].map((provider) => (
                            <button key={provider.id} className="flex items-center justify-center py-3 border border-white/10 bg-white/5 rounded-xl hover:bg-white/10 hover:border-cyan-500/30 transition-all group">
                                <provider.Icon className={`w-5 h-5 ${provider.id === 'google' ? 'grayscale group-hover:grayscale-0' : 'text-slate-400 group-hover:text-white'} transition-all`} />
                            </button>
                        ))}
                    </div>

                    <div className="mt-10 text-center text-sm text-slate-500">
                        Already authenticated?{' '}
                        <button onClick={handleClose} className="font-bold text-cyan-400 hover:text-cyan-300 hover:underline decoration-cyan-400/30 underline-offset-4 transition-all">
                            Initialize Login Sequence
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignUpFormModal;
