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
    
    // Safety delay to ensure TV script is ready
    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "autosize": true,
            "symbol": `BINANCE:${symbol}`,
            "interval": "D",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "es",
            "container_id": "tradingview_widget"
        });
    } else {
        setTimeout(() => initTVWidget(symbol), 500);
    }
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

// The "Brain" of the App
async function updateAIDecision() {
    if (!currentSignals.length) return;

    let longs = currentSignals.filter(s => s.type === 'LONG').length;
    let shorts = currentSignals.filter(s => s.type === 'SHORT').length;
    let newsScore = 0;
    let sellTheNewsRisk = false;
    let unlockRisk = false;
    let macroPenalty = 0;

    // Macro Influencers (Money Flow)
    const btcdVal = parseFloat(currentMacro.btcd);
    const usdtVal = parseFloat(currentMacro.usdtd);
    
    if (usdtVal > 6) macroPenalty -= 15; // High stablecoin hoarding = Fear
    if (btcdVal > 55) macroPenalty -= 5; // Too much BTC dominance is bad for Alts
    
    // Fear & Greed Factor
    const fngVal = parseInt(document.getElementById('fear-greed-val').innerText);
    if (!isNaN(fngVal)) {
        if (fngVal > 80) macroPenalty -= 5; // To much greed
        if (fngVal < 25) macroPenalty += 10; // Extreme fear (opportunity)
    }

    // Check Token Unlocks
    const currentTicker = currentSymbol.replace('USDT', '');
    currentSignals.filter(s => s.type === 'TOKEN_UNLOCK').forEach(u => {
        if (u.text.toUpperCase().includes(currentTicker)) {
            unlockRisk = true;
            newsScore -= 20;
        }
    });
    
    // News Analysis
    currentSignals.forEach(s => {
        const text = s.text.toUpperCase();
        let weight = 0;
        if (s.type === 'TRUMP_SIGNAL') weight = 15;
        if (s.type === 'INSTITUTIONAL') weight = 12;
        if (s.type === 'IMPORTANT_NEWS') weight = 8;
        
        if (text.includes('BITCOIN') || text.includes('BULLISH') || text.includes('BUY')) newsScore += weight;
        if (text.includes('SEC') || text.includes('BEARISH') || text.includes('FUD')) newsScore -= weight;
    });

    try {
        const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${currentSymbol}`);
        const ticker = await tickerRes.json();
        const priceChange = parseFloat(ticker.priceChangePercent);
        if (newsScore > 20 && priceChange > 10) sellTheNewsRisk = true;
    } catch(e) {}

    let confidence = 50 + (longs * 5) - (shorts * 5) + newsScore + macroPenalty;
    let recommendation = 'NEUTRAL';
    
    if (confidence > 65) recommendation = confidence > 85 ? 'STRONG LONG' : 'LONG';
    else if (confidence < 35) recommendation = confidence < 15 ? 'STRONG SHORT' : 'SHORT';

    if (sellTheNewsRisk && recommendation.includes('LONG')) recommendation += ' (RISK: NEWS)';
    if (unlockRisk) recommendation = 'CAUTION: UNLOCK';

    let displayConfidence = Math.min(99, Math.abs(confidence));
    finalRecEl.innerText = recommendation;
    finalRecEl.className = 'signal-value ' + (recommendation.includes('LONG') ? 'buy' : (recommendation.includes('SHORT') || recommendation.includes('CAUTION') ? 'sell' : ''));
    
    confProgress.style.width = `${displayConfidence}%`;
    confProgress.style.background = recommendation.includes('LONG') ? 'var(--success)' : 'var(--danger)';
    confText.innerText = `IA (Sentiment: ${fngVal || '--'}, Macro: ${macroPenalty < 0 ? 'Negative' : 'Neutral'}): ${displayConfidence}%`;
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
    } catch(e) { console.error('Error Liquids:', e); }
}

async function refreshTrends() {
    try {
        const res = await fetch('/api/trends');
        const history = await res.json();
        const container = document.getElementById('trend-chart-container');
        
        if (!history || !history.length) {
            container.innerHTML = '<div class="text-muted">Esperando datos para generar tendencia...</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="trend-bars" style="display: flex; align-items: flex-end; gap: 10px; height: 200px; width: 100%; padding: 20px;">
                ${history.map(h => `
                    <div class="trend-bar" style="height: ${Math.max(10, h.data * 2)}px; width: 25px; background: var(--primary); border-radius: 4px; position: relative;" title="Señales: ${h.data}">
                        <span style="position: absolute; top: -20px; font-size: 10px; width: 100%; text-align: center;">${h.data}</span>
                    </div>
                `).join('')}
            </div>
            <div class="text-muted" style="font-size: 0.8rem; margin-top: 10px;">Confianza Algorítmica (Últimos ${history.length} escaneos)</div>
        `;
    } catch(e) { console.error('Error Trends:', e); }
}
