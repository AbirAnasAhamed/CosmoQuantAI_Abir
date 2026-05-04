import torch
import torch.nn as nn
import numpy as np
import gymnasium as gym
from gymnasium import spaces

class SimpleLSTM(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super(SimpleLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)
        
    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        out, _ = self.lstm(x, (h0, c0))
        out = self.fc(out[:, -1, :])
        return out

class SimpleGRU(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super(SimpleGRU, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.gru = nn.GRU(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)
        
    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        out, _ = self.gru(x, h0)
        out = self.fc(out[:, -1, :])
        return out

class CNN1D(nn.Module):
    def __init__(self, input_size, output_size):
        super(CNN1D, self).__init__()
        self.conv1 = nn.Conv1d(in_channels=1, out_channels=16, kernel_size=3, padding=1)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(kernel_size=2)
        pool_out_size = input_size // 2
        self.fc1 = nn.Linear(16 * pool_out_size, 32)
        self.fc2 = nn.Linear(32, output_size)
        
    def forward(self, x):
        # Expects (batch, 1, seq_len=input_size)
        x = x.unsqueeze(1)
        out = self.conv1(x)
        out = self.relu(out)
        out = self.pool(out)
        out = out.view(out.size(0), -1)
        out = self.relu(self.fc1(out))
        out = self.fc2(out)
        return out

class DeepLOB(nn.Module):
    def __init__(self, input_size, output_size):
        super(DeepLOB, self).__init__()
        self.conv1 = nn.Conv1d(1, 16, kernel_size=2, padding=1)
        self.relu = nn.ReLU()
        self.lstm = nn.LSTM(16, 32, 1, batch_first=True)
        self.fc = nn.Linear(32, output_size)
        
    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.relu(self.conv1(x))
        x = x.transpose(1, 2)
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out

class TimeSeriesTransformer(nn.Module):
    def __init__(self, input_size, output_size):
        super(TimeSeriesTransformer, self).__init__()
        self.encoder_layer = nn.TransformerEncoderLayer(d_model=input_size, nhead=1, batch_first=True)
        self.transformer = nn.TransformerEncoder(self.encoder_layer, num_layers=1)
        self.fc = nn.Linear(input_size, output_size)
        
    def forward(self, x):
        x = x.unsqueeze(1)
        out = self.transformer(x)
        out = self.fc(out[:, -1, :])
        return out

class TradingEnv(gym.Env):
    """
    Custom Environment that follows gym interface.
    This environment is used both for training and inference (prediction) for the PPO agent.
    """
    def __init__(self, X, y=None):
        super(TradingEnv, self).__init__()
        self.X = np.array(X)
        self.y = np.array(y) if y is not None else np.zeros(len(X))
        self.current_step = 0
        self.max_steps = len(self.X) - 1
        
        self.action_space = spaces.Discrete(2) # 0: Hold/Sell, 1: Buy
        self.observation_space = spaces.Box(low=-np.inf, high=np.inf, shape=(self.X.shape[1],), dtype=np.float32)
        
    def reset(self, seed=None, options=None):
        self.current_step = 0
        return self.X[self.current_step].astype(np.float32), {}
        
    def step(self, action):
        reward = 0
        if self.y is not None:
            if action == 1 and self.y[self.current_step] > 0:
                reward = 1
            elif action == 1 and self.y[self.current_step] <= 0:
                reward = -1
                
        self.current_step += 1
        done = self.current_step >= self.max_steps
        
        obs = self.X[self.current_step].astype(np.float32) if not done else np.zeros(self.observation_space.shape, dtype=np.float32)
        return obs, float(reward), done, False, {}
