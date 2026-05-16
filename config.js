// ── API Configuration ──────────────────────────────────────────
// Auto-detects the backend host:
//   • Local dev  → localhost
//   • Deployed   → same host the dashboard is served from
//
// Override: set window.__API_HOST__ before this script loads,
//           or the CI/CD pipeline injects it at deploy time.

const _host = (() => {
  // Explicit override (injected by CI/CD)
  if (typeof window.__API_HOST__ === 'string') return window.__API_HOST__;
  const h = window.location.hostname;
  // If opened as a file or on localhost, talk to localhost
  if (!h || h === 'localhost' || h === '127.0.0.1') return 'http://localhost';
  // Otherwise, use the same host the browser loaded the page from
  return `http://${h}`;
})();

const CONFIG = {
  // StockDataCollectionAgent
  STOCK_API:          `${_host}:8001`,
  // SortStockingAgent
  SORT_API:           `${_host}:8002`,
  // NewsCollectorAgent
  NEWS_COLLECTOR_API: `${_host}:5000`,
  // NewsAnalysisAgent
  NEWS_ANALYSIS_API:  `${_host}:8003`,
  // Refresh intervals (ms)
  REFRESH_INTERVAL: 60000,
  NEWS_REFRESH:     120000,
};
