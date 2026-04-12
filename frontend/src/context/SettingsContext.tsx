import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { fetchApiKeys, saveApiKey as apiSaveApiKey, deleteApiKey as apiDeleteApiKey } from '@/services/settings';
import { fetchCurrentUser } from '@/services/auth';
import { useToast } from './ToastContext';

// ✅ Updated Interface
export interface ApiKeyConfig {
    id?: number;
    name: string; // ✅ Custom name
    exchange: string; // ✅ Exchange identifier
    apiKey: string;
    secretKey: string;
    passphrase?: string;
    isEnabled: boolean;
    isSaved?: boolean;
}

export interface UserProfile {
    fullName: string;
    email: string;
    username: string;
    timezone: string;
    currency: string;
    allowed_ips?: string[];
    is_ip_whitelist_enabled?: boolean;
    avatar_url?: string;
}

interface SettingsContextType {
    apiKeys: ApiKeyConfig[]; // ✅ Array instead of Record
    loadUserData: () => Promise<void>; // Exposed for manual refresh
    saveApiKeyToBackend: (data: { exchange: string; name: string; apiKey: string; secretKey: string; passphrase?: string }) => Promise<void>;
    deleteApiKey: (id: number) => Promise<void>; // Placeholder for now
    isLoading: boolean;
    userProfile: UserProfile;
    updateUserProfile: (profile: Partial<UserProfile>) => void;
    is2faEnabled: boolean;
    set2faEnabled: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    // ✅ State is now an Array
    const [apiKeys, setApiKeys] = useState<ApiKeyConfig[]>([]);

    const [userProfile, setUserProfile] = useState<UserProfile>({
        fullName: 'Loading...',
        email: '...',
        username: '...',
        timezone: 'UTC',
        currency: 'USD'
    });

    const [is2faEnabled, set2faEnabled] = useState(false);

    const loadUserData = useCallback(async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            const [keysFromDB, userData] = await Promise.all([
                fetchApiKeys().catch(() => []),
                fetchCurrentUser().catch(() => null)
            ]);

            // ✅ Map backend response to Frontend Interface
            if (keysFromDB && Array.isArray(keysFromDB)) {
                const mappedKeys: ApiKeyConfig[] = keysFromDB.map((k: any) => ({
                    id: k.id,
                    name: k.name || `${k.exchange} Account`, // Fallback
                    exchange: k.exchange,
                    apiKey: k.api_key,
                    secretKey: '••••••••', // Masked
                    isEnabled: k.is_enabled,
                    isSaved: true
                }));
                setApiKeys(mappedKeys);
            }

            if (userData) {
                setUserProfile({
                    fullName: userData.full_name || 'Trader',
                    email: userData.email,
                    username: userData.email.split('@')[0],
                    timezone: 'UTC',
                    currency: 'USD',
                    allowed_ips: userData.allowed_ips || [],
                    is_ip_whitelist_enabled: userData.is_ip_whitelist_enabled || false,
                    avatar_url: userData.avatar_url
                });
            }

        } catch (error) {
            console.error("Error loading user data", error);
        }
    }, []);

    useEffect(() => {
        loadUserData();
    }, [loadUserData]);

    const saveApiKeyToBackend = async (data: { exchange: string; name: string; apiKey: string; secretKey: string; passphrase?: string }) => {
        if (!data.apiKey || !data.secretKey) {
            showToast('Please enter valid API and Secret keys', 'warning');
            return;
        }

        setIsLoading(true);
        try {
            await apiSaveApiKey({
                exchange: data.exchange,
                name: data.name,
                api_key: data.apiKey,
                secret_key: data.secretKey,
                passphrase: data.passphrase
            });

            showToast(`${data.name} (${data.exchange}) connected successfully!`, 'success');
            await loadUserData(); // Refresh list

        } catch (error: any) {
            console.error(error);
            showToast('Failed to save API keys.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // ✅ Delete functionality implemented
    const deleteApiKey = async (id: number) => {
        if (!id) return;

        setIsLoading(true);
        try {
            await apiDeleteApiKey(id); // Call service
            // Update local state by filtering out deleted key
            setApiKeys(prev => prev.filter(k => k.id !== id));
            showToast('API Key deleted successfully', 'success');
        } catch (error) {
            console.error("Failed to delete API key", error);
            showToast('Failed to delete API key', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const updateUserProfile = (updates: Partial<UserProfile>) => {
        setUserProfile(prev => ({ ...prev, ...updates }));
    };

    return (
        <SettingsContext.Provider value={{
            apiKeys,
            loadUserData,
            saveApiKeyToBackend,
            deleteApiKey,
            isLoading,
            userProfile,
            updateUserProfile,
            is2faEnabled,
            set2faEnabled
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = (): SettingsContextType => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
