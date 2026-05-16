// API config — all endpoints are same-origin via Express backend
const _origin = window.location.origin;

const CONFIG = {
  // All data comes from the Express API (which queries PostgreSQL directly)
  API_BASE: _origin + '/api',
  // Refresh intervals (ms)
  REFRESH_INTERVAL: 60000,
  NEWS_REFRESH:     120000,
};
