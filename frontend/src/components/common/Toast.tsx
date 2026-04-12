import React, { useEffect, useState } from 'react';
import type { ToastMessage } from '@/types';

// Icons tailored for each state
const SuccessIcon = () => (
    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const InfoIcon = () => (
    <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ErrorIcon = () => (
    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const WarningIcon = () => (
    <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const ICONS: Record<ToastMessage['type'], React.ReactNode> = {
    success: <SuccessIcon />,
    info: <InfoIcon />,
    error: <ErrorIcon />,
    warning: <WarningIcon />,
};

// Styles for borders/backgrounds based on type
const TOAST_STYLES: Record<ToastMessage['type'], string> = {
    success: 'border-green-500 bg-green-50 dark:bg-green-900/10',
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-900/10',
    error: 'border-red-500 bg-red-50 dark:bg-red-900/10',
    warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10',
};

interface ToastProps {
    toast: ToastMessage;
    onClose: (id: number) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setIsVisible(true));

        const timer = setTimeout(() => {
            setIsVisible(false); // Trigger exit animation
            setTimeout(() => onClose(toast.id), 300); // Wait for animation to finish
        }, 5000);

        return () => clearTimeout(timer);
    }, [toast.id, onClose]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => onClose(toast.id), 300);
    };

    return (
        <div
            className={`
                max-w-md w-full backdrop-blur-md shadow-xl rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden
                transform transition-all duration-300 ease-in-out border-l-4
                ${TOAST_STYLES[toast.type]}
                ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-[100%] opacity-0'}
            `}
            role="alert"
        >
            <div className="p-4 flex items-start w-full">
                <div className="flex-shrink-0 animate-pulse-slow">
                    {ICONS[toast.type]}
                </div>
                <div className="ml-3 w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                        {toast.type}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {toast.message}
                    </p>
                </div>
                <div className="ml-4 flex-shrink-0 flex">
                    <button
                        className="bg-transparent rounded-md inline-flex text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        onClick={handleClose}
                    >
                        <span className="sr-only">Close</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Toast;
