from prometheus_client import Counter, Histogram, Gauge

# ── Inference Metrics ──
ML_PREDICTION_COUNT = Counter(
    "ml_prediction_total",
    "Total number of ML predictions generated",
    ["model_name", "symbol", "signal"]
)

ML_INFERENCE_LATENCY = Histogram(
    "ml_inference_latency_seconds",
    "Latency of ML inference pipeline",
    ["model_name"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)

# ── Market Data Metrics ──
L2_TICK_COUNT = Counter(
    "l2_tick_count_total",
    "Total L2 orderbook ticks processed",
    ["symbol"]
)

WS_ACTIVE_CONNECTIONS = Gauge(
    "ws_active_connections",
    "Number of active websocket connections for streaming data"
)

# ── System/Training Metrics ──
TRAINING_JOB_COUNT = Counter(
    "training_job_total",
    "Total number of ML training jobs triggered",
    ["algorithm", "dataset_type"]
)
