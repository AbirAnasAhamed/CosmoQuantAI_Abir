import apiClient from './client';

export interface TrainingJob {
    id: string;
    symbol: string;
    timeframe: string;
    algorithm: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    progress: number;
    logs: string[];
    output_model_id?: string;
    error_message?: string;
    created_at: string;
    updated_at?: string;
    completed_at?: string;
}

export interface TrainingConfig {
    symbol: string;
    timeframe: string;
    algorithm: string;
    config: {
        indicators: string[];
        epochs: number;
        dataset_type?: string;
        is_auto_retrain?: boolean;
        retrain_interval_hours?: number;
        data_lookback_hours?: number;
        ohlcv_period?: string;
        resample_l2?: boolean;
        prediction_target?: string;
        learning_rate?: number;
        max_depth?: number;
        model_name?: string;
        exchange?: string;
        is_deep_training?: boolean;
        target_rows?: number;
        l2_features?: string[];
        initial_balance?: number; // ✅ New
        commission?: number;      // ✅ New
        sequence_length?: number; // ✅ New
    };
}

export const mlTrainingService = {
    startTraining: async (config: TrainingConfig): Promise<TrainingJob> => {
        const response = await apiClient.post('/model-training/train', config);
        return response.data;
    },

    getJobs: async (): Promise<TrainingJob[]> => {
        const response = await apiClient.get('/model-training/jobs');
        return response.data;
    },

    getJobStatus: async (jobId: string): Promise<TrainingJob> => {
        const response = await apiClient.get(`/model-training/jobs/${jobId}`);
        return response.data;
    }
};
