const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

// ── Database Pools ─────────────────────────────────────────
// Both DBs share same host/user/password, different DB name
const stockDb = new Pool({
  host:     process.env.POSTGRES_HOST || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB   || 'stockdata',
  user:     process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const newsDb = new Pool({
  host:     process.env.POSTGRES_HOST || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.NEWS_POSTGRES_DB || 'newsdb',
  user:     process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper: safe query with error handling
async function safeQuery(pool, sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error(`DB query error: ${err.message}`);
    return null;
  }
}

// ── Health / Status ────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const stockOk = await safeQuery(stockDb, 'SELECT 1');
  const newsOk  = await safeQuery(newsDb,  'SELECT 1');
  res.json({
    status: 'ok',
    databases: {
      stockdata: stockOk ? 'connected' : 'disconnected',
      newsdb:    newsOk  ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Stock Prices ───────────────────────────────────────────
// GET /api/prices/:symbol?days=30&interval=1d
app.get('/api/prices/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const days = parseInt(req.query.days || '30');
  const interval = req.query.interval || '1d';

  const rows = await safeQuery(stockDb, `
    SELECT symbol, company_name, timestamp, open, high, low, close, adj_close, volume
    FROM stock_prices
    WHERE symbol = $1 AND interval = $2
      AND timestamp >= NOW() - INTERVAL '${days} days'
    ORDER BY timestamp ASC
  `, [symbol, interval]);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// GET /api/prices/latest — latest price per symbol
app.get('/api/prices-latest', async (req, res) => {
  const rows = await safeQuery(stockDb, `
    SELECT DISTINCT ON (symbol)
      symbol, company_name, close, timestamp, volume
    FROM stock_prices
    WHERE interval = '1d'
    ORDER BY symbol, timestamp DESC
  `);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── Stock Scores ───────────────────────────────────────────
app.get('/api/scores', async (req, res) => {
  const rows = await safeQuery(stockDb, `
    SELECT *
    FROM garp_momentum_scores
    ORDER BY final_score DESC NULLS LAST
  `);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── Fundamentals ───────────────────────────────────────────
app.get('/api/fundamentals/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const rows = await safeQuery(stockDb, `
    SELECT symbol, asset_profile, balance_sheet_quarterly, balance_sheet_annual,
           cash_flow_quarterly, cash_flow_annual, updated_at
    FROM stock_fundamentals
    WHERE symbol = $1
  `, [symbol]);

  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// GET /api/fundamentals — all fundamentals (just profiles for listing)
app.get('/api/fundamentals', async (req, res) => {
  const rows = await safeQuery(stockDb, `
    SELECT symbol,
           asset_profile->>'sector' AS sector,
           asset_profile->>'industry' AS industry,
           asset_profile->>'longName' AS company_name,
           asset_profile->>'city' AS city
    FROM stock_fundamentals
    WHERE asset_profile IS NOT NULL
    ORDER BY symbol
  `);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── News (RSS) ─────────────────────────────────────────────
app.get('/api/news', async (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  const rows = await safeQuery(newsDb, `
    SELECT id, title, summary, link, published_at, source_name, category
    FROM news_articles
    ORDER BY published_at DESC NULLS LAST
    LIMIT $1
  `, [limit]);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── News (Yahoo Finance / Ticker) ──────────────────────────
app.get('/api/news/yf', async (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  const symbol = req.query.symbol; // optional filter

  let sql = `
    SELECT id, symbol, title, article_url, provider_name, pub_date
    FROM yf_news
  `;
  const params = [];

  if (symbol) {
    sql += ' WHERE symbol = $1';
    params.push(symbol);
  }

  sql += ` ORDER BY pub_date DESC NULLS LAST LIMIT $${params.length + 1}`;
  params.push(limit);

  const rows = await safeQuery(newsDb, sql, params);
  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── News Analysis (Sentiment) ──────────────────────────────
app.get('/api/analysis', async (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  const sentiment = req.query.sentiment; // optional: Positive, Negative, Neutral

  let sql = `
    SELECT na.id, na.article_id, na.article_source, na.analysis_result,
           na.impact_level, na.impact_entity, na.sentiment, na.created_at,
           CASE
             WHEN na.article_source = 'rss' THEN a.title
             WHEN na.article_source = 'yf'  THEN y.title
           END AS title,
           CASE
             WHEN na.article_source = 'rss' THEN a.link
             WHEN na.article_source = 'yf'  THEN y.article_url
           END AS link
    FROM news_analysis na
    LEFT JOIN news_articles a ON na.article_source = 'rss' AND na.article_id = a.id
    LEFT JOIN yf_news y ON na.article_source = 'yf' AND na.article_id = y.id
  `;
  const params = [];

  if (sentiment) {
    sql += ' WHERE na.sentiment = $1';
    params.push(sentiment);
  }

  sql += ` ORDER BY na.created_at DESC NULLS LAST LIMIT $${params.length + 1}`;
  params.push(limit);

  const rows = await safeQuery(newsDb, sql, params);
  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── Sentiment Summary ──────────────────────────────────────
app.get('/api/analysis/summary', async (req, res) => {
  const rows = await safeQuery(newsDb, `
    SELECT sentiment, COUNT(*) AS count
    FROM news_analysis
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY sentiment
  `);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  const summary = { positive: 0, negative: 0, neutral: 0 };
  rows.forEach(r => {
    const key = (r.sentiment || '').toLowerCase();
    if (summary.hasOwnProperty(key)) summary[key] = parseInt(r.count);
  });
  res.json(summary);
});

// ── Daily Market Report ────────────────────────────────────
app.get('/api/report', async (req, res) => {
  const rows = await safeQuery(newsDb, `
    SELECT id, report_date, report_content, created_at
    FROM daily_market_report
    ORDER BY report_date DESC
    LIMIT 1
  `);

  if (!rows || rows.length === 0) return res.json({ report: null });
  res.json(rows[0]);
});

// ── Watchlist ──────────────────────────────────────────────
app.get('/api/watchlist', async (req, res) => {
  const rows = await safeQuery(newsDb, `
    SELECT symbol, added_at
    FROM watchlist
    ORDER BY added_at DESC
  `);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

app.post('/api/watchlist/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const rows = await safeQuery(newsDb, `
    INSERT INTO watchlist (symbol) VALUES ($1)
    ON CONFLICT (symbol) DO NOTHING
    RETURNING *
  `, [symbol.toUpperCase()]);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json({ added: symbol.toUpperCase() });
});

app.delete('/api/watchlist/:symbol', async (req, res) => {
  const { symbol } = req.params;
  await safeQuery(newsDb, `DELETE FROM watchlist WHERE symbol = $1`, [symbol.toUpperCase()]);
  res.json({ removed: symbol.toUpperCase() });
});

// ── Sector-based Queries ───────────────────────────────────
// GET /api/sectors — list all sectors with stock counts
app.get('/api/sectors', async (req, res) => {
  const rows = await safeQuery(stockDb, `
    SELECT asset_profile->>'sector' AS sector, COUNT(*) AS count
    FROM stock_fundamentals
    WHERE asset_profile->>'sector' IS NOT NULL
    GROUP BY asset_profile->>'sector'
    ORDER BY count DESC
  `);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// GET /api/sectors/:sector/news — news about a sector
app.get('/api/sectors/:sector/news', async (req, res) => {
  const { sector } = req.params;
  const rows = await safeQuery(newsDb, `
    SELECT na.*, 
           CASE
             WHEN na.article_source = 'rss' THEN a.title
             WHEN na.article_source = 'yf'  THEN y.title
           END AS title
    FROM news_analysis na
    LEFT JOIN news_articles a ON na.article_source = 'rss' AND na.article_id = a.id
    LEFT JOIN yf_news y ON na.article_source = 'yf' AND na.article_id = y.id
    WHERE na.impact_level = 'Sector' AND na.impact_entity ILIKE $1
    ORDER BY na.created_at DESC
    LIMIT 20
  `, [`%${sector}%`]);

  if (!rows) return res.status(500).json({ error: 'Database error' });
  res.json(rows);
});

// ── Serve Static Frontend ──────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ StockPulse API running on port ${PORT}`);
  console.log(`   Stock DB: ${process.env.POSTGRES_HOST || 'localhost'}/${process.env.POSTGRES_DB || 'stockdata'}`);
  console.log(`   News  DB: ${process.env.POSTGRES_HOST || 'localhost'}/${process.env.NEWS_POSTGRES_DB || 'newsdb'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await stockDb.end();
  await newsDb.end();
  process.exit(0);
});
