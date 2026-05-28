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
        missing_data_strategy?: string;
        outlier_removal?: string;
        scaling_method?: string;
        learning_rate?: number;
        max_depth?: number;
        model_name?: string;
        exchange?: string;
        is_deep_training?: boolean;
        target_rows?: number;
        l2_features?: string[];
        initial_balance?: number; // ✅ New
        commission?: number;      // ✅ New
        slippage?: number;        // ✅ New
        sequence_length?: number; // ✅ New
        target_model_id?: string;
        fine_tune?: boolean;
        is_cross_algorithm_transfer?: boolean;
        trade_file?: string;
        bar_type?: string;
        bar_size?: string;
        volume_threshold?: string;
        trade_features?: string[];
        hybrid_deep_trade_features?: string[]; // ✅ Hybrid Deep (L2 + aggTrade)
        plp_features?: string[]; // ✅ Predatory Liquidity Pipeline (PLP) Features
        execution_strategy?: string;
        iceberg_slices?: number;
        twap_duration_minutes?: number;
        alt_features?: string[];
        use_automl?: boolean;
        automl_trials?: number;
        is_ensemble?: boolean;
        ensemble_method?: 'voting' | 'stacking';
        base_models?: string[];
        meta_model?: string;
        voting_strategy?: 'hard' | 'soft';
        auto_optimize_weights?: boolean;
        feature_subspacing?: boolean;
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
    },

    cancelTraining: async (jobId: string): Promise<TrainingJob> => {
        const response = await apiClient.post(`/model-training/jobs/${jobId}/cancel`);
        return response.data;
    }
};
