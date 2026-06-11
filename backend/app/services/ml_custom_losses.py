import torch
import torch.nn as nn
import numpy as np

class SharpeLoss(nn.Module):
    """
    Optimizes for the Sharpe Ratio directly.
    Assumes y_pred is the position size/direction (-1 to 1) 
    and y_true is the future return of the asset.
    """
    def __init__(self, risk_free_rate=0.0):
        super(SharpeLoss, self).__init__()
        self.risk_free_rate = risk_free_rate

    def forward(self, y_pred, y_true):
        # Calculate strategy returns: position * future asset return
        strategy_returns = y_pred * y_true
        
        mean_return = torch.mean(strategy_returns)
        std_return = torch.std(strategy_returns) + 1e-9 # Prevent division by zero
        
        # Annualization factor not strictly needed for optimization, but standard
        sharpe_ratio = (mean_return - self.risk_free_rate) / std_return
        
        # We want to maximize Sharpe Ratio, so minimize negative Sharpe
        return -sharpe_ratio

class MaxDrawdownPenaltyLoss(nn.Module):
    """
    Penalizes sequences of losses that create large drawdowns.
    Combines MSE with a Max Drawdown penalty.
    """
    def __init__(self, lambda_dd=0.5):
        super(MaxDrawdownPenaltyLoss, self).__init__()
        self.lambda_dd = lambda_dd
        self.mse = nn.MSELoss()

    def forward(self, y_pred, y_true):
        base_loss = self.mse(y_pred, y_true)
        
        strategy_returns = y_pred * y_true
        
        # Calculate cumulative returns
        cum_returns = torch.cumsum(strategy_returns, dim=0)
        
        # Calculate running maximum
        running_max = torch.cummax(cum_returns, dim=0).values
        
        # Calculate drawdowns
        drawdowns = running_max - cum_returns
        max_drawdown = torch.max(drawdowns)
        
        return base_loss + (self.lambda_dd * max_drawdown)

class DirectionalSymmetryLoss(nn.Module):
    """
    DXY Loss: Penalizes wrong direction prediction more heavily than magnitude error.
    """
    def __init__(self, direction_penalty=2.0):
        super(DirectionalSymmetryLoss, self).__init__()
        self.direction_penalty = direction_penalty
        self.mse = nn.MSELoss(reduction='none')

    def forward(self, y_pred, y_true):
        base_loss = self.mse(y_pred, y_true)
        
        # Signs match: 1, Signs mismatch: -1
        signs_match = torch.sign(y_pred) * torch.sign(y_true)
        
        # If signs don't match (signs_match < 0), apply penalty
        penalty_mask = (signs_match < 0).float()
        
        weighted_loss = base_loss * (1.0 + self.direction_penalty * penalty_mask)
        return torch.mean(weighted_loss)

# XGBoost Custom Objectives
def xgboost_sharpe_objective(preds, dtrain):
    """
    Custom objective for XGBoost to maximize Sharpe ratio.
    Approximation of first and second order gradients.
    """
    labels = dtrain.get_label()
    # preds is position, labels is future return
    strategy_returns = preds * labels
    
    mean_ret = np.mean(strategy_returns)
    std_ret = np.std(strategy_returns) + 1e-9
    
    # First order gradient (grad)
    grad = -labels / std_ret + (labels * (mean_ret - strategy_returns)) / (std_ret ** 3)
    
    # Second order gradient (hess) - approximated
    hess = (labels ** 2) / (std_ret ** 3)
    
    return grad, hess

def get_custom_loss_fn(loss_name):
    if loss_name == 'sharpe_loss':
        return SharpeLoss()
    elif loss_name == 'max_drawdown_penalty':
        return MaxDrawdownPenaltyLoss()
    elif loss_name == 'dxy_loss':
        return DirectionalSymmetryLoss()
    return None
