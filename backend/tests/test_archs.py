import torch
from app.services.advanced_ml.architectures import TCNModel, TabNetEncoder, AutoEncoder

def test_tcn():
    model = TCNModel(input_size=10, num_channels=[32, 64, 128], output_size=1)
    x = torch.randn(32, 50, 10) # batch, seq, features
    y = model(x)
    print("TCN output shape:", y.shape)

def test_tabnet():
    model = TabNetEncoder(input_dim=10, output_dim=1)
    x = torch.randn(32, 10)
    y = model(x)
    print("TabNet output shape:", y.shape)

def test_autoencoder():
    model = AutoEncoder(input_dim=10, hidden_dim=32)
    x = torch.randn(32, 10)
    y = model(x)
    print("AutoEncoder output shape:", y.shape)

if __name__ == "__main__":
    test_tcn()
    test_tabnet()
    test_autoencoder()
    print("All models compiled and forwarded successfully!")
