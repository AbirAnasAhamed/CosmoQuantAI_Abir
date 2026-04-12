
import { useState, useEffect } from 'react';
import apiClient from '../services/api';
import { BlockTradeConfig } from '../types/blockTrade';
import { useToast } from '@chakra-ui/react';

export const useBlockTradeConfig = () => {
    const [config, setConfig] = useState<BlockTradeConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const fetchConfig = async () => {
        setIsLoading(true);
        try {
            // Using apiClient which should already have base URL configured
            const response = await apiClient.get<BlockTradeConfig>('/block-trades/config');
            setConfig(response.data);
        } catch (error) {
            console.error('Failed to fetch block trade config:', error);
            toast({
                title: "Error",
                description: "Failed to load block trade configuration.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const updateConfig = async (newConfig: Partial<BlockTradeConfig>) => {
        setIsLoading(true);
        try {
            const response = await apiClient.post<BlockTradeConfig>('/block-trades/config', newConfig);
            setConfig(response.data);
            toast({
                title: "Success",
                description: "Block trade configuration updated.",
                status: "success",
                duration: 3000,
                isClosable: true,
            });
            return response.data;
        } catch (error) {
            console.error('Failed to update block trade config:', error);
            toast({
                title: "Error",
                description: "Failed to update configuration.",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    return { config, updateConfig, isLoading, refetch: fetchConfig };
};
