import { defineConfig } from 'vite';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = path.resolve('trading_db.json');
let db = { signals: [], macro: {}, whales: [], liquids: [], history: [] };
if (fs.existsSync(DB_PATH)) {
    try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); } catch(e) {}
}

let cachedSignals = { data: db.signals || [], lastUpdate: Date.now() };
let cachedMacro = db.macro || { btcd: '---', usdtd: '---', spx: '---', lastUpdate: null };
let cachedWhales = db.whales || [];
let cachedLiquids = db.liquids || [];
let scoreHistory = db.history || [];
let isScraping = false;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

function saveDB() {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        signals: cachedSignals.data,
        macro: cachedMacro,
        whales: cachedWhales,
        liquids: cachedLiquids,
        history: scoreHistory
    }));
}

const TARGET_CHANNELS = [
    'GRANMAGOFICIAL',
    'crypto_ballena_oficial',
    'BinanceKillers',
    'FatPigSignals',
    'Learn2Trade',
    'RocketWalletSignals',
    'CryptoInnerCircle',
    'BinanceBoard',
    'WhaleSniper',
    'MundoCryptoOficial',
    'Whale_Alert_Signals'
];

async function scrapeMacro(browser) {
    const page = await browser.newPage();
    try {
        // Global Crypto Stats (CoinMarketCap)
        await page.goto('https://coinmarketcap.com/', { waitUntil: 'networkidle2', timeout: 20000 });
        const stats = await page.evaluate(() => {
            const header = document.querySelector('.global-stats')?.innerText || '';
            const btcMatch = header.match(/BTC:\s*([\d.]+%)/);
            const usdtMatch = header.match(/USDT:\s*([\d.]+%)/) || header.match(/Others?:\s*([\d.]+%)/);
            return {
                btcd: btcMatch ? btcMatch[1] : '---',
                usdtd: usdtMatch ? usdtMatch[1] : '---'
            };
        });

        // Yahoo Finance - S&P 500
        await page.goto('https://finance.yahoo.com/quote/%5EGSPC/', { waitUntil: 'networkidle2', timeout: 15000 });
        const spx = await page.evaluate(() => document.querySelector('[data-field="regularMarketPrice"]')?.innerText || '---');

        cachedMacro = { ...stats, spx, lastUpdate: Date.now() };
        console.log('[Scraper] Dominancias actualizadas:', cachedMacro);
    } catch (e) {
        console.error('[Scraper] Error en Macro:', e.message);
    } finally {
        await page.close();
    }
}

async function scrapeSignals() {
    if (isScraping) return;
    isScraping = true;
    
    console.log('[Scraper] Iniciando captura de señales...');
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const signals = [];

    try {
        await scrapeMacro(browser);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        for (const channel of TARGET_CHANNELS) {
            try {
                await page.goto(`https://t.me/s/${channel}`, { waitUntil: 'networkidle2', timeout: 15000 });
                const channelSignals = await page.evaluate((name) => {
                    const messages = Array.from(document.querySelectorAll('.tgme_widget_message_wrap')).slice(-5);
                    return messages.map(msg => {
                        const text = msg.querySelector('.tgme_widget_message_text')?.innerText || '';
                        const date = msg.querySelector('.time')?.innerText || '';
                        let type = 'INFO';
                        if (text.toUpperCase().includes('LONG') || text.includes('🟢') || text.includes('BUY')) type = 'LONG';
                        if (text.toUpperCase().includes('SHORT') || text.includes('🔴') || text.includes('SELL')) type = 'SHORT';
                        
                        return { source: name, text: text.substring(0, 200) + '...', date, type };
                    });
                }, channel);
                signals.push(...channelSignals);
            } catch (e) {
                console.error(`[Scraper] Error en canal ${channel}:`, e.message);
            }
        }

        // YouTube - Gran Mago
        try {
            await page.goto('https://www.youtube.com/@GranmagoBTC/videos', { waitUntil: 'networkidle2' });
            const ytSignals = await page.evaluate(() => {
                const videos = Array.from(document.querySelectorAll('#video-title')).slice(0, 3);
                return videos.map(v => ({
                    source: 'YouTube: Gran Mago',
                    text: v.innerText,
                    date: 'Reciente',
                    type: v.innerText.toUpperCase().includes('COMPRA') ? 'LONG' : (v.innerText.toUpperCase().includes('VENTA') ? 'SHORT' : 'INFO')
                }));
            });
            signals.push(...ytSignals);
        } catch (e) {
            console.error('[Scraper] Error en YouTube:', e.message);
        }

        // Noticias - CoinTelegraph
        try {
            await page.goto('https://cointelegraph.com/tags/bitcoin', { waitUntil: 'networkidle2', timeout: 15000 });
            const ctNews = await page.evaluate(() => {
                const articles = Array.from(document.querySelectorAll('.post-card-inline__title')).slice(0, 3);
                return articles.map(a => ({ source: 'CoinTelegraph', text: a.innerText, date: 'Hoy', type: 'NEWS' }));
            });
            signals.push(...ctNews);
        } catch (e) { console.error('[Scraper] Error en CoinTelegraph:', e.message); }

        // Noticias - CryptoPanic (Agregador)
        try {
            await page.goto('https://cryptopanic.com/', { waitUntil: 'networkidle2', timeout: 15000 });
            const cpNews = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('.news-title')).slice(0, 5);
                return rows.map(r => ({ source: 'CryptoPanic', text: r.innerText, date: 'Ahora', type: 'IMPORTANT_NEWS' }));
            });
            signals.push(...cpNews);
        } catch (e) { console.error('[Scraper] Error en CryptoPanic:', e.message); }

        // Noticias - The Block (Institucional)
        try {
            await page.goto('https://www.theblock.co/latest', { waitUntil: 'networkidle2', timeout: 15000 });
            const tbNews = await page.evaluate(() => {
                const titles = Array.from(document.querySelectorAll('.card .title')).slice(0, 3);
                return titles.map(t => ({ source: 'The Block', text: t.innerText, date: 'Hoy', type: 'INSTITUTIONAL' }));
            });
            signals.push(...tbNews);
        } catch (e) { console.error('[Scraper] Error en The Block:', e.message); }

        // Trump - Truth Social
        try {
            await page.goto('https://truthsocial.com/@realDonaldTrump', { waitUntil: 'networkidle2', timeout: 20000 });
            const truths = await page.evaluate(() => {
                const posts = Array.from(document.querySelectorAll('[data-testid="status"]')).slice(0, 3);
                return posts.map(p => {
                    const text = p.querySelector('.status__content text')?.innerText || p.innerText.substring(0, 200);
                    return { source: 'Donald Trump (Truth Social)', text: text, date: 'Reciente', type: 'TRUMP_SIGNAL' };
                });
            });
            signals.push(...truths);
        } catch (e) { console.error('[Scraper] Error en Truth Social:', e.message); }

        // --- WHALE ALERTS ---
        try {
            await page.goto('https://t.me/s/Whale_Alert_Signals', { waitUntil: 'networkidle2', timeout: 15000 });
            cachedWhales = await page.evaluate(() => {
                const logs = Array.from(document.querySelectorAll('.tgme_widget_message_wrap')).slice(-10);
                return logs.map(msg => ({
                    text: msg.querySelector('.tgme_widget_message_text')?.innerText || '',
                    date: msg.querySelector('.time')?.innerText || 'Reciente'
                }));
            });
            console.log(`[Scraper] Ballenas capturadas: ${cachedWhales.length}`);
        } catch (e) { console.error('[Scraper] Error en Ballenas:', e.message); }

        // --- LIQUIDACIONES ---
        try {
            await page.goto('https://www.coinglass.com/LiquidationData', { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('.ant-table-wrapper', { timeout: 10000 }).catch(() => {});
            cachedLiquids = await page.evaluate(() => {
                const cells = Array.from(document.querySelectorAll('.ant-table-cell')).slice(0, 30);
                // Grouping cells into rows of context
                const results = [];
                for(let i=0; i<cells.length; i+=5) {
                    const txt = cells.slice(i, i+5).map(c => c.innerText).join(' ');
                    if (txt.trim()) results.push({ text: txt, date: 'Ahora' });
                }
                return results;
            });
            console.log(`[Scraper] Liquidaciones capturadas: ${cachedLiquids.length}`);
        } catch (e) { console.error('[Scraper] Error en Liquidaciones:', e.message); }

        // Finalizing scrape session
        cachedSignals = { 
            data: signals.sort((a, b) => b.type === 'TOKEN_UNLOCK' ? 1 : -1),
            lastUpdate: Date.now() 
        };
        // Record Trend History
        scoreHistory.push({
            timestamp: Date.now(),
            data: cachedSignals.data.length,
            btcd: cachedMacro.btcd
        });
        if (scoreHistory.length > 50) scoreHistory.shift(); // Keep last 50 data points
        
        saveDB(); // Persist to disk

        console.log(`[Scraper] Éxito: ${cachedSignals.data.length} señales capturadas.`);

        // --- ALERTA INTELIGENTE AUTOMÁTICA ---
        const top = ['BTC', 'ETH', 'HYPE'];
        for (const coin of top) {
            const coinSignals = cachedSignals.data.filter(s => s.text.toUpperCase().includes(coin));
            const score = (coinSignals.filter(s => s.type === 'LONG').length * 15) - (coinSignals.filter(s => s.type === 'SHORT').length * 15);
            
            if (Math.abs(score) >= 30) {
                const type = score > 0 ? '🚀 STRONG LONG' : '📉 STRONG SHORT';
                const msg = `*${type} DETECTADO: ${coin}*\n\n` +
                            `• Confianza: ${Math.abs(score)}%\n` +
                            `• Confluencias: ${coinSignals.length} señales\n` +
                            `• Macro: ${parseFloat(cachedMacro.usdtd) > 6 ? '⚠️ Fuga a Stables' : '✅ Flujo saludable'}\n\n` +
                            `_Consulta tu Terminal IA para ver el TP/SL completo._`;
                sendTelegramAlert(msg);
            }
        }
    } catch (err) {
        console.error('[Scraper] Error global:', err.message);
    } finally {
        await browser.close();
        isScraping = false;
    }
}

// Scrape inicial y cada 30 min
scrapeSignals();
setInterval(scrapeSignals, 30 * 60 * 1000);

async function sendTelegramAlert(message) {
    const BOT_TOKEN = '8604385124:AAGlvDKzevBbDlwJI4vQQTt61jKO8KHI_Go';
    const CHAT_ID = '1513024392';
    if (CHAT_ID === 'TU_ID_AQUÍ') return;

    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' })
        });
        console.log('[Telegram] Alerta enviada con éxito.');
    } catch (e) {
        console.error('[Telegram] Error enviando alerta:', e.message);
    }
}

// Test manual para el usuario
sendTelegramAlert(`*🔔 PRUEBA DE SEÑAL IA*\n\n` +
                 `🚀 *LONG*: BITCOIN (BTC)\n` +
                 `• Precio: $72,214.50\n` +
                 `• TP: $75,800.00\n` +
                 `• SL: $70,500.00\n\n` +
                 `_Análisis: Confluencia de 12 canales de Telegram y DXY debilitándose._`);

export default defineConfig({
    plugins: [{
        name: 'signals-api',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                if (req.url === '/api/signals') {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(cachedSignals));
                } else if (req.url === '/api/macro') {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(cachedMacro));
                } else if (req.url === '/api/whales') {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(cachedWhales));
                } else if (req.url === '/api/liquidations') {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(cachedLiquids));
                } else if (req.url === '/api/trends') {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(scoreHistory));
                } else if (req.url === '/api/ai-analysis') {
                    res.setHeader('Content-Type', 'application/json');
                    if (!genAI) {
                        res.end(JSON.stringify({ recommendation: 'CONFIGURAR API KEY', reasoning: 'Falta GEMINI_API_KEY en .env', confidence: 0 }));
                        return;
                    }
                    
                    const runAI = async () => {
                        try {
                            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                            const recentSignals = (cachedSignals.data || []).slice(-15).map(s => `[${s.source}] ${s.text}`).join('\n');
                            const prompt = `
                                Analiza como experto trading:
                                
                                SEÑALES:
                                ${recentSignals}
                                
                                MACRO (BTC Dom): ${cachedMacro.btcd}
                                
                                TAREA:
                                1. RECOMENDACIÓN FINAL (STRONG LONG, LONG, NEUTRAL, SHORT, STRONG SHORT).
                                2. RAZONAMIENTO breve (max 3 frases).
                                3. CONFIANZA (0-99).
                                
                                Responde SOLO JSON: { "recommendation": "...", "reasoning": "...", "confidence": 0 }
                            `;
                            const result = await model.generateContent(prompt);
                            const responseText = result.response.text().replace(/```json|```/g, '').trim();
                            res.end(responseText);
                        } catch (e) {
                            res.end(JSON.stringify({ recommendation: 'ERROR IA', reasoning: e.message, confidence: 0 }));
                        }
                    };
                    runAI();
                } else {
                    next();
                }
            });
        }
    }]
});
