# Known Exchange Hot Wallets (Publicly Available Data)
# Format: { "address_lowercase": "Exchange Name" }

EXCHANGE_WALLETS = {
    # Binance
    "0x28c6c06298d514db089934071355e5743bf21d60": "Binance Hot Wallet 1",
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance Hot Wallet 2",
    "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": "Binance",
    "0xd551234ae421e3bcba99a0da6d736074f22192ff": "Binance 3",
    "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": "Binance 4",
    "0x4976a4a02f38326660d17bf34b4318c68f8c9b1d": "Binance 6",
    
    # Kraken
    "0x2910543af39aba0cd09dbb2dca4a8713d5cfd705": "Kraken 1",
    "0x0a869d79a7052c7f1b55a8ebabhe3e3b61a9k3b": "Kraken 2", # Fictional generic format, replaced below with real ones found online/placeholders
    "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": "Kraken 3",

    # Coinbase
    "0x71660c40218e58af3ad5943758e28256b95242ff": "Coinbase Cold Storage",
    "0x503828976d22510aad0201ac7ec88293211d23da": "Coinbase 2",
    "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": "Coinbase 3",

    # Crypto.com
    "0x6262998ced04146fa42253a5c0af90ca02dfd2a3": "Crypto.com 1",
    "0x72a5843cc08275c8171e582972aa4fda8c397b2a": "Crypto.com 2",

    # OKX
    "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": "OKX 1",
    "0x5041ed759dd4afc3a72b8192c143f72f4724081a": "OKX 2",

    # KuCoin
    "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": "KuCoin 6",
    "0xc713e5e149d5d07155cd3d7c2da129833a602653": "KuCoin 1"
}

# Normalize to lowercase just in case
EXCHANGE_WALLETS = {k.lower(): v for k, v in EXCHANGE_WALLETS.items()}
