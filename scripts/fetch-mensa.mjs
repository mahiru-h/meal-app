// GitHub Actions から実行: Mensa のメニューを取得して data/mensa/ に週ごとに蓄積する
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_URL, groupByDate, mergeDays } from './mensa-lib.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'mensa');

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  await mkdir(DIR, { recursive: true });
  const index = await readJson(join(DIR, 'index.json'), { weeks: [] });
  const now = new Date().toISOString();

  let raw;
  try {
    const res = await fetch(API_URL, { headers: { Accept: 'application/json', 'User-Agent': 'meal-app (personal use)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
    if (!Array.isArray(raw)) throw new Error('unexpected response');
  } catch (e) {
    // 取得失敗でも lastChecked は更新する（定期実行の自動停止を防ぐため）
    index.lastChecked = now;
    index.lastError = String(e.message || e);
    await writeFile(join(DIR, 'index.json'), JSON.stringify(index, null, 1));
    console.error('fetch failed:', e);
    return;
  }

  const days = groupByDate(raw);
  const weekFiles = {};
  const files = (await readdir(DIR)).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f));
  for (const f of files) weekFiles[f.replace('.json', '')] = await readJson(join(DIR, f), null);

  const changed = mergeDays(weekFiles, days);
  for (const w of changed) {
    weekFiles[w].updated = now;
    await writeFile(join(DIR, `${w}.json`), JSON.stringify(weekFiles[w]));
  }

  index.weeks = Object.keys(weekFiles).sort();
  index.updated = changed.length ? now : index.updated || now;
  index.lastChecked = now;
  delete index.lastError;
  await writeFile(join(DIR, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`items: ${raw.length}, changed weeks: ${changed.join(', ') || 'none'}`);
}

main();
