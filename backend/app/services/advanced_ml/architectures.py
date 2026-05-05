import torch
import torch.nn as nn
import math
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor
import gymnasium as gym

class PositionalEncoding(nn.Module):
    """Injects some information about the relative or absolute position of the tokens in the sequence."""
    def __init__(self, d_model: int, max_len: int = 5000):
        super(PositionalEncoding, self).__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)
        self.register_buffer('pe', pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.pe[:, :x.size(1)]

class TimeSeriesTransformer(nn.Module):
    """
    A professional-grade Transformer for time-series prediction (OHLCV/L2).
    Includes Positional Encoding and multi-layer Encoder.
    """
    def __init__(
        self, 
        input_dim: int, 
        d_model: int = 64, 
        nhead: int = 4, 
        num_layers: int = 3, 
        dim_feedforward: int = 256,
        dropout: float = 0.1,
        output_dim: int = 1
    ):
        super(TimeSeriesTransformer, self).__init__()
        self.d_model = d_model
        
        # Input Projection: Projects features to d_model space
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_encoder = PositionalEncoding(d_model)
        
        # Transformer Encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, 
            nhead=nhead, 
            dim_feedforward=dim_feedforward, 
            dropout=dropout,
            batch_first=True
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        # Output Head
        self.output_head = nn.Linear(d_model, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Input tensor of shape (Batch, Seq_Len, Features)
        Returns:
            Prediction for the next step.
        """
        # 1. Project and scale
        x = self.input_proj(x) * math.sqrt(self.d_model)
        
        # 2. Add Positional Encoding
        x = self.pos_encoder(x)
        
        # 3. Pass through Transformer Encoder
        # Output shape: (Batch, Seq_Len, d_model)
        x = self.transformer_encoder(x)
        
        # 4. Global average pooling or take the last token
        # Taking the last token's representation for the final decision
        x = x[:, -1, :]
        
        # 5. Final prediction
        return self.output_head(x)

class TransformerRLFeatureExtractor(BaseFeaturesExtractor):
    """
    Custom Feature Extractor for Stable-Baselines3 PPO.
    Wraps a Transformer to process sequential observations.
    
    Note: Requires the environment observation to be in shape (Seq_Len * Features) 
    or handles the reshaping internally.
    """
    def __init__(
        self, 
        observation_space: gym.Space, 
        features_dim: int = 128,
        seq_len: int = 60,
        d_model: int = 64
    ):
        super(TransformerRLFeatureExtractor, self).__init__(observation_space, features_dim)
        
        # Calculate input_dim (features per step)
        # Assumes observation is a flattened window of (seq_len, features)
        self.seq_len = seq_len
        self.features_per_step = observation_space.shape[0] // seq_len
        
        self.transformer = TimeSeriesTransformer(
            input_dim=self.features_per_step,
            d_model=d_model,
            nhead=4,
            num_layers=2,
            output_dim=features_dim # The output dimension for SB3
        )

    def forward(self, observations: torch.Tensor) -> torch.Tensor:
        # 1. Reshape flattened observation to (Batch, Seq_Len, Features)
        batch_size = observations.size(0)
        x = observations.view(batch_size, self.seq_len, self.features_per_step)
        
        # 2. Extract features using the Transformer
        return self.transformer(x)
