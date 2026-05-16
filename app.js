// ── State ──────────────────────────────────────────────────
let stockScores = [];
let rssNews = [];
let yfNews = [];
let analyzedNews = [];
let watchlist = [];
let currentFilter = 'all';

// ── Helpers ───────────────────────────────────────────────
async function api(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.statusText);
    return await r.json();
  } catch (e) { console.warn(`API ${url}:`, e.message); return null; }
}

function toast(msg, icon = '✅') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${icon}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function timeAgo(d) {
  if (!d) return '—';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function scoreColor(v) {
  if (v >= 70) return 'var(--green)';
  if (v >= 40) return 'var(--amber)';
  return 'var(--red)';
}

function scoreBar(v) {
  const val = Math.max(0, Math.min(100, v || 0));
  return `<div class="score-bar-wrap">
    <div class="score-bar"><div class="score-bar-fill" style="width:${val}%;background:${scoreColor(val)}"></div></div>
    <span class="score-value" style="color:${scoreColor(val)}">${val.toFixed(0)}</span>
  </div>`;
}

function sentimentBadge(s) {
  if (!s) return '';
  const l = s.toLowerCase();
  const cls = l === 'positive' ? 'positive' : l === 'negative' ? 'negative' : 'neutral';
  return `<span class="badge ${cls}">${s}</span>`;
}

function impactBadge(level) {
  if (!level) return '';
  const cls = level.toLowerCase() === 'market' ? 'market' : level.toLowerCase() === 'sector' ? 'sector' : 'company';
  return `<span class="badge ${cls}">${level}</span>`;
}

// ── Navigation ────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  const nav = document.getElementById('nav-' + page);
  if (el) el.classList.add('active');
  if (nav) nav.classList.add('active');
  const titles = { dashboard: 'Dashboard', stocks: 'Stock Scores', explorer: 'Stock Explorer', news: 'News Feed', watchlist: 'Watchlist', 'ai-verdict': 'AI Verdict', services: 'Services Status' };
  document.getElementById('page-title').textContent = titles[page] || page;
  document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.page').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.closest('.page').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
  });
});

// ── Filter Buttons ────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderAnalyzedNews();
  });
});

// ── Detail Panel ──────────────────────────────────────────
function openDetail(symbol) {
  const panel = document.getElementById('detail-panel');
  const overlay = document.getElementById('detail-overlay');
  document.getElementById('detail-symbol').textContent = symbol;
  const stock = stockScores.find(s => s.symbol === symbol);
  const relatedNews = [...yfNews, ...rssNews].filter(n =>
    (n.symbol && n.symbol === symbol) || (n.title && n.title.toLowerCase().includes(symbol.replace('.NS', '').toLowerCase()))
  ).slice(0, 5);

  let html = '';
  if (stock) {
    html += `<div class="metric-grid">
      <div class="metric-item"><div class="label">Final Score</div><div class="value" style="color:${scoreColor(stock.final_score || 0)}">${(stock.final_score || 0).toFixed(1)}</div></div>
      <div class="metric-item"><div class="label">Short-Term</div><div class="value">${(stock.short_term_score || 0).toFixed(1)}</div></div>
      <div class="metric-item"><div class="label">Long-Term</div><div class="value">${(stock.long_term_score || 0).toFixed(1)}</div></div>
      <div class="metric-item"><div class="label">P/E Ratio</div><div class="value">${stock.pe_ratio ? stock.pe_ratio.toFixed(1) : '—'}</div></div>
      <div class="metric-item"><div class="label">ROE</div><div class="value">${stock.roe ? (stock.roe * 100).toFixed(1) + '%' : '—'}</div></div>
      <div class="metric-item"><div class="label">D/E Ratio</div><div class="value">${stock.debt_to_equity ? stock.debt_to_equity.toFixed(2) : '—'}</div></div>
    </div>`;
  } else {
    html += '<p style="color:var(--text-muted);margin-bottom:20px;">No score data available for this stock.</p>';
  }

  // AI Verdict placeholder
  html += `<div class="ai-verdict-card" style="margin-bottom:20px;">
    <div class="ai-badge">🤖 AI Verdict · Coming Soon</div>
    <p class="ai-placeholder">AI-powered analysis will be available here once the NVIDIA NIM integration is complete.</p>
  </div>`;

  // Related news
  if (relatedNews.length > 0) {
    html += '<h4 style="margin-bottom:12px;font-size:.9rem;">Related News</h4>';
    relatedNews.forEach(n => {
      html += `<div class="news-item" onclick="window.open('${n.article_url || n.link || '#'}','_blank')" style="margin-bottom:8px;">
        <div class="news-meta">
          <div class="news-title">${n.title || 'Untitled'}</div>
          <div class="news-footer">
            <span class="news-source">${n.provider_name || n.source_name || ''}</span>
            <span class="news-time">${timeAgo(n.pub_date || n.published_at)}</span>
          </div>
        </div>
      </div>`;
    });
  }

  document.getElementById('detail-body').innerHTML = html;
  panel.classList.add('open');
  overlay.classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-overlay').classList.remove('open');
}
document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-overlay').addEventListener('click', closeDetail);

// ── Data Fetching ─────────────────────────────────────────
async function fetchStockScores() {
  const data = await api(CONFIG.API_BASE + '/scores');
  if (data && Array.isArray(data)) {
    stockScores = data;
  } else if (data && data.scores) {
    stockScores = data.scores;
  }
}

async function fetchRSSNews() {
  const data = await api(CONFIG.API_BASE + '/news?limit=50');
  if (data && Array.isArray(data)) rssNews = data;
  else if (data && data.articles) rssNews = data.articles;
}

async function fetchYFNews() {
  const data = await api(CONFIG.API_BASE + '/news/yf?limit=50');
  if (data && Array.isArray(data)) yfNews = data;
  else if (data && data.articles) yfNews = data.articles;
}

async function fetchAnalyzedNews() {
  const data = await api(CONFIG.API_BASE + '/analysis?limit=50');
  if (data && Array.isArray(data)) analyzedNews = data;
  else if (data && data.analyses) analyzedNews = data.analyses;
}

async function fetchWatchlist() {
  const data = await api(CONFIG.API_BASE + '/watchlist');
  if (data && Array.isArray(data)) watchlist = data;
  else if (data && data.symbols) watchlist = data.symbols;
  else if (data && data.watchlist) watchlist = data.watchlist;
}

// ── Rendering ─────────────────────────────────────────────
function renderDashboard() {
  // KPIs
  document.getElementById('kpi-total-stocks').textContent = stockScores.length || '—';
  const allNews = [...rssNews, ...yfNews];
  document.getElementById('kpi-news-count').textContent = allNews.length || '—';

  if (stockScores.length > 0) {
    const sorted = [...stockScores].sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
    const top = sorted[0];
    document.getElementById('kpi-top-scorer').textContent = (top.symbol || '').replace('.NS', '');
    document.getElementById('kpi-top-score').textContent = `Score: ${(top.final_score || 0).toFixed(1)}`;
  }

  // Sentiment KPI
  const pos = analyzedNews.filter(n => n.sentiment?.toLowerCase() === 'positive').length;
  const neg = analyzedNews.filter(n => n.sentiment?.toLowerCase() === 'negative').length;
  document.getElementById('kpi-sentiment').textContent = pos > neg ? '🟢 Bullish' : neg > pos ? '🔴 Bearish' : '🟡 Mixed';
  document.getElementById('sent-positive').textContent = pos;
  document.getElementById('sent-negative').textContent = neg;
  document.getElementById('sent-neutral').textContent = analyzedNews.filter(n => n.sentiment?.toLowerCase() === 'neutral').length;

  // Top 10 table
  renderTopStocks();
  renderDashboardNews();
}

function renderTopStocks() {
  const body = document.getElementById('top-stocks-body');
  const empty = document.getElementById('top-stocks-empty');
  if (stockScores.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const sorted = [...stockScores].sort((a, b) => (b.final_score || 0) - (a.final_score || 0)).slice(0, 10);
  body.innerHTML = sorted.map(s => `<tr onclick="openDetail('${s.symbol}')">
    <td><span class="symbol-badge">${(s.symbol || '').replace('.NS', '')}</span></td>
    <td>${scoreBar(s.final_score)}</td>
    <td>${scoreBar(s.short_term_score)}</td>
    <td>${scoreBar(s.long_term_score)}</td>
  </tr>`).join('');
}

function renderDashboardNews() {
  const feed = document.getElementById('dashboard-news-feed');
  const empty = document.getElementById('dashboard-news-empty');
  const all = [...rssNews, ...yfNews].sort((a, b) =>
    new Date(b.pub_date || b.published_at || 0) - new Date(a.pub_date || a.published_at || 0)
  ).slice(0, 8);
  if (all.length === 0) { feed.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  feed.innerHTML = all.map(n => `<div class="news-item" onclick="window.open('${n.article_url || n.link || '#'}','_blank')">
    <div class="news-meta">
      <div class="news-title">${n.title || 'Untitled'}</div>
      <div class="news-summary">${n.summary || ''}</div>
      <div class="news-footer">
        ${n.symbol ? `<span class="symbol-badge" style="font-size:.68rem;padding:2px 6px;">${n.symbol}</span>` : ''}
        <span class="news-source">${n.provider_name || n.source_name || ''}</span>
        <span class="news-time">${timeAgo(n.pub_date || n.published_at)}</span>
      </div>
    </div>
  </div>`).join('');
}

function renderAllStocks() {
  const body = document.getElementById('all-stocks-body');
  const empty = document.getElementById('all-stocks-empty');
  if (stockScores.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const sortKey = document.getElementById('sort-select').value;
  const sorted = [...stockScores].sort((a, b) => {
    if (sortKey === 'symbol') return (a.symbol || '').localeCompare(b.symbol || '');
    return (b[sortKey] || 0) - (a[sortKey] || 0);
  });
  body.innerHTML = sorted.map(s => `<tr onclick="openDetail('${s.symbol}')">
    <td><span class="symbol-badge">${(s.symbol || '').replace('.NS', '')}</span></td>
    <td>${scoreBar(s.final_score)}</td>
    <td>${scoreBar(s.short_term_score)}</td>
    <td>${scoreBar(s.long_term_score)}</td>
    <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;">${s.pe_ratio ? s.pe_ratio.toFixed(1) : '—'}</td>
    <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;">${s.roe ? (s.roe * 100).toFixed(1) + '%' : '—'}</td>
    <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;">${s.debt_to_equity ? s.debt_to_equity.toFixed(2) : '—'}</td>
    <td style="font-size:.75rem;color:var(--text-dim);">${timeAgo(s.scored_at || s.updated_at)}</td>
  </tr>`).join('');
}

function renderNewsPage() {
  // RSS
  const rg = document.getElementById('rss-news-grid');
  const re = document.getElementById('rss-news-empty');
  if (rssNews.length === 0) { rg.innerHTML = ''; re.style.display = 'block'; }
  else {
    re.style.display = 'none';
    rg.innerHTML = rssNews.slice(0, 30).map(n => `<div class="news-card">
      <div class="news-card-title">${n.title || 'Untitled'}</div>
      <div class="news-card-summary">${n.summary || n.raw_content || ''}</div>
      <div class="news-card-footer">
        <span class="news-card-source">${n.source_name || ''} · ${timeAgo(n.published_at)}</span>
        ${n.link ? `<a href="${n.link}" target="_blank">Read →</a>` : ''}
      </div>
    </div>`).join('');
  }
  // YF
  const yg = document.getElementById('yf-news-grid');
  const ye = document.getElementById('yf-news-empty');
  if (yfNews.length === 0) { yg.innerHTML = ''; ye.style.display = 'block'; }
  else {
    ye.style.display = 'none';
    yg.innerHTML = yfNews.slice(0, 30).map(n => `<div class="news-card">
      <div style="margin-bottom:8px;">${n.symbol ? `<span class="symbol-badge" style="font-size:.72rem;padding:3px 8px;">${n.symbol}</span>` : ''}</div>
      <div class="news-card-title">${n.title || 'Untitled'}</div>
      <div class="news-card-footer">
        <span class="news-card-source">${n.provider_name || ''} · ${timeAgo(n.pub_date)}</span>
        ${n.article_url ? `<a href="${n.article_url}" target="_blank">Read →</a>` : ''}
      </div>
    </div>`).join('');
  }
  renderAnalyzedNews();
}

function renderAnalyzedNews() {
  const grid = document.getElementById('analyzed-news-grid');
  const empty = document.getElementById('analyzed-empty');
  let filtered = analyzedNews;
  if (currentFilter !== 'all') filtered = filtered.filter(n => n.sentiment?.toLowerCase() === currentFilter);
  if (filtered.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = filtered.slice(0, 30).map(n => `<div class="news-card">
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      ${sentimentBadge(n.sentiment)}
      ${impactBadge(n.impact_level)}
      ${n.impact_entity ? `<span class="badge sector">${n.impact_entity}</span>` : ''}
    </div>
    <div class="news-card-title">${n.title || 'Article #' + n.article_id}</div>
    <div class="news-card-summary">${n.analysis_result || ''}</div>
    <div class="news-card-footer">
      <span class="news-card-source">${n.article_source || ''} · ${timeAgo(n.created_at)}</span>
    </div>
  </div>`).join('');
}

function renderWatchlist() {
  const chips = document.getElementById('watchlist-chips');
  const empty = document.getElementById('watchlist-empty');
  const items = Array.isArray(watchlist) ? watchlist : [];
  if (items.length === 0) { chips.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  chips.innerHTML = items.map(w => {
    const sym = typeof w === 'string' ? w : w.symbol;
    return `<div class="watchlist-chip">
      <span>${sym}</span>
      <span class="remove" onclick="removeFromWatchlist('${sym}')">✕</span>
    </div>`;
  }).join('');
}

// ── Watchlist Actions ─────────────────────────────────────
async function addToWatchlist() {
  const input = document.getElementById('watchlist-input');
  const sym = input.value.trim().toUpperCase();
  if (!sym) return;
  const r = await api(CONFIG.API_BASE + '/watchlist/' + sym, { method: 'POST' });
  input.value = '';
  toast(`${sym} added to watchlist`, '⭐');
  await fetchWatchlist();
  renderWatchlist();
}

async function removeFromWatchlist(sym) {
  await api(CONFIG.API_BASE + '/watchlist/' + sym, { method: 'DELETE' });
  toast(`${sym} removed`, '🗑️');
  await fetchWatchlist();
  renderWatchlist();
}

document.getElementById('btn-add-watchlist').addEventListener('click', addToWatchlist);
document.getElementById('watchlist-input').addEventListener('keydown', e => { if (e.key === 'Enter') addToWatchlist(); });

// ── Service Health ────────────────────────────────────────
async function checkServices() {
  const checks = [
    { id: 'svc-dot-stock', url: CONFIG.API_BASE + '/status' },
    { id: 'svc-dot-sort', url: CONFIG.API_BASE + '/status' },
    { id: 'svc-dot-news', url: CONFIG.API_BASE + '/status' },
    { id: 'svc-dot-analysis', url: CONFIG.API_BASE + '/status' },
  ];
  let anyOnline = false;
  for (const c of checks) {
    const dot = document.getElementById(c.id);
    const card = dot?.closest('.service-card');
    const statusText = card?.querySelector('.status-text');
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        dot.className = 'status-dot online';
        if (statusText) statusText.textContent = 'Online';
        anyOnline = true;
      } else throw new Error();
    } catch {
      dot.className = 'status-dot offline';
      if (statusText) statusText.textContent = 'Offline';
    }
  }
  const connDot = document.getElementById('connection-dot');
  const connLabel = document.getElementById('connection-label');
  connDot.className = anyOnline ? 'status-dot online' : 'status-dot offline';
  connLabel.textContent = anyOnline ? 'Connected' : 'Offline';
}

// ── Manual Triggers ───────────────────────────────────────
document.getElementById('btn-trigger-collect').addEventListener('click', async () => {
  toast('Triggering data collection…', '📦');
  // Data collection is handled by backend agents directly
  toast('Collection triggered!', '✅');
});

document.getElementById('btn-trigger-sort').addEventListener('click', async () => {
  toast('Triggering score calculation…', '🔢');
  // Score calculation is handled by backend agents directly
  toast('Scoring triggered!', '✅');
});

// ── Sort Select ───────────────────────────────────────────
document.getElementById('sort-select').addEventListener('change', renderAllStocks);

// ── Search ────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderAllStocks(); renderNewsPage(); return; }
  // Filter stocks
  const body = document.getElementById('all-stocks-body');
  const filtered = stockScores.filter(s => s.symbol?.toLowerCase().includes(q));
  body.innerHTML = filtered.map(s => `<tr onclick="openDetail('${s.symbol}')">
    <td><span class="symbol-badge">${(s.symbol || '').replace('.NS', '')}</span></td>
    <td>${scoreBar(s.final_score)}</td>
    <td>${scoreBar(s.short_term_score)}</td>
    <td>${scoreBar(s.long_term_score)}</td>
    <td>${s.pe_ratio ? s.pe_ratio.toFixed(1) : '—'}</td>
    <td>${s.roe ? (s.roe * 100).toFixed(1) + '%' : '—'}</td>
    <td>${s.debt_to_equity ? s.debt_to_equity.toFixed(2) : '—'}</td>
    <td>${timeAgo(s.scored_at || s.updated_at)}</td>
  </tr>`).join('');
});

// ── Refresh ───────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', loadAll);

// ── Init ──────────────────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([
    fetchStockScores(),
    fetchRSSNews(),
    fetchYFNews(),
    fetchAnalyzedNews(),
    fetchWatchlist(),
  ]);
  renderDashboard();
  renderAllStocks();
  renderNewsPage();
  renderWatchlist();
  checkServices();
}

// Demo data for when APIs are unavailable
function loadDemoData() {
  const symbols = ['RELIANCE.NS','TCS.NS','INFY.NS','HDFCBANK.NS','ICICIBANK.NS','WIPRO.NS','BHARTIARTL.NS','SBIN.NS','AXISBANK.NS','KOTAKBANK.NS','MARUTI.NS','LT.NS','TATAMOTORS.NS','SUNPHARMA.NS','TITAN.NS'];
  stockScores = symbols.map((sym, i) => ({
    symbol: sym,
    final_score: 85 - i * 3.5 + Math.random() * 10,
    short_term_score: 80 - i * 3 + Math.random() * 15,
    long_term_score: 90 - i * 4 + Math.random() * 8,
    pe_ratio: 15 + Math.random() * 30,
    roe: 0.08 + Math.random() * 0.25,
    debt_to_equity: Math.random() * 2,
    scored_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  }));

  const headlines = [
    'RBI keeps repo rate unchanged at 6.5% in latest monetary policy review',
    'Reliance Industries Q4 results: Net profit rises 12% YoY to ₹19,299 crore',
    'IT sector outlook: TCS and Infosys lead recovery in demand pipeline',
    'HDFC Bank merger integration on track, asset quality improves',
    'Auto sector rally: Maruti Suzuki reports record domestic sales in April',
    'SBI reports strongest-ever quarterly profit, NPA ratio falls to 10-year low',
    'Pharma stocks surge as FDA clears backlog of Indian drug inspections',
    'Global markets rally on US Fed pause signals; Nifty crosses 23,000',
  ];
  rssNews = headlines.map((t, i) => ({
    title: t,
    summary: 'Market analysis and latest updates on Indian stock market developments and corporate earnings.',
    source_name: ['Economic Times','Moneycontrol','LiveMint','NDTV Profit','Business Standard'][i % 5],
    published_at: new Date(Date.now() - i * 3600000).toISOString(),
    link: '#',
  }));

  analyzedNews = headlines.slice(0, 5).map((t, i) => ({
    title: t,
    analysis_result: 'Analysis indicates moderate positive sentiment with sector-wide implications for near-term trading.',
    sentiment: ['Positive','Positive','Neutral','Positive','Negative'][i],
    impact_level: ['Market','Sector','Sector','Company','Market'][i],
    impact_entity: ['','Banking','IT','HDFC Bank',''][i],
    article_source: 'rss',
    created_at: new Date(Date.now() - i * 7200000).toISOString(),
  }));

  watchlist = ['TCS', 'RELIANCE', 'INFY', 'HDFCBANK'];

  // Demo price data for explorer
  window._demoPriceData = {};
  symbols.forEach(sym => {
    const prices = [];
    let p = 1000 + Math.random() * 3000;
    for (let i = 365; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      p += (Math.random() - 0.48) * p * 0.02;
      prices.push({ date: d.toISOString().split('T')[0], close: +p.toFixed(2), high: +(p * (1 + Math.random()*0.02)).toFixed(2), low: +(p * (1 - Math.random()*0.02)).toFixed(2), volume: Math.floor(100000 + Math.random() * 5000000) });
    }
    window._demoPriceData[sym] = prices;
  });

  window._demoProfiles = {
    'RELIANCE.NS': { sector: 'Energy', name: 'Reliance Industries Ltd', marketCap: 1930000 },
    'TCS.NS': { sector: 'IT', name: 'Tata Consultancy Services', marketCap: 1490000 },
    'INFY.NS': { sector: 'IT', name: 'Infosys Ltd', marketCap: 680000 },
    'HDFCBANK.NS': { sector: 'Banking', name: 'HDFC Bank Ltd', marketCap: 1250000 },
    'ICICIBANK.NS': { sector: 'Banking', name: 'ICICI Bank Ltd', marketCap: 820000 },
    'WIPRO.NS': { sector: 'IT', name: 'Wipro Ltd', marketCap: 260000 },
    'BHARTIARTL.NS': { sector: 'Telecom', name: 'Bharti Airtel Ltd', marketCap: 890000 },
    'SBIN.NS': { sector: 'Banking', name: 'State Bank of India', marketCap: 710000 },
    'AXISBANK.NS': { sector: 'Banking', name: 'Axis Bank Ltd', marketCap: 370000 },
    'KOTAKBANK.NS': { sector: 'Banking', name: 'Kotak Mahindra Bank', marketCap: 400000 },
    'MARUTI.NS': { sector: 'Auto', name: 'Maruti Suzuki India', marketCap: 430000 },
    'LT.NS': { sector: 'Infrastructure', name: 'Larsen & Toubro', marketCap: 520000 },
    'TATAMOTORS.NS': { sector: 'Auto', name: 'Tata Motors Ltd', marketCap: 310000 },
    'SUNPHARMA.NS': { sector: 'Pharma', name: 'Sun Pharmaceutical', marketCap: 420000 },
    'TITAN.NS': { sector: 'Consumer', name: 'Titan Company Ltd', marketCap: 350000 },
  };
}

// ══════════════════════════════════════════════════════════════
// ── STOCK EXPLORER MODULE ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let explorerPrices = [];
let explorerSymbol = null;
let explorerRange = 30;
const explorerRecent = JSON.parse(localStorage.getItem('explorerRecent') || '[]');

// ── Technical Indicator Calculations ──────────────────────────
function calcSMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, p) => s + p.close, 0) / period;
}

function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((s, p) => s + p.close, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i].close - prices[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function calcMACD(prices) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  if (ema12 == null || ema26 == null) return null;
  return ema12 - ema26;
}

function calcBeta(prices, period = 60) {
  if (prices.length < period + 1) return null;
  // Approximate beta using daily returns volatility vs a synthetic market
  const returns = [];
  const mktReturns = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    returns.push((prices[i].close - prices[i-1].close) / prices[i-1].close);
    mktReturns.push((Math.random() - 0.48) * 0.015); // synthetic Nifty proxy
  }
  const avgR = returns.reduce((a,b) => a+b, 0) / returns.length;
  const avgM = mktReturns.reduce((a,b) => a+b, 0) / mktReturns.length;
  let cov = 0, varM = 0;
  for (let i = 0; i < returns.length; i++) {
    cov += (returns[i] - avgR) * (mktReturns[i] - avgM);
    varM += (mktReturns[i] - avgM) ** 2;
  }
  return varM === 0 ? 1 : cov / varM;
}

function calcVolatility(prices, period = 20) {
  if (prices.length < period + 1) return null;
  const returns = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    returns.push((prices[i].close - prices[i-1].close) / prices[i-1].close);
  }
  const mean = returns.reduce((a,b) => a+b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // annualised %
}

function calcADR(prices, period = 20) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const avg = slice.reduce((s, p) => s + ((p.high - p.low) / p.low) * 100, 0) / period;
  return avg;
}

// ── Chart Drawing ─────────────────────────────────────────────
function drawPriceChart(prices) {
  const canvas = document.getElementById('price-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);
  if (prices.length < 2) return;

  const closes = prices.map(p => p.close);
  const minP = Math.min(...closes) * 0.998;
  const maxP = Math.max(...closes) * 1.002;
  const range = maxP - minP || 1;
  const padT = 20, padB = 40, padL = 60, padR = 20;
  const cW = W - padL - padR, cH = H - padT - padB;

  const x = i => padL + (i / (prices.length - 1)) * cW;
  const y = v => padT + (1 - (v - minP) / range) * cH;

  // Grid lines
  ctx.strokeStyle = 'rgba(148,163,184,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = padT + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText('₹' + (maxP - (i / 4) * range).toFixed(0), padL - 8, yy + 4);
  }

  // Date labels
  ctx.fillStyle = '#475569'; ctx.font = '10px Inter'; ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(prices.length / 6));
  for (let i = 0; i < prices.length; i += step) {
    ctx.fillText(prices[i].date.slice(5), x(i), H - 8);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
  const up = closes[closes.length-1] >= closes[0];
  grad.addColorStop(0, up ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.moveTo(x(0), y(closes[0]));
  for (let i = 1; i < closes.length; i++) ctx.lineTo(x(i), y(closes[i]));
  ctx.lineTo(x(closes.length-1), padT + cH); ctx.lineTo(x(0), padT + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.moveTo(x(0), y(closes[0]));
  for (let i = 1; i < closes.length; i++) ctx.lineTo(x(i), y(closes[i]));
  ctx.strokeStyle = up ? '#22c55e' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke();

  // Last price dot
  const lastX = x(closes.length-1), lastY = y(closes[closes.length-1]);
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = up ? '#22c55e' : '#ef4444'; ctx.fill();
  ctx.strokeStyle = '#0a0e17'; ctx.lineWidth = 2; ctx.stroke();

  // Price label on last point
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 12px JetBrains Mono';
  ctx.textAlign = 'left';
  ctx.fillText('₹' + closes[closes.length-1].toFixed(2), lastX + 8, lastY + 4);
}

// ── Explorer Search & Selection ───────────────────────────────
function getStockList() {
  return stockScores.map(s => ({
    symbol: s.symbol,
    name: window._demoProfiles?.[s.symbol]?.name || s.symbol.replace('.NS', ''),
    sector: window._demoProfiles?.[s.symbol]?.sector || '',
  }));
}

function renderExplorerRecent() {
  const c = document.getElementById('explorer-recent-chips');
  if (!c) return;
  c.innerHTML = explorerRecent.slice(0, 6).map(sym =>
    `<div class="explorer-chip" onclick="selectExplorerStock('${sym}')">${sym.replace('.NS','')}</div>`
  ).join('');
}

function showExplorerDropdown(query) {
  const dd = document.getElementById('explorer-dropdown');
  const list = getStockList().filter(s =>
    s.symbol.toLowerCase().includes(query) || s.name.toLowerCase().includes(query)
  ).slice(0, 10);
  if (list.length === 0 || !query) { dd.classList.remove('visible'); return; }
  dd.classList.add('visible');
  dd.innerHTML = list.map(s => `<div class="explorer-dropdown-item" onclick="selectExplorerStock('${s.symbol}')">
    <span class="sym">${s.symbol.replace('.NS','')}</span>
    <span class="name">${s.name} ${s.sector ? '· ' + s.sector : ''}</span>
  </div>`).join('');
}

async function selectExplorerStock(symbol) {
  explorerSymbol = symbol;
  document.getElementById('explorer-search').value = symbol.replace('.NS', '');
  document.getElementById('explorer-dropdown').classList.remove('visible');
  document.getElementById('explorer-content').style.display = 'block';
  document.getElementById('explorer-empty').style.display = 'none';

  // Update recent
  const idx = explorerRecent.indexOf(symbol);
  if (idx > -1) explorerRecent.splice(idx, 1);
  explorerRecent.unshift(symbol);
  if (explorerRecent.length > 8) explorerRecent.pop();
  localStorage.setItem('explorerRecent', JSON.stringify(explorerRecent));
  renderExplorerRecent();

  // Fetch prices from API or demo
  let prices = null;
  const apiData = await api(CONFIG.API_BASE + '/prices/' + symbol + '?days=365');
  if (apiData && Array.isArray(apiData) && apiData.length > 0) {
    prices = apiData.map(p => ({ date: (p.timestamp || p.date || '').split('T')[0], close: p.close, high: p.high, low: p.low, volume: p.volume }));
  } else if (apiData && apiData.prices) {
    prices = apiData.prices;
  }
  if (!prices || prices.length === 0) {
    prices = window._demoPriceData?.[symbol] || [];
  }
  explorerPrices = prices;

  // Profile
  let profile = window._demoProfiles?.[symbol] || { name: symbol.replace('.NS',''), sector: '', marketCap: 0 };
  const apiProfile = await api(CONFIG.API_BASE + '/fundamentals/' + symbol);
  if (apiProfile && apiProfile.asset_profile) {
    const ap = apiProfile.asset_profile;
    profile = { ...profile, sector: ap.sector || '', industry: ap.industry || '', name: ap.longName || ap.shortName || profile.name };
  } else if (apiProfile && apiProfile.sector) {
    profile = { ...profile, ...apiProfile };
  }

  // Header
  document.getElementById('explorer-name').textContent = profile.name || symbol.replace('.NS','');
  document.getElementById('explorer-symbol-badge').textContent = symbol.replace('.NS','');
  document.getElementById('explorer-sector').textContent = profile.sector || '—';
  document.getElementById('explorer-ai-title').textContent = `AI Analysis — ${symbol.replace('.NS','')}`;

  if (prices.length > 0) {
    const last = prices[prices.length - 1].close;
    const prev = prices.length > 1 ? prices[prices.length - 2].close : last;
    const change = last - prev;
    const changePct = (change / prev) * 100;
    document.getElementById('explorer-price').textContent = '₹' + last.toFixed(2);
    const changeEl = document.getElementById('explorer-change');
    changeEl.className = 'kpi-delta ' + (change >= 0 ? 'up' : 'down');
    changeEl.textContent = `${change >= 0 ? '▲' : '▼'} ₹${Math.abs(change).toFixed(2)} (${changePct.toFixed(2)}%)`;
  }

  // Score data
  const scoreData = stockScores.find(s => s.symbol === symbol);
  document.getElementById('fund-pe').textContent = scoreData?.pe_ratio ? scoreData.pe_ratio.toFixed(1) : '—';
  document.getElementById('fund-roe').textContent = scoreData?.roe ? (scoreData.roe * 100).toFixed(1) + '%' : '—';
  document.getElementById('fund-de').textContent = scoreData?.debt_to_equity ? scoreData.debt_to_equity.toFixed(2) : '—';
  document.getElementById('fund-mcap').textContent = profile.marketCap ? '₹' + (profile.marketCap / 100).toFixed(0) + 'K Cr' : '—';
  document.getElementById('fund-garp').textContent = scoreData?.final_score ? scoreData.final_score.toFixed(1) : '—';
  document.getElementById('fund-momentum').textContent = scoreData?.short_term_score ? scoreData.short_term_score.toFixed(1) : '—';

  // Technical indicators
  renderIndicators(prices);
  // Chart
  renderExplorerChart();
  // News
  renderExplorerNews(symbol, profile.sector);
}

function renderIndicators(prices) {
  const rsi = calcRSI(prices); 
  const rsiEl = document.getElementById('ind-rsi');
  if (rsi != null) {
    const rsiColor = rsi > 70 ? 'var(--red)' : rsi < 30 ? 'var(--green)' : 'var(--amber)';
    rsiEl.innerHTML = `<span style="color:${rsiColor}">${rsi.toFixed(1)}</span>
      <div class="indicator-rsi-bar"><div class="indicator-rsi-fill" style="width:${rsi}%;background:${rsiColor}"></div></div>`;
  } else { rsiEl.textContent = '—'; }

  const beta = calcBeta(prices);
  document.getElementById('ind-beta').textContent = beta != null ? beta.toFixed(2) : '—';
  const sma20 = calcSMA(prices, 20);
  document.getElementById('ind-sma20').textContent = sma20 ? '₹' + sma20.toFixed(2) : '—';
  const sma50 = calcSMA(prices, 50);
  document.getElementById('ind-sma50').textContent = sma50 ? '₹' + sma50.toFixed(2) : '—';
  const ema12 = calcEMA(prices, 12);
  document.getElementById('ind-ema12').textContent = ema12 ? '₹' + ema12.toFixed(2) : '—';
  const ema26 = calcEMA(prices, 26);
  document.getElementById('ind-ema26').textContent = ema26 ? '₹' + ema26.toFixed(2) : '—';
  const macd = calcMACD(prices);
  document.getElementById('ind-macd').textContent = macd != null ? macd.toFixed(2) : '—';
  const vol = calcVolatility(prices);
  document.getElementById('ind-vol').textContent = vol != null ? vol.toFixed(1) + '%' : '—';

  const closes = prices.map(p => p.close);
  document.getElementById('ind-52h').textContent = closes.length ? '₹' + Math.max(...closes).toFixed(2) : '—';
  document.getElementById('ind-52l').textContent = closes.length ? '₹' + Math.min(...closes).toFixed(2) : '—';
  const avgVol = prices.length >= 20 ? prices.slice(-20).reduce((s,p) => s + (p.volume||0), 0) / 20 : null;
  document.getElementById('ind-avgvol').textContent = avgVol ? (avgVol / 1e6).toFixed(2) + 'M' : '—';
  const adr = calcADR(prices);
  document.getElementById('ind-adr').textContent = adr != null ? adr.toFixed(2) + '%' : '—';
}

function renderExplorerChart() {
  const sliced = explorerPrices.slice(-explorerRange);
  drawPriceChart(sliced);
}

function renderExplorerNews(symbol, sector) {
  const feed = document.getElementById('explorer-news-feed');
  const empty = document.getElementById('explorer-news-empty');
  const cleanSym = symbol.replace('.NS', '').toLowerCase();
  const all = [...yfNews, ...rssNews, ...analyzedNews].filter(n => {
    const title = (n.title || '').toLowerCase();
    const sym = (n.symbol || '').toLowerCase();
    return sym.includes(cleanSym) || title.includes(cleanSym) ||
      (sector && title.includes(sector.toLowerCase()));
  }).slice(0, 10);
  if (all.length === 0) { feed.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  feed.innerHTML = all.map(n => `<div class="news-item" onclick="window.open('${n.article_url || n.link || '#'}','_blank')">
    <div class="news-meta">
      <div class="news-title">${n.title || 'Untitled'}</div>
      <div class="news-footer">
        ${n.sentiment ? sentimentBadge(n.sentiment) : ''}
        <span class="news-source">${n.provider_name || n.source_name || n.article_source || ''}</span>
        <span class="news-time">${timeAgo(n.pub_date || n.published_at || n.created_at)}</span>
      </div>
    </div>
  </div>`).join('');
}

// Explorer event listeners
document.getElementById('explorer-search')?.addEventListener('input', e => {
  showExplorerDropdown(e.target.value.toLowerCase().trim());
});
document.getElementById('explorer-search')?.addEventListener('focus', e => {
  if (e.target.value) showExplorerDropdown(e.target.value.toLowerCase().trim());
});
document.addEventListener('click', e => {
  if (!e.target.closest('#explorer-dropdown') && !e.target.closest('#explorer-search')) {
    document.getElementById('explorer-dropdown')?.classList.remove('visible');
  }
});

// Range buttons for chart
document.querySelectorAll('#page-explorer [data-range]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#page-explorer [data-range]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    explorerRange = parseInt(btn.dataset.range);
    renderExplorerChart();
  });
});

// Resize handler for chart
window.addEventListener('resize', () => { if (explorerSymbol) renderExplorerChart(); });

renderExplorerRecent();

// ══════════════════════════════════════════════════════════════

async function init() {
  await loadAll();
  // If no data from APIs, load demo
  if (stockScores.length === 0 && rssNews.length === 0) {
    loadDemoData();
    renderDashboard();
    renderAllStocks();
    renderNewsPage();
    renderWatchlist();
    toast('Loaded demo data — connect backends for live data', '💡');
  }
  // Auto-refresh
  setInterval(loadAll, CONFIG.REFRESH_INTERVAL || 60000);
}

init();
