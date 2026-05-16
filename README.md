# StockPulse — AI Stock Market Dashboard

A premium, dark-themed frontend dashboard for the Indian Stock Market AI Agent ecosystem. Aggregates data from 5 backend microservices into a unified view with stock scores, price charts, technical indicators, news feeds, sentiment analysis, watchlist management, and an AI Verdict section (NVIDIA NIM — coming soon).

## 🏗️ Architecture

This dashboard is a **pure frontend** (HTML/CSS/JS) that consumes data from your existing backend services via REST APIs. It does **not** connect to any database directly — each backend service manages its own database connection.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (StockPulse Dashboard)                         │
│  Served via Nginx on port 7417                          │
└──────┬──────┬──────┬──────┬─────────────────────────────┘
       │      │      │      │
       ▼      ▼      ▼      ▼
   :8001   :8002   :5000   :8003
   Stock   Sort    News    News
   Data    Agent   Coll.   Analysis
   Agent           Agent   Agent
       │      │      │      │
       ▼      ▼      ▼      ▼
      PostgreSQL Databases (managed by each service)
```

| Service | Port | Purpose |
|---------|------|---------|
| StockDataCollectionAgent | 8001 | EOD price data & fundamentals for 2,300+ Indian stocks |
| SortStockingAgent | 8002 | GARP + Momentum + Sentiment scoring (0–100) |
| NewsCollectorAgent | 5000 | RSS + yfinance news collection & watchlist |
| NewsAnalysisAgent | 8003 | AI sentiment analysis via NVIDIA NIM |
| FullContentAgent | — | Background article content extraction |
| **StockPulse (this)** | **3000** | **Frontend dashboard (no DB needed)** |

> **Note:** When backend services are offline, the dashboard automatically loads **demo data** so you can preview the UI. A toast notification will indicate this.

## ✨ Features

### 📊 Dashboard
- 4 KPI cards (tracked stocks, top scorer, news count, market sentiment)
- Top 10 stocks by score with animated bars
- Latest news feed with source and timestamps
- Sentiment overview (positive / negative / neutral counts)

### 📈 Stock Scores
- Full sortable table (Final, Short-Term, Long-Term scores)
- P/E, ROE, D/E columns
- Click any row → slide-out detail panel with metrics + AI verdict placeholder

### 🔬 Stock Explorer (NEW)
- Type-ahead stock search with dropdown
- Recently viewed stocks (persisted in localStorage)
- **Interactive price chart** (Canvas API, 1W/1M/3M/6M/1Y ranges)
- **12 technical indicators**: RSI (14), Beta, SMA 20/50, EMA 12/26, MACD, Volatility, 52W High/Low, Avg Volume, ADR%
- Fundamentals: P/E, ROE, D/E, Market Cap, GARP Score, Momentum
- AI Verdict placeholder per stock
- Related news filtered by stock symbol and sector

### 📰 News Feed
- 3 tabs: RSS News, Ticker News (YF), Analyzed
- Sentiment filter buttons (All / Positive / Negative / Neutral)
- Impact badges (Market / Sector / Company)

### ⭐ Watchlist
- Add/remove tickers via NewsCollectorAgent API
- View watchlist-related news

### 🤖 AI Verdict (Coming Soon)
- Placeholder for NVIDIA NIM (build.nvidia) integration
- Daily Market Report section
- Planned: multi-signal fusion, natural language reasoning, confidence scores

### ⚙️ Services Status
- Health monitoring for all backend services
- Manual trigger buttons for data collection and score calculation

## 🚀 Quick Start (Local Development)

```bash
# Serve locally with any static file server
npx -y http-server . -p 8080 -c-1

# Dashboard available at http://localhost:8080
# Demo data loads automatically when backends are offline
```

To use **real data**, start your backend services on their respective ports:
- StockDataCollectionAgent → `:8001`
- SortStockingAgent → `:8002`
- NewsCollectorAgent → `:5000`
- NewsAnalysisAgent → `:8003`

The dashboard auto-detects `localhost` and connects to them.

## 🐳 Docker

```bash
docker compose up -d --build
# Dashboard available at http://localhost:7417
```

## ☁️ Deployment (CI/CD with Tailscale SSH)

Push to `main` triggers automatic deployment via **GitHub Actions + Tailscale SSH**.

### How It Works
1. GitHub Actions runner installs Tailscale using your auth key
2. Connects to your server via Tailscale SSH (secure, no port forwarding needed)
3. Copies files, injects production `config.js` with service IPs from secrets
4. Rebuilds and restarts the Docker container

### Required GitHub Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `TAILSCALE_AUTHKEY` | ✅ Yes | Tailscale auth key ([generate here](https://login.tailscale.com/admin/settings/keys)) |
| `SERVER_IP` | ✅ Yes | **Tailscale IP** of your server (run `tailscale ip -4` on server to find it, e.g. `100.x.x.x`) |
| `SERVER_USER` | ✅ Yes | SSH username on the server (e.g. `root` or `ubuntu`) |
| `STOCK_API_HOST` | ❌ Optional | IP of StockDataCollectionAgent (defaults to `SERVER_IP`) |
| `SORT_API_HOST` | ❌ Optional | IP of SortStockingAgent (defaults to `SERVER_IP`) |
| `NEWS_COLLECTOR_HOST` | ❌ Optional | IP of NewsCollectorAgent (defaults to `SERVER_IP`) |
| `NEWS_ANALYSIS_HOST` | ❌ Optional | IP of NewsAnalysisAgent (defaults to `SERVER_IP`) |

> **If all services run on the same server** (typical setup), you only need `SERVER_IP`. The per-service secrets exist for when you split services across multiple machines in the future.

### Finding Your Tailscale IP
```bash
# Run on your deployment server:
tailscale ip -4
# Output example: 100.115.186.96
# Use this as SERVER_IP in GitHub Secrets
```

## 📁 File Structure

```
StockMarketDashboard/
├── index.html              # Main HTML (all 6 pages)
├── index.css               # Design system (dark theme, glassmorphism)
├── app.js                  # Core logic (API calls, rendering, indicators, charts)
├── config.js               # API endpoint auto-detection
├── Dockerfile              # Nginx container
├── nginx.conf              # Nginx config (caching, security headers, gzip)
├── docker-compose.yml      # Docker orchestration (port 7417)
├── .gitignore
├── README.md
└── .github/workflows/
    └── deploy.yml          # CI/CD pipeline (Tailscale + SSH + Docker)
```

## 🔧 Configuration

### `config.js` — API Host Auto-Detection

The dashboard auto-detects where to find backend services:

| Scenario | Browser sees | APIs called at |
|----------|-------------|----------------|
| Local dev (`localhost:8080`) | `localhost` | `http://localhost:8001`, `:8002`, etc. |
| Deployed (e.g. `100.x.x.x:7417`) | `100.x.x.x` | `http://100.x.x.x:8001`, `:8002`, etc. |
| Custom domain | `stocks.example.com` | `http://stocks.example.com:8001`, etc. |
| CI/CD deployed | N/A | Overwritten with exact IPs from GitHub Secrets |

When deployed via CI/CD, `config.js` is overwritten with the exact service IPs from your GitHub Secrets — no auto-detection needed in production.
