#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Nightly & On-Demand Auto-Sync Script for External Archive Repository
 * - SuperEnalotto (6/90 + Jolly + SuperStar) -> data/superenalotto.json
 * - Win for Italia Team / Win for Life (6/40) -> data/winforitalia.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SUPERENALOTTO_JSON_PATH = path.join(ROOT_DIR, 'data', 'superenalotto.json');
const WINFORITALIA_JSON_PATH = path.join(ROOT_DIR, 'data', 'winforitalia.json');

const SUPERENALOTTO_FEED_URL =
  'https://raw.githubusercontent.com/delpinsky/Superenalotto/main/storico-estrazioni-superenalotto.json';

const IT_MONTHS = {
  gen: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  mag: '05',
  giu: '06',
  lug: '07',
  ago: '08',
  set: '09',
  ott: '10',
  nov: '11',
  dic: '12'
};

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeSuperEnalottoDraw(d) {
  if (!d || typeof d !== 'object') return null;
  const dateStr = String(d.date || d.data || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || dateStr < '2009-01-01') return null;

  const rawNums = Array.isArray(d.numbers)
    ? d.numbers
    : Array.isArray(d.nums)
    ? d.nums
    : Array.isArray(d.sestina)
    ? d.sestina
    : null;
  if (!rawNums || rawNums.length !== 6) return null;

  const nums = rawNums.map(Number).sort((a, b) => a - b);
  if (new Set(nums).size !== 6 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 90)) {
    return null;
  }

  const jolly = Number(d.jolly);
  if (!Number.isInteger(jolly) || jolly < 1 || jolly > 90 || nums.includes(jolly)) return null;

  const rawSs = d.superstar !== undefined ? d.superstar : d.ss;
  let superstar;
  if (rawSs !== undefined && rawSs !== null && String(rawSs).trim() !== '') {
    const ssNum = Number(rawSs);
    if (Number.isInteger(ssNum) && ssNum >= 1 && ssNum <= 90) {
      superstar = ssNum;
    }
  }

  const year = parseInt(dateStr.slice(0, 4), 10);
  let contestNumber = Number(d.contestNumber || d.concorso || 0);
  if (!Number.isInteger(contestNumber) || contestNumber <= 0) {
    if (typeof d.id === 'string' && d.id.includes('-')) {
      contestNumber = parseInt(d.id.split('-')[1], 10);
    }
  }
  if (!Number.isInteger(contestNumber) || contestNumber <= 0) return null;

  const out = {
    id: `${year}-${String(contestNumber).padStart(3, '0')}`,
    contestNumber,
    year,
    date: dateStr,
    numbers: nums,
    jolly
  };
  if (superstar !== undefined) out.superstar = superstar;
  return out;
}

function normalizeWinForItaliaDraw(d) {
  if (!d || typeof d !== 'object') return null;
  const dateStr = String(d.date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const rawNums = Array.isArray(d.numbers) ? d.numbers : null;
  if (!rawNums || rawNums.length !== 6) return null;
  const nums = rawNums.map(Number).sort((a, b) => a - b);
  if (new Set(nums).size !== 6 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 40)) {
    return null;
  }

  const year = parseInt(dateStr.slice(0, 4), 10);
  const contestNumber = Number(d.contestNumber || 0);
  if (!Number.isInteger(contestNumber) || contestNumber <= 0) return null;

  return {
    id: `WFI-${year}-${String(contestNumber).padStart(3, '0')}`,
    contestNumber,
    year,
    date: dateStr,
    time: String(d.time || '20:00'),
    numbers: nums
  };
}

function parseEstrazioneDelLottoWfiHtml(html) {
  const results = [];
  const regex =
    /Estrazione\s+n\.\s*(\d+)[\s\S]*?(\d{2})\/(\d{2})\/(\d{4})[\s\S]*?<ul[^>]*class="ballRow"[^>]*>([\s\S]*?)<\/ul>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const contestNumber = parseInt(match[1], 10);
    const dateStr = `${match[4]}-${match[3]}-${match[2]}`;
    const ulHtml = match[5];
    const balls = [];
    const ballRe = /<li[^>]*class="[^"]*ball[^"]*"[^>]*>\s*(?:<strong>)?(\d+)(?:<\/strong>)?\s*<\/li>/gi;
    let bm;
    while ((bm = ballRe.exec(ulHtml)) !== null) {
      balls.push(parseInt(bm[1], 10));
    }
    if (balls.length === 6) {
      const norm = normalizeWinForItaliaDraw({
        contestNumber,
        date: dateStr,
        time: '20:00',
        numbers: balls
      });
      if (norm) results.push(norm);
    }
  }
  return results;
}

function parseEstrazioniLotterieWfiHtml(html) {
  const results = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const concMatch = row.match(/Concorso<\/span>\s*(\d+)\s*\/\s*(\d{2,4})/i);
    const dateMatch = row.match(
      /<div[^>]*class="day[^"]*"[^>]*>[\s\S]*?<span>\s*(\d{1,2})\s*<\/span>\s*<span>\s*([a-z]{3})[\s\S]*?(\d{4})/i
    );
    if (!concMatch || !dateMatch) continue;
    const contestNumber = parseInt(concMatch[1], 10);
    const day = String(parseInt(dateMatch[1], 10)).padStart(2, '0');
    const mon = IT_MONTHS[dateMatch[2].toLowerCase()];
    const year = dateMatch[3];
    if (!mon) continue;
    const balls = [];
    const ballRe = /<li[^>]*class="[^"]*ball[^"]*"[^>]*>\s*(\d+)\s*<\/li>/gi;
    let bm;
    while ((bm = ballRe.exec(row)) !== null) {
      balls.push(parseInt(bm[1], 10));
    }
    if (balls.length === 6) {
      const norm = normalizeWinForItaliaDraw({
        contestNumber,
        date: `${year}-${mon}-${day}`,
        time: '20:00',
        numbers: balls
      });
      if (norm) results.push(norm);
    }
  }
  return results;
}

async function syncSuperEnalotto() {
  const existing = await readJsonSafe(SUPERENALOTTO_JSON_PATH, { draws: [] });
  const existingDraws = Array.isArray(existing.draws) ? existing.draws : [];
  const byDate = new Map();
  for (const d of existingDraws) {
    const norm = normalizeSuperEnalottoDraw(d);
    if (norm) byDate.set(norm.date, norm);
  }
  const prevSize = byDate.size;

  try {
    const res = await fetch(SUPERENALOTTO_FEED_URL, {
      headers: { 'User-Agent': 'SuperSmart-External-Archive-Sync/1.0' }
    });
    if (res.ok) {
      const data = await res.json();
      const rawDraws = Array.isArray(data?.draws)
        ? data.draws.filter((x) => x && x.date && x.date >= '2009-01-01')
        : [];
      rawDraws.sort((a, b) => a.date.localeCompare(b.date));
      const byYear = {};
      for (const x of rawDraws) {
        const y = parseInt(x.date.slice(0, 4), 10);
        byYear[y] = (byYear[y] || 0) + 1;
        const cn = typeof x.concorso === 'number' && x.concorso > 0 ? x.concorso : byYear[y];
        const norm = normalizeSuperEnalottoDraw({
          date: x.date,
          contestNumber: cn,
          numbers: x.nums,
          jolly: x.jolly,
          superstar: x.ss
        });
        if (norm) {
          const prev = byDate.get(norm.date);
          if (!prev || (norm.superstar !== undefined && prev.superstar === undefined)) {
            byDate.set(norm.date, norm);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Sync SuperEnalotto] Warning feed:', err.message);
  }

  const merged = Array.from(byDate.values()).sort((a, b) => {
    const cmp = b.date.localeCompare(a.date);
    return cmp !== 0 ? cmp : b.contestNumber - a.contestNumber;
  });

  if (merged.length === prevSize && merged[0]?.date === existingDraws[0]?.date) {
    console.log(`[Sync SuperEnalotto] Già aggiornato (${merged.length} concorsi, ultimo: ${merged[0]?.date || 'n/d'}).`);
    return false;
  }

  const payload = {
    game: 'SuperEnalotto (6/90)',
    source: 'external-github-archive',
    exportedAt: new Date().toISOString(),
    count: merged.length,
    latestDate: merged[0]?.date || '',
    oldestDate: merged[merged.length - 1]?.date || '',
    draws: merged
  };
  await fs.writeFile(SUPERENALOTTO_JSON_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`[Sync SuperEnalotto] Aggiornato: ${merged.length} concorsi (+${merged.length - prevSize}).`);
  return true;
}

async function syncWinForItalia() {
  const existing = await readJsonSafe(WINFORITALIA_JSON_PATH, { draws: [] });
  const existingDraws = Array.isArray(existing.draws) ? existing.draws : [];
  const byDate = new Map();
  for (const d of existingDraws) {
    const norm = normalizeWinForItaliaDraw(d);
    if (norm) byDate.set(norm.date, norm);
  }
  const prevSize = byDate.size;

  const year = new Date().getUTCFullYear();
  const sources = [
    {
      url: `https://www.estrazionedellotto.it/win-for-italia-team/risultati/archivio-win-for-italia-team-${year}`,
      parse: parseEstrazioneDelLottoWfiHtml
    },
    {
      url: 'https://www.estrazionilotterie.it/win-for-italia-team/estrazioni',
      parse: parseEstrazioniLotterieWfiHtml
    }
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = src.parse(html);
      for (const d of parsed) {
        byDate.set(d.date, d);
      }
      if (parsed.length > 0) break;
    } catch (err) {
      console.warn(`[Sync WinForItalia] Warning ${src.url}:`, err.message);
    }
  }

  const merged = Array.from(byDate.values()).sort((a, b) => {
    const cmp = b.date.localeCompare(a.date);
    return cmp !== 0 ? cmp : b.contestNumber - a.contestNumber;
  });

  if (merged.length === prevSize && merged[0]?.date === existingDraws[0]?.date) {
    console.log(`[Sync WinForItalia] Già aggiornato (${merged.length} estrazioni, ultima: ${merged[0]?.date || 'n/d'}).`);
    return false;
  }

  const payload = {
    game: 'Win for Italia Team / Win for Life (6/40)',
    source: 'external-github-archive',
    exportedAt: new Date().toISOString(),
    count: merged.length,
    latestDate: merged[0]?.date || '',
    oldestDate: merged[merged.length - 1]?.date || '',
    draws: merged
  };
  await fs.writeFile(WINFORITALIA_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[Sync WinForItalia] Aggiornato: ${merged.length} estrazioni (+${merged.length - prevSize}).`);
  return true;
}

async function main() {
  console.log('=== Avvio Sync Estrazioni (Archivio Esterno SuperSmart) ===');
  const seChanged = await syncSuperEnalotto();
  const wfiChanged = await syncWinForItalia();
  console.log(`=== Fine Sync (SuperEnalotto=${seChanged}, WinForItalia=${wfiChanged}) ===`);
}

main().catch((err) => {
  console.error('Errore sync-draws.mjs:', err);
  process.exitCode = 1;
});
