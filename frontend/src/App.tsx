import React, { useState, useCallback, useEffect } from 'react';
import PublicWebsite from '@/pages/public/PublicWebsite';
import AppDashboard from '@/pages/app/AppDashboard';
import LoginTransition from '@/pages/app/LoginTransition';
import SignUpFormModal from '@/pages/public/SignUpFormModal';
import LoginFormModal from '@/pages/public/LoginFormModal';
import ForgotPasswordModal from '@/pages/public/ForgotPasswordModal';
import ResetPasswordScreen from '@/pages/public/ResetPasswordScreen';
import { AppView } from '@/types';

// AppState Enum আপডেট
enum AppState {
  PUBLIC,
  SHOW_SIGNUP_MODAL,
  SHOW_LOGIN_MODAL,
  SHOW_FORGOT_PASSWORD_MODAL,
  RESET_PASSWORD_SCREEN,
  LOGGING_IN_TRANSITION,
  LOGGED_IN,
}

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.PUBLIC);
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if token exists in current tab's session or local storage
    const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
    if (token) {
      setAppState(AppState.LOGGED_IN);
    } else {
      // If no token in this tab, ask other open tabs for their session
      localStorage.setItem('request-session-sync', Date.now().toString());
    }

    // Listen for storage events from other tabs
    const handleStorageEvent = (event: StorageEvent) => {
      // Another tab requested a session sync, and we have a session to share
      if (event.key === 'request-session-sync' && sessionStorage.getItem('accessToken')) {
        localStorage.setItem('session-sync-data', JSON.stringify({
          accessToken: sessionStorage.getItem('accessToken'),
          refreshToken: sessionStorage.getItem('refreshToken')
        }));
        // Remove it immediately so it doesn't linger in localStorage
        localStorage.removeItem('session-sync-data');
      }

      // We received session data from another tab
      if (event.key === 'session-sync-data' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data.accessToken) {
            sessionStorage.setItem('accessToken', data.accessToken);
            if (data.refreshToken) sessionStorage.setItem('refreshToken', data.refreshToken);
            setAppState(AppState.LOGGED_IN);
          }
        } catch (e) {
          console.error('Error parsing session sync data', e);
        }
      }

      // Handle Cross-Tab Logout Sync
      if (event.key === 'cross-tab-logout') {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setAppState(AppState.PUBLIC);
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    const searchParams = new URLSearchParams(window.location.search);
    const resetTokenParam = searchParams.get('token');

    if (resetTokenParam) {
      setResetToken(resetTokenParam);
      setAppState(AppState.RESET_PASSWORD_SCREEN);
      window.history.replaceState({}, document.title, "/");
    }

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  const handleForgotPasswordInitiate = useCallback(() => {
    setAppState(AppState.SHOW_FORGOT_PASSWORD_MODAL);
  }, []);

  const handleResetSuccess = useCallback(() => {
    setAppState(AppState.SHOW_LOGIN_MODAL);
  }, []);

  const handleBackToLogin = useCallback(() => {
    setAppState(AppState.SHOW_LOGIN_MODAL);
  }, []);

  const handleLoginInitiate = useCallback(() => {
    setAppState(AppState.SHOW_LOGIN_MODAL);
  }, []);

  const handleSignUpInitiate = useCallback(() => {
    setAppState(AppState.SHOW_SIGNUP_MODAL);
  }, []);

  // সাইনআপ থেকে লগইন মোডালে যাওয়ার জন্য
  const switchToLogin = useCallback(() => {
    setAppState(AppState.SHOW_LOGIN_MODAL);
  }, []);

  // লগইন থেকে সাইনআপ মোডালে যাওয়ার জন্য
  const switchToSignUp = useCallback(() => {
    setAppState(AppState.SHOW_SIGNUP_MODAL);
  }, []);

  // লগইন বা সাইনআপ সফল হওয়ার পর (API কল সাকসেস হলে)
  const handleAuthSuccess = useCallback(() => {
    setAppState(AppState.LOGGING_IN_TRANSITION);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    
    // Broadcast logout to other tabs
    localStorage.setItem('cross-tab-logout', Date.now().toString());
    
    setAppState(AppState.PUBLIC);
    // পেজ রিফ্রেশ করে দিলে সব ক্লিন হয়ে যাবে (Context reset)
    window.location.reload();
  }, []);

  const renderContent = () => {
    switch (appState) {
      case AppState.SHOW_FORGOT_PASSWORD_MODAL:
        return (
          <>
            <PublicWebsite onLogin={handleLoginInitiate} onSignUp={handleSignUpInitiate} />
            <ForgotPasswordModal
              onClose={() => setAppState(AppState.PUBLIC)}
              onBackToLogin={handleBackToLogin}
            />
          </>
        );

      case AppState.RESET_PASSWORD_SCREEN:
        if (!resetToken) return <PublicWebsite onLogin={handleLoginInitiate} onSignUp={handleSignUpInitiate} />;
        return <ResetPasswordScreen token={resetToken} onResetSuccess={handleResetSuccess} />;

      // সাইনআপ মোডাল রেন্ডারিং
      case AppState.SHOW_SIGNUP_MODAL:
        return (
          <>
            <PublicWebsite onLogin={handleLoginInitiate} onSignUp={handleSignUpInitiate} />
            <SignUpFormModal
              onClose={() => setAppState(AppState.PUBLIC)}
              onRegister={handleAuthSuccess} // সাকসেস হলে ট্রানজিশন হবে
            />
          </>
        );

      // লগইন মোডাল রেন্ডারিং (নতুন)
      case AppState.SHOW_LOGIN_MODAL:
        return (
          <>
            <PublicWebsite onLogin={handleLoginInitiate} onSignUp={handleSignUpInitiate} />
            <LoginFormModal
              onClose={() => setAppState(AppState.PUBLIC)}
              onLoginSuccess={handleAuthSuccess}
              onSwitchToSignup={switchToSignUp}
              onSwitchToForgotPassword={handleForgotPasswordInitiate}
            />
          </>
        );

      case AppState.LOGGING_IN_TRANSITION:
        return <LoginTransition onAnimationComplete={() => setAppState(AppState.LOGGED_IN)} />;

      case AppState.LOGGED_IN:
        return (
          <AppDashboard
            onLogout={handleLogout}
          />
        );

      case AppState.PUBLIC:
      default:
        return <PublicWebsite onLogin={handleLoginInitiate} onSignUp={handleSignUpInitiate} />;
    }
  };

  return (
    <div className="min-h-screen font-sans">
      {renderContent()}
    </div>
  );
}

export default App;
