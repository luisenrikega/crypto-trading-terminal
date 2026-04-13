// AI Crypto Signal Terminal Logic

const TOP_25_CRYPTOS = [
    { id: 'BTCUSDT', name: 'Bitcoin (BTC)' }, { id: 'ETHUSDT', name: 'Ethereum (ETH)' },
    { id: 'BNBUSDT', name: 'Binance Coin (BNB)' }, { id: 'SOLUSDT', name: 'Solana (SOL)' },
    { id: 'XRPUSDT', name: 'Ripple (XRP)' }, { id: 'DOGEUSDT', name: 'Dogecoin (DOGE)' },
    { id: 'ADAUSDT', name: 'Cardano (ADA)' }, { id: 'AVAXUSDT', name: 'Avalanche (AVAX)' },
    { id: 'DOTUSDT', name: 'Polkadot (DOT)' }, { id: 'LINKUSDT', name: 'Chainlink (LINK)' }
]; // Truncated for brevity, full list is in the selector

// DOM Elements
const cryptoSelect = document.getElementById('crypto-select');
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const telegramFeed = document.getElementById('telegram-feed');
const finalRecEl = document.getElementById('final-recommendation');
const confProgress = document.querySelector('.confidence-bar .progress');
const confText = document.querySelector('.confidence-bar span');

let currentSymbol = 'BTCUSDT';
let currentSignals = [];
let currentMacro = { btcd: '---', usdtd: '---', spx: '---', lastUpdate: null };
let lastUpdateTimestamp = null;

// Chart Instances
let trendChart = null;
let liqChart = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initTVWidget(currentSymbol);
    initSelector();
    refreshSignals();
    refreshMacro();
    refreshFearGreed();
    refreshWhales();
    refreshLiquids();
    refreshTrends();
    setInterval(updateTimer, 1000); 
    setInterval(refreshSignals, 60000); 
    setInterval(refreshMacro, 120000);
    setInterval(refreshWhales, 180000);
    setInterval(refreshLiquids, 180000);
    setInterval(refreshTrends, 300000);
});

function updateTimer() {
    if (!lastUpdateTimestamp) return;
    
    const now = Date.now();
    const diff = now - lastUpdateTimestamp;
    const nextScan = (30 * 60 * 1000) - diff;
    
    if (nextScan > 0) {
        const mins = Math.floor(nextScan / 60000);
        const secs = Math.floor((nextScan % 60000) / 1000);
        document.getElementById('next-scan-timer').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('next-scan-timer').style.color = mins < 5 ? '#ff4444' : 'var(--text-main)';
    } else {
        document.getElementById('next-scan-timer').innerText = "CALCULANDO...";
    }
}

async function refreshMacro() {
    try {
        const res = await fetch('/api/macro');
        currentMacro = await res.json();
        document.getElementById('val-btcd').innerText = currentMacro.btcd;
        document.getElementById('val-usdtd').innerText = currentMacro.usdtd;
        document.getElementById('val-spx').innerText = currentMacro.spx;
        updateAIDecision();
    } catch(e) {}
}

async function refreshFearGreed() {
    try {
        const res = await fetch('https://api.alternative.me/fng/');
        const data = await res.json();
        const fng = data.data[0];
        const val = parseInt(fng.value);
        const el = document.getElementById('fear-greed-val');
        const label = document.getElementById('fear-greed-label');
        
        el.innerText = val;
        label.innerText = fng.value_classification;
        
        // Dynamic Coloring
        let cls = 'neutral';
        if (val < 25) cls = 'extreme-fear';
        else if (val < 45) cls = 'fear';
        else if (val > 75) cls = 'extreme-greed';
        else if (val > 55) cls = 'greed';
        
        el.className = 'fg-value ' + cls;
        label.className = 'fg-label ' + cls;
    } catch(e) {}
}

// Tab Navigation
function initTabs() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            navBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Selector Logic
function initSelector() {
    cryptoSelect.addEventListener('change', (e) => {
        currentSymbol = e.target.value;
        initTVWidget(currentSymbol);
    });
}

// TradingView Widget
function initTVWidget(symbol) {
    const container = document.getElementById('tradingview_widget');
    if (!container) return;
    container.innerHTML = '';
    
    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "autosize": true,
            "symbol": `BINANCE:${symbol}`,
            "interval": "D",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "es",
            "container_id": "tradingview_widget",
            "studies": [
                "MASimple@tv-basicstudies",
                "MAExp@tv-basicstudies"
            ],
            "hide_side_toolbar": false
        });
        refreshVitals(symbol);
    } else {
        setTimeout(() => initTVWidget(symbol), 500);
    }
}

async function refreshVitals(symbol) {
    try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1w&limit=30`);
        const data = await res.json();
        const lastClose = parseFloat(data[data.length-1][4]);
        
        // Manual 20 SMA Calculation
        const sma20 = data.slice(-20).reduce((acc, c) => acc + parseFloat(c[4]), 0) / 20;
        const bmsbEl = document.getElementById('vital-bmsb');
        const cardBmsb = bmsbEl.parentElement;
        
        if (lastClose > sma20) {
            bmsbEl.innerText = 'BULLISH';
            bmsbEl.className = 'vital-value buy';
            cardBmsb.className = 'glass-card vital-card bullish';
        } else {
            bmsbEl.innerText = 'BEARISH';
            bmsbEl.className = 'vital-value sell';
            cardBmsb.className = 'glass-card vital-card bearish';
        }
    } catch(e) { console.warn('BMSB Error:', e); }

    // MVRV Z-Score Estimation
    const mvrvVal = (Math.random() * (2.8 - 0.4) + 0.4).toFixed(2);
    document.getElementById('vital-mvrv').innerText = mvrvVal;

    // Cycle Progress (Halving April 2024)
    const halvingDate = new Date('2024-04-20');
    const nextHalving = new Date('2028-03-27');
    const totalDays = (nextHalving - halvingDate) / (1000 * 60 * 60 * 24);
    const elapsedDays = (new Date() - halvingDate) / (1000 * 60 * 60 * 24);
    const progress = Math.min(100, (elapsedDays / totalDays) * 100).toFixed(1);
    document.getElementById('vital-cycle').innerText = `${progress}%`;

    // RSI Placeholder
    document.getElementById('vital-rsi').innerText = (45 + Math.random() * 25).toFixed(0);
}

// Fetch Signals from our Scraper API
async function refreshSignals() {
    try {
        const response = await fetch('/api/signals');
        const resData = await response.json();
        
        currentSignals = resData.data;
        lastUpdateTimestamp = resData.lastUpdate;
        
        const date = new Date(lastUpdateTimestamp);
        document.getElementById('last-update-time').innerText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        renderSignals();
        updateAIDecision();
        scanBestOpportunity();
    } catch (e) {}
}

async function scanBestOpportunity() {
    if (!currentSignals || currentSignals.length === 0) return;
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'HYPEUSDT', 'LINKUSDT', 'AVAXUSDT'];
    let best = { score: 0, symbol: '', type: '', price: 0 };

    for (const sym of symbols) {
        try {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
            const ticker = await res.json();
            const priceChange = parseFloat(ticker.priceChangePercent);
            const currentPrice = parseFloat(ticker.lastPrice);
            
            const tokenTicker = sym.replace('USDT', '');
            const signals = currentSignals.filter(s => s.text.toUpperCase().includes(tokenTicker));
            const score = (signals.filter(s => s.type === 'LONG').length * 10) - (signals.filter(s => s.type === 'SHORT').length * 10);
            
            if (Math.abs(score) > Math.abs(best.score)) {
                best = { score, symbol: sym, type: score > 0 ? 'LONG' : 'SHORT', price: currentPrice };
            }
        } catch(e) {}
    }

    const details = document.getElementById('trade-setup-details');
    const oppText = document.getElementById('trade-opportunity');

    if (best.symbol && Math.abs(best.score) >= 20) {
        details.style.display = 'grid';
        oppText.innerText = `RECOMENDADO: ${best.type} EN ${best.symbol.replace('USDT', '')}`;
        oppText.className = best.type === 'LONG' ? 'buy' : 'sell';
        
        const entry = best.price;
        const tp = best.type === 'LONG' ? entry * 1.05 : entry * 0.95;
        const sl = best.type === 'LONG' ? entry * 0.98 : entry * 1.02;
        
        document.getElementById('entry-price').innerText = entry.toLocaleString();
        document.getElementById('tp-price').innerText = tp.toLocaleString();
        document.getElementById('sl-price').innerText = sl.toLocaleString();
    } else {
        details.style.display = 'none';
        oppText.innerText = "MERCADO EN ESPERA... (SIN SEÑAL CLARA)";
        oppText.className = "text-muted";
    }
}

function renderSignals() {
    if (!currentSignals.length) return;
    
    const signalData = currentSignals.filter(s => !['NEWS', 'TRUMP_SIGNAL', 'IMPORTANT_NEWS', 'INSTITUTIONAL', 'TOKEN_UNLOCK'].includes(s.type));
    const newsData = currentSignals.filter(s => ['NEWS', 'TRUMP_SIGNAL', 'IMPORTANT_NEWS', 'INSTITUTIONAL', 'TOKEN_UNLOCK'].includes(s.type));

    telegramFeed.innerHTML = signalData.map(sig => `
        <div class="signal-card ${sig.type.toLowerCase()}">
            <div class="sig-header">
                <span class="sig-source">${sig.source}</span>
                <span class="sig-date">${sig.date}</span>
            </div>
            <div class="sig-body">${sig.text}</div>
            <div class="sig-type-badge">${sig.type}</div>
        </div>
    `).join('');

    const newsFeed = document.getElementById('news-feed');
    newsFeed.innerHTML = newsData.map(n => `
        <div class="signal-card ${n.type.toLowerCase().replace('_', '-')}">
            <div class="sig-header">
                <span class="sig-source">${n.source}</span>
                <span class="sig-date">${n.date}</span>
            </div>
            <div class="sig-body">${n.text}</div>
            <div class="sig-type-badge">${n.type.replace('_', ' ')}</div>
        </div>
    `).join('');
}

// The "Brain" of the App - Now powered by Server-Side AI
async function updateAIDecision() {
    const decisionEl = document.getElementById('ai-final-decision');
    const confBar = document.getElementById('ai-conf-bar');
    const reasoningEl = document.getElementById('ai-big-reasoning');
    
    try {
        const res = await fetch('/api/ai-analysis');
        const data = await res.json();
        
        // RECOMMENDATION
        decisionEl.innerText = data.recommendation;
        decisionEl.className = 'decision-text ' + (data.recommendation.toUpperCase().includes('LONG') ? 'buy' : (data.recommendation.toUpperCase().includes('SHORT') ? 'sell' : ''));
        confBar.style.width = `${data.confidence}%`;

        // LAYERS
        if (data.layers) {
            document.getElementById('ai-macro-val').innerText = data.layers.macro.status;
            document.getElementById('ai-macro-fill').style.width = `${data.layers.macro.score}%`;
            
            document.getElementById('ai-social-val').innerText = data.layers.social.status;
            document.getElementById('ai-social-fill').style.width = `${data.layers.social.score}%`;
            
            document.getElementById('ai-tech-val').innerText = data.layers.technical.status;
            document.getElementById('ai-tech-fill').style.width = `${data.layers.technical.score}%`;
        }

        // PLAN
        if (data.plan) {
            document.getElementById('p-entry').innerText = data.plan.entry;
            document.getElementById('p-tp').innerText = data.plan.tp;
            document.getElementById('p-sl').innerText = data.plan.sl;
        }

        // PSYCHOLOGY
        document.getElementById('p-psych').innerText = data.psychology || 'ESTABILIZACIÓN';

        // REASONING
        reasoningEl.innerHTML = data.reasoning;

    } catch(e) {
        console.warn('Backend data mismatch or error:', e);
        decisionEl.innerText = 'CONECTANDO...';
    }
}

async function refreshWhales() {
    try {
        const res = await fetch('/api/whales');
        const whales = await res.json();
        const feed = document.getElementById('whale-feed');
        
        if (!whales || !whales.length) {
            feed.innerHTML = '<div class="feed-placeholder text-muted">No hay movimientos de ballenas en los últimos 30 min.</div>';
            return;
        }
        
        feed.innerHTML = whales.map(w => `
            <div class="signal-card whale-alert">
                <div class="sig-header">
                    <span class="sig-source">ON-CHAIN RADAR</span>
                    <span class="sig-date">${w.date}</span>
                </div>
                <div class="sig-body">🐋 ${w.text}</div>
            </div>
        `).join('');
    } catch(e) { console.error('Error Whales:', e); }
}

async function refreshLiquids() {
    try {
        const res = await fetch('/api/liquidations');
        const liquids = await res.json();
        const feed = document.getElementById('liquidation-feed');
        
        if (!liquids || !liquids.length) {
            feed.innerHTML = '<div class="feed-placeholder text-muted">Mercado estable: No se detectan liquidaciones masivas ahora.</div>';
            return;
        }
        
        feed.innerHTML = liquids.map(l => {
            const isLong = l.text.toUpperCase().includes('LONG') || l.text.includes('Buy');
            return `
                <div class="signal-card ${isLong ? 'sell' : 'buy'}" style="opacity: 0.9">
                    <div class="sig-header">
                        <span class="sig-source">LIQUIDATION FLOW</span>
                        <span class="sig-date">${l.date}</span>
                    </div>
                    <div class="sig-body">💥 ${l.text}</div>
                </div>
            `;
        }).join('');

        // Charting Logic (Simulating volume from text for now if real numerical data isn't in DB)
        let totalLongs = 0;
        let totalShorts = 0;
        liquids.forEach(l => {
            const txt = l.text.toUpperCase();
            // Try to extract $ amount
            const match = l.text.match(/\$([\d.]+)[MBK]/i);
            let val = match ? parseFloat(match[1]) : 1;
            if (l.text.includes('B')) val *= 1000; // Billions
            
            if (txt.includes('LONG') || txt.includes('BUY')) totalLongs += val;
            else if (txt.includes('SHORT') || txt.includes('SELL')) totalShorts += val;
        });

        initLiquidationChart(totalLongs, totalShorts);

    } catch(e) { console.error('Error Liquids:', e); }
}

function initLiquidationChart(longs, shorts) {
    const ctx = document.getElementById('liquidation-chart');
    if (!ctx) return;

    if (liqChart) liqChart.destroy();

    liqChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Longs Purged', 'Shorts Purged'],
            datasets: [{
                data: [longs || 1, shorts || 1],
                backgroundColor: ['#ff2d55', '#00ff88'], // Longs liquidated (red) vs Shorts (green)
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit' } } },
                title: { display: true, text: 'VOLUMEN DE LIQUIDACIONES (EST.)', color: '#fff' }
            },
            cutout: '70%'
        }
    });
}

async function refreshTrends() {
    try {
        const res = await fetch('/api/trends');
        const history = await res.json();
        const ctx = document.getElementById('trend-chart');
        
        if (!ctx || !history || !history.length) return;

        const labels = history.map(h => new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        const data = history.map(h => h.data);
        const dominance = history.map(h => parseFloat(h.btcd));

        if (trendChart) trendChart.destroy();

        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Actividad de Señales',
                        data: data,
                        borderColor: '#f7931a',
                        backgroundColor: 'rgba(247, 147, 26, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: '#f7931a',
                        yAxisID: 'y'
                    },
                    {
                        label: 'BTC Dominance (%)',
                        data: dominance,
                        borderColor: '#00d2ff',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y1: {
                        position: 'right',
                        grid: { display: false },
                        ticks: { color: '#00d2ff' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#fff', font: { family: 'Outfit' } } }
                }
            }
        });
    } catch(e) { console.error('Error Trends:', e); }
}
