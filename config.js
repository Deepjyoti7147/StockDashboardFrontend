const _isLocal = (() => {
  const h = window.location.hostname;
  return !h || h === 'localhost' || h === '127.0.0.1';
})();

const _origin = window.location.origin;

const CONFIG = {
  // When deployed: nginx proxies /api/* to backend services (same-origin, no CORS)
  // When local: direct calls to localhost ports
  STOCK_API:          _isLocal ? 'http://localhost:8001' : `${_origin}/api/stock`,
  SORT_API:           _isLocal ? 'http://localhost:8002' : `${_origin}/api/sort`,
  NEWS_COLLECTOR_API: _isLocal ? 'http://localhost:5000' : `${_origin}/api/news`,
  NEWS_ANALYSIS_API:  _isLocal ? 'http://localhost:8003' : `${_origin}/api/analysis`,
  // Refresh intervals (ms)
  REFRESH_INTERVAL: 60000,
  NEWS_REFRESH:     120000,
};

