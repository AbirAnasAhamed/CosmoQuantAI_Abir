export interface FundHolding {
    id: number;
    fund_id: number;
    ticker: string;
    shares: number;
    value: number;
    percent_portfolio?: number;
    date_reported?: string; // API returns ISO string for date
}

export interface InstitutionalFund {
    id: number;
    name: string;
    manager?: string;
    cik: string;
    total_assets?: number;
    filing_date?: string;
    image_url?: string;
    holdings: FundHolding[];
}

export interface TopMover {
    ticker: string;
    total_value: number;
    fund_count: number;
}

export interface PortfolioStats {
    total_holdings_count: number;
    top_holdings: {
        ticker: string;
        percent: number;
        value: number;
    }[];
}
