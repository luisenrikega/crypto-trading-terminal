import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5175;
const DB_PATH = path.join(__dirname, 'trading_db.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// --- DATABASE LOGIC ---
let db = { signals: [], macro: {}, whales: [], liquids: [], history: [] };
function loadDB() {
    if (fs.existsSync(DB_PATH)) {
        try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); } catch(e) {}
    }
}
function saveDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify(db));
}
loadDB();

// --- SCRAPER LOGIC ---
const TARGET_CHANNELS = [
    'GRANMAGOFICIAL', 'crypto_ballena_oficial', 'BinanceKillers', 
    'FatPigSignals', 'Learn2Trade', 'RocketWalletSignals', 
    'CryptoInnerCircle', 'BinanceBoard', 'WhaleSniper', 
    'MundoCryptoOficial', 'Whale_Alert_Signals'
];

let isScraping = false;

async function scrapeMacro(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    try {
        await page.goto('https://coinmarketcap.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        const stats = await page.evaluate(() => {
            const header = document.querySelector('.global-stats')?.innerText || '';
            const btcMatch = header.match(/BTC:\s*([\d.]+%)/);
            const usdtMatch = header.match(/USDT:\s*([\d.]+%)/) || header.match(/Others?:\s*([\d.]+%)/);
            return { btcd: btcMatch ? btcMatch[1] : '---', usdtd: usdtMatch ? usdtMatch[1] : '---' };
        });
        await page.goto('https://finance.yahoo.com/quote/%5EGSPC/', { waitUntil: 'networkidle2', timeout: 30000 });
        const spx = await page.evaluate(() => document.querySelector('[data-field="regularMarketPrice"]')?.innerText || '---');
        db.macro = { ...stats, spx, lastUpdate: Date.now() };
    } catch (e) { console.error('[Scraper] Error Macro:', e.message); }
    finally { await page.close(); }
}

async function scrapeSignals() {
    if (isScraping) return;
    isScraping = true;
    console.log('[Scraper] Iniciando escaneo autónomo...');
    
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        await scrapeMacro(browser);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        let allSignals = [];
        for (const channel of TARGET_CHANNELS) {
            try {
                await page.goto(`https://t.me/s/${channel}`, { waitUntil: 'networkidle2', timeout: 20000 });
                const channelSignals = await page.evaluate((name) => {
                    const messages = Array.from(document.querySelectorAll('.tgme_widget_message_wrap')).slice(-5);
                    return messages.map(msg => {
                        const text = msg.querySelector('.tgme_widget_message_text')?.innerText || '';
                        const date = msg.querySelector('.time')?.innerText || '';
                        let type = 'INFO';
                        if (text.toUpperCase().includes('LONG') || text.includes('🟢')) type = 'LONG';
                        if (text.toUpperCase().includes('SHORT') || text.includes('🔴')) type = 'SHORT';
                        return { source: name, text, date, type };
                    });
                }, channel);
                allSignals.push(...channelSignals);
            } catch (e) {}
        }

        // Whale Alert
        try {
            await page.goto('https://t.me/s/Whale_Alert_Signals', { waitUntil: 'networkidle2', timeout: 20000 });
            db.whales = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.tgme_widget_message_wrap')).slice(-10).map(msg => ({
                    text: msg.querySelector('.tgme_widget_message_text')?.innerText || '',
                    date: msg.querySelector('.time')?.innerText || 'Reciente'
                }));
            });
        } catch (e) {}

        // Liquidations
        try {
            await page.goto('https://www.coinglass.com/LiquidationData', { waitUntil: 'networkidle2', timeout: 40000 });
            db.liquids = await page.evaluate(() => {
                const cells = Array.from(document.querySelectorAll('.ant-table-cell')).slice(0, 30);
                const res = [];
                for(let i=0; i<cells.length; i+=5) {
                    const txt = cells.slice(i, i+5).map(c => c.innerText).join(' ');
                    if (txt.trim()) res.push({ text: txt, date: 'Ahora' });
                }
                return res;
            });
        } catch (e) {}

        db.signals = allSignals;
        db.history.push({ timestamp: Date.now(), data: allSignals.length, btcd: db.macro.btcd });
        if (db.history.length > 50) db.history.shift();
        
        saveDB();
        console.log(`[Scraper] Escaneo completado. Señales: ${allSignals.length}`);
        
        checkAlerts(allSignals);

    } catch (err) { console.error('[Scraper] Error Global:', err.message); }
    finally {
        await browser.close();
        isScraping = false;
    }
}

async function checkAlerts(signals) {
    const BOT_TOKEN = '8604385124:AAGlvDKzevBbDlwJI4vQQTt61jKO8KHI_Go';
    const CHAT_ID = '1513024392';
    const top = ['BTC', 'ETH', 'SOL'];

    for (const coin of top) {
        const coinSignals = signals.filter(s => s.text.toUpperCase().includes(coin));
        const score = (coinSignals.filter(s => s.type === 'LONG').length * 15) - (coinSignals.filter(s => s.type === 'SHORT').length * 15);
        
        if (Math.abs(score) >= 30) {
            const type = score > 0 ? '🚀 LONG' : '📉 SHORT';
            const msg = `*ALERTA ONLINE: ${coin}*\nSentido: ${type}\nConfianza: ${Math.abs(score)}%\nMacro: ${db.macro.btcd}`;
            axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown'
            }).catch(e => {});
        }
    }
}

// --- API ENDPOINTS ---
app.get('/api/signals', (req, res) => res.json({ data: db.signals, lastUpdate: db.macro.lastUpdate }));
app.get('/api/macro', (req, res) => res.json(db.macro));
app.get('/api/whales', (req, res) => res.json(db.whales));
app.get('/api/liquidations', (req, res) => res.json(db.liquids));
app.get('/api/trends', (req, res) => res.json(db.history));

app.get('/api/ai-analysis', async (req, res) => {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return res.json({ recommendation: 'LLAVE NO CARGADA', reasoning: 'Falta GEMINI_API_KEY', confidence: 0 });
    }

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
    let lastErr = "";

    for (const m of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1/models/${m}:generateContent?key=${API_KEY}`;
            const recentSignals = db.signals.slice(-15).map(s => `[${s.source}] ${s.text}`).join('\n');
            const promptText = `Analiza trading. Señales: ${recentSignals}\nResponde SOLO JSON: { "recommendation": "...", "reasoning": "...", "confidence": 0 }`;

            const response = await axios.post(url, { contents: [{ parts: [{ text: promptText }] }] });
            const text = response.data.candidates[0].content.parts[0].text;
            return res.json(JSON.parse(text.replace(/```json|```/g, '').trim()));
        } catch (e) {
            lastErr = e.response?.data?.error?.message || e.message;
        }
    }

    res.json({ recommendation: 'ERROR RED', reasoning: 'Bloqueo o Error: ' + lastErr, confidence: 0 });
});

app.get('(.*)', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Timers
scrapeSignals();
setInterval(scrapeSignals, 30 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`\n🚀 SERVIDOR DE PRODUCCIÓN ESM ACTIVO`);
    console.log(`➜ Puerto: ${PORT}`);
});
