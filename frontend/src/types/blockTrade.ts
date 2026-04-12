
export interface BlockTrade {
    exchange: string;
    symbol: string;
    price: number;
    amount: number;
    value: number;
    side: 'buy' | 'sell';
    timestamp: number;
    datetime: string;
    is_whale: boolean;
}

export interface BlockTradeConfig {
    min_block_value: number;
    whale_value: number;
    active_exchanges: string[];
}

export interface BlockTradePayload {
    type: 'block_trade';
    data: BlockTrade[];
}
