import { AppView } from '@/types';

// Converts an AppView enum to a URL path
export const getPathFromView = (view: AppView): string => {
  if (view === AppView.SETTINGS) {
    return '/settings';
  }
  
  // Custom mappings for specific views if needed
  const customMappings: Partial<Record<AppView, string>> = {
    [AppView.DASHBOARD]: '/dashboard',
    [AppView.PORTFOLIO]: '/portfolio',
    [AppView.BACKTESTER]: '/backtester',
    [AppView.ARBITRAGE_BOT]: '/arbitrage-bot',
    [AppView.GRID_BOT]: '/grid-bot',
    [AppView.LEAD_LAG_BOT]: '/lead-lag-bot',
    [AppView.BOT_LAB]: '/bot-lab',
    [AppView.AI_FOUNDRY]: '/ai-foundry',
    [AppView.MARKET]: '/market',
    [AppView.SENTIMENT_ENGINE]: '/sentiment-engine',
    [AppView.CORPORATE_FILINGS]: '/corporate-filings',
    [AppView.INSTITUTIONAL_HOLDINGS]: '/institutional-holdings',
    [AppView.BLOCK_TRADE_DETECTOR]: '/block-trade-detector',
    [AppView.UNUSUAL_OPTIONS_ACTIVITY]: '/unusual-options-activity',
    [AppView.ON_CHAIN_ANALYZER]: '/on-chain-analyzer',
    [AppView.LIQUIDATION_MAP]: '/liquidation-map',
    [AppView.MARKET_REGIME_CLASSIFIER]: '/market-regime-classifier',
    [AppView.CORRELATION_MATRIX]: '/correlation-matrix',
    [AppView.TOKEN_UNLOCK_CALENDAR]: '/token-unlocks',
    [AppView.ALTERNATIVE_DATA]: '/alternative-data',
    [AppView.CUSTOM_ML_MODELS]: '/ml-models',
    [AppView.MODEL_TRAINING_STUDIO]: '/model-training-studio',
    [AppView.ML_MODEL_MARKETPLACE]: '/ml-marketplace',
    [AppView.REAL_TIME_DATA]: '/real-time-data',
    [AppView.QUANT_SCREENER]: '/quant-screener',
    [AppView.ALERTS_WATCHLIST]: '/alerts-watchlist',
    [AppView.ANALYST_RESEARCH]: '/analyst-research',
    [AppView.CUSTOM_INDICATOR_STUDIO]: '/indicator-studio',
    [AppView.PINE_SCRIPT_STUDIO]: '/pine-script-studio',
    [AppView.NURAL_CORE]: '/neural-core',
    [AppView.EDUCATION_HUB]: '/education-hub',
    [AppView.TASK_MANAGER]: '/task-manager',
    [AppView.EVENT_DRIVEN]: '/event-driven-simulator',
    [AppView.MARKET_DEPTH]: '/market-depth',
    [AppView.ORDER_FLOW_HEATMAP]: '/order-flow-heatmap',
  };

  if (customMappings[view]) {
    return customMappings[view] as string;
  }

  // Fallback: convert Enum value to kebab case
  return '/' + view.toString().toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

// Converts a URL path to an AppView enum
export const getViewFromPath = (path: string): AppView => {
  // Normalize path (remove trailing slashes, remove hash/query)
  const normalizedPath = path.split('?')[0].split('#')[0].replace(/\/$/, '');
  
  if (normalizedPath === '' || normalizedPath === '/') {
    return AppView.DASHBOARD;
  }

  // Handle settings which might have dynamic sections like /settings/profile
  if (normalizedPath.startsWith('/settings')) {
    return AppView.SETTINGS;
  }

  const allViews = Object.values(AppView);
  for (const view of allViews) {
    if (getPathFromView(view) === normalizedPath) {
      return view;
    }
  }

  return AppView.DASHBOARD; // Fallback
};
