import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const DB_PATH = path.resolve('trading_db.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Channels to scrape
const TARGET_CHANNELS = [
    'GRANMAGOFICIAL', 'crypto_ballena_oficial', 'BinanceKillers', 
    'FatPigSignals', 'Learn2Trade', 'RocketWalletSignals', 
    'CryptoInnerCircle', 'BinanceBoard', 'WhaleSniper', 
    'MundoCryptoOficial', 'Whale_Alert_Signals'
];

async function runScraper() {
    console.log('--- INICIANDO SCRAPER AUTÓNOMO ---');
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    let db = { signals: [], macro: {}, whales: [], liquids: [], history: [] };
    if (fs.existsSync(DB_PATH)) {
        try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); } catch(e) {}
    }

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...');

        // 1. Scraping Macro (Simplificado para el script)
        console.log('[1/4] Scraping Macro...');
        await page.goto('https://coinmarketcap.com/', { waitUntil: 'domcontentloaded' });
        const stats = await page.evaluate(() => {
            const header = document.querySelector('.global-stats')?.innerText || '';
            const btcMatch = header.match(/BTC:\s*([\d.]+%)/);
            return { btcd: btcMatch ? btcMatch[1] : '---', lastUpdate: Date.now() };
        });
        db.macro = { ...db.macro, ...stats };

        // 2. Scraping Telegram Channels
        console.log('[2/4] Scraping Telegram...');
        let allSignals = [];
        for (const channel of TARGET_CHANNELS) {
            try {
                await page.goto(`https://t.me/s/${channel}`, { waitUntil: 'domcontentloaded' });
                const channelSignals = await page.evaluate((name) => {
                    return Array.from(document.querySelectorAll('.tgme_widget_message_wrap')).slice(-5).map(msg => ({
                        source: name,
                        text: msg.querySelector('.tgme_widget_message_text')?.innerText || '',
                        date: msg.querySelector('.time')?.innerText || '',
                        type: 'INFO'
                    }));
                }, channel);
                allSignals.push(...channelSignals);
            } catch(e) {}
        }
        db.signals = allSignals;

        // 3. AI Analysis (Guardar en DB para modo estático)
        if (genAI) {
            console.log('[3/4] Generando Análisis IA Deep Reasoning...');
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const recentText = db.signals.slice(-15).map(s => `[${s.source}] ${s.text}`).join('\n');
            const prompt = `Analiza trading. Señales:\n${recentText}\nMacro: ${db.macro.btcd}\nResponde SOLO JSON: { "recommendation": "...", "reasoning": "...", "confidence": 0 }`;
            
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().replace(/```json|```/g, '').trim();
            db.ai_analysis = JSON.parse(responseText);
            console.log('Análisis IA guardado en base de datos.');
        }

        // 4. Guardar y Salir
        console.log('[4/4] Guardando resultados...');
        db.history.push({ timestamp: Date.now(), data: allSignals.length, btcd: db.macro.btcd });
        if (db.history.length > 50) db.history.shift();
        
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        console.log('--- SCRAPER FINALIZADO EXITOSAMENTE ---');

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await browser.close();
        process.exit();
    }
}

runScraper();
