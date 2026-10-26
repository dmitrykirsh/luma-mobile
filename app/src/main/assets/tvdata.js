/* Каналы: плейлисты IPTV, каталог мира (iptv-org), телепрограмма. Копия данных из Luma TV (tv.js); позже уйдёт в общий модуль. */
'use strict';
const TV_RAW = 'https://raw.githubusercontent.com/smolnp/IPTVru/gh-pages/';
const TV_LISTS = [['main', TV_RAW + 'IPTVru.m3u'], ['stable', TV_RAW + 'IPTVstable.m3u8']];
const TV_EPG_URL = 'https://iptvx.one/epg/epg_lite.xml.gz';
const TV_ADULT = /(xxx|эротик|для взрослых|взрослые|adult|18\+)/i;
const TV_TTL = 6 * 3600e3;

const tvNrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
const tvSlug = (x) => tvNrm(x) || String(x).length + ':' + String(x).slice(0, 12);

const TVD = { channels: [], list: [], cat: 'Все', cur: null, srcIdx: 0, hls: null, epg: { programmes: {}, alias: {}, at: 0 }, epgBusy: false, shown: 0, osdT: 0, stuckT: 0, timers: {}, loading: null };
const tvX = () => (S.extra = S.extra || {});
const tvFavs = () => (tvX().tvFav = tvX().tvFav || []);
const tvIsFav = (id) => tvFavs().includes(id);
function tvToggleFav(id) { const f = tvFavs(); const i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.unshift(id); save(); return i < 0; }
const tvStats = () => (tvX().tvStats = tvX().tvStats || {});

/* ---------- плейлисты ---------- */
function tvParseM3u(text, dropAdult) {
  const out = []; let meta = null, opts = {}, grp = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const m = line.match(/^#EXTINF:\s*-?[\d.]+\s*((?:[\w.-]+="[^"]*"\s*)*)(?:[\w.-]+=\S+\s*)*,(.*)$/);
      const attrs = {};
      if (m) for (const a of m[1].matchAll(/([\w.-]+)="([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
      meta = { attrs, name: ((m && m[2]) || line.split(',').pop() || '').trim() }; opts = {};
    } else if (/^#EXTVLCOPT:/i.test(line)) {
      const m = line.match(/^#EXTVLCOPT:http-(user-agent|referrer|referer|origin)\s*=\s*"?(.*?)"?$/i);
      if (m) opts[/user-agent/i.test(m[1]) ? 'ua' : /origin/i.test(m[1]) ? 'origin' : 'ref'] = m[2];
    } else if (/^#EXTGRP:/i.test(line)) grp = line.slice(8).trim();
    else if (line.startsWith('#')) continue;
    else if (meta && /^https?:\/\//i.test(line)) {
      let url = line, ua = opts.ua, ref = opts.ref;
      const bar = url.indexOf('|');
      if (bar > 0) { for (const kv of url.slice(bar + 1).split('&')) { const [k, ...v] = kv.split('='); const val = decodeURIComponent(v.join('=')); if (/^user-agent$/i.test(k)) ua = val; else if (/^referr?er$/i.test(k)) ref = val; } url = url.slice(0, bar); }
      const group = meta.attrs['group-title'] || grp || 'Без категории';
      if (!(dropAdult && (TV_ADULT.test(group) || TV_ADULT.test(meta.name)))) out.push({ name: meta.name || 'Без названия', group, logo: meta.attrs['tvg-logo'] || '', tvg: (meta.attrs['tvg-id'] || '').toLowerCase(), url, ua, ref });
      meta = null;
    }
  }
  return out;
}
function tvToChannels(items, prefix) {
  const by = new Map();
  for (const c of items) {
    const id = prefix + (c.tvg || tvSlug(c.name));
    let ch = by.get(id);
    if (!ch) { ch = { id, name: c.name, group: c.group, logo: c.logo, tvg: c.tvg, sources: [] }; by.set(id, ch); }
    if (!ch.logo && c.logo) ch.logo = c.logo;
    if (!ch.sources.some((s) => s.url === c.url)) ch.sources.push({ url: c.url, ua: c.ua || '', ref: c.ref || '' });
  }
  return [...by.values()];
}
async function tvFetchList(url, builtin) {
  const r = await fetch(tvPx(url, '', '', true));   // плейлист каналов отдаём как есть, без переписывания адресов
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return tvToChannels(tvParseM3u(await r.text(), builtin), '');
}
async function tvLoad(force) {
  if (TVD.loading) return TVD.loading;
  if (TVD.channels.length && !force) return;
  TVD.loading = (async () => {
    // быстрый старт: каналы из прошлого запуска
    if (!force) { try { const c = JSON.parse(localStorage.getItem('luma.m.ch2') || 'null'); if (c && Date.now() - c.at < TV_TTL && c.list.length) { TVD.channels = c.list; tvAfterLoad(); return; } } catch {} }
    const res = await Promise.allSettled(TV_LISTS.map(([, u]) => tvFetchList(u, true)));
    const [main, stable] = res.map((x) => (x.status === 'fulfilled' ? x.value : []));
    const stableById = new Map(stable.map((c) => [c.id, c]));
    let list = main.map((c) => { const s = stableById.get(c.id); return s ? { ...c, stable: true, sources: [...s.sources, ...c.sources.filter((x) => !s.sources.some((y) => y.url === x.url))] } : c; });
    for (const s of stable) if (!list.some((c) => c.id === s.id)) list.push({ ...s, stable: true });
    for (const e of (tvX().tvCustom || []).filter((x) => x && (x.url || x.file) && x.enabled !== false)) {
      try {
        const chs = await tvFetchList(e.url, false);
        list.push(...chs.map((c) => ({ ...c, id: 'c' + e.id + ':' + c.id, list: e.name })));
      } catch {}
    }
    if (!list.length) throw new Error('NO_CHANNELS');
    TVD.channels = list;
    try { localStorage.setItem('luma.m.ch2', JSON.stringify({ at: Date.now(), list })); } catch {}
    tvAfterLoad();
  })();
  try { await TVD.loading; } finally { TVD.loading = null; }
}
function tvAfterLoad() { try { const c = JSON.parse(localStorage.getItem('luma.m.epg') || 'null'); if (c) TVD.epg = c; } catch {} if (Date.now() - (TVD.epg.at || 0) > TV_TTL) tvEpgRefresh(); }

/* ---------- телепрограмма (читается в фоне, в памяти остаются только нужные каналы) ---------- */
function tvEpgWorker() {
  self.onmessage = async (e) => {
    const { url, ids, names } = e.data;
    const nrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
    const dec = (x) => String(x || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
    const ptime = (x) => {
      const m = String(x).match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/); if (!m) return 0;
      const off = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000;
    };
    const wantedIds = new Set(ids), wantedNames = new Map(names), nameToEpg = new Map();
    const now = Date.now(), from = now - 4 * 3600e3, to = now + 48 * 3600e3;
    const programmes = {}; let total = 0;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const rd = r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
      let buf = '', phaseProg = false;
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += value; let pos = 0;
        for (;;) {
          const c = phaseProg ? -1 : buf.indexOf('<channel ', pos), p = buf.indexOf('<programme ', pos);
          let i, kind;
          if (c >= 0 && (p < 0 || c < p)) { i = c; kind = 'c'; } else if (p >= 0) { i = p; kind = 'p'; phaseProg = true; } else { pos = Math.max(pos, buf.length - 12); break; }
          const end = buf.indexOf(kind === 'c' ? '</channel>' : '</programme>', i);
          if (end < 0) { pos = i; break; }
          const block = buf.substring(i, end);
          if (kind === 'c') {
            const id = (block.match(/^<channel\s+id="([^"]*)"/) || [])[1];
            if (id) for (const n of block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)) { const k = nrm(dec(n[1])); if (k && wantedNames.has(k) && !nameToEpg.has(k)) { nameToEpg.set(k, id); wantedIds.add(id); } }
            pos = end + 10;
          } else {
            const m = block.match(/^<programme\s+([^>]*)>/);
            if (m) {
              const a = m[1], ch = (a.match(/channel="([^"]*)"/) || [])[1];
              if (ch && wantedIds.has(ch)) {
                const s = ptime((a.match(/start="([^"]*)"/) || [])[1]), e2 = ptime((a.match(/stop="([^"]*)"/) || [])[1]);
                if (s && e2 && e2 >= from && s <= to) { const title = dec((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]); if (title) { (programmes[ch] = programmes[ch] || []).push([s, e2, title]); total++; } }
              }
            }
            pos = end + 12;
          }
        }
        buf = buf.slice(pos);
      }
      for (const id of Object.keys(programmes)) programmes[id].sort((x, y) => x[0] - y[0]);
      const alias = {};
      for (const [k, cids] of wantedNames) { const e3 = nameToEpg.get(k); if (e3 && programmes[e3]) for (const id of cids) alias[id] = e3; }
      postMessage({ ok: true, programmes, alias, total });
    } catch (err) { postMessage({ error: String(err && err.message || err) }); }
  };
}
function tvEpgRefresh() {
  if (TVD.epgBusy || !TVD.channels.length || typeof Worker === 'undefined') return;
  TVD.epgBusy = true;
  const ids = [], by = new Map();
  for (const c of TVD.channels) { if (c.tvg) ids.push(c.tvg); else { const k = tvNrm(c.name); if (k) { if (!by.has(k)) by.set(k, []); by.get(k).push(c.id); } } }
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob(['(' + tvEpgWorker.toString() + ')()'], { type: 'text/javascript' }))); } catch { TVD.epgBusy = false; return; }
  const done = () => { TVD.epgBusy = false; try { w.terminate(); } catch {} };
  w.onmessage = (e) => {
    done();
    if (!e.data.ok) return;
    TVD.epg = { programmes: e.data.programmes, alias: e.data.alias, at: Date.now() };
    try { localStorage.setItem('luma.m.epg', JSON.stringify(TVD.epg)); } catch {}
    if (typeof tvPaintNow === 'function') tvPaintNow();
  };
  w.onerror = done;
  w.postMessage({ url: tvPx(TV_EPG_URL, '', '', true), ids: [...new Set(ids)], names: [...by] });
}
function tvNowNext(ch) {
  const id = (ch.tvg && TVD.epg.programmes[ch.tvg]) ? ch.tvg : TVD.epg.alias[ch.id];
  const list = id && TVD.epg.programmes[id]; if (!list) return {};
  const now = Date.now();
  for (let i = 0; i < list.length; i++) if (list[i][0] <= now && now < list[i][1]) return { now: list[i][2], next: list[i + 1]?.[2], pct: Math.round(100 * (now - list[i][0]) / (list[i][1] - list[i][0])), end: list[i][1] };
  return {};
}

const TVW = { all: null, at: 0, loading: null, byId: new Map(), cc: '', q: '' };
const TVW_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const TVW_GROUPS = { General: 'Общие', Movies: 'Фильмы', Series: 'Сериалы', Entertainment: 'Развлекательные', Music: 'Музыка', Sports: 'Спорт', News: 'Новости', Kids: 'Детские', Documentary: 'Документальные', Religious: 'Религия', Culture: 'Культура', Outdoor: 'Природа и путешествия', Lifestyle: 'Стиль жизни', Undefined: 'Без категории', Education: 'Образование', Animation: 'Мультфильмы', Business: 'Бизнес', Comedy: 'Комедии', Cooking: 'Кулинария', Family: 'Семейные', Legislative: 'Парламент', Public: 'Общественные', Relax: 'Релакс', Science: 'Наука', Shop: 'Магазины', Travel: 'Путешествия', Weather: 'Погода', Auto: 'Авто', Classic: 'Классика', Interactive: 'Интерактивные', Local: 'Местные' };
async function tvWideLoad() {
  if (TVW.all && Date.now() - TVW.at < TV_TTL) return TVW.all;
  if (TVW.loading) return TVW.loading;
  TVW.loading = (async () => {
    const r = await fetch(tvPx(TVW_URL, '', '', true));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = tvParseM3u(await r.text(), true)
      .filter((c) => !/\[(?:Not 24\/7|Geo-blocked)\]/i.test(c.name))   // каналы «не круглосуточно» и «только из своей страны» не показываем
      .map((c) => ({ ...c, name: c.name.replace(/\s*\(\d{3,4}p\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim(), group: String(c.group || '').split(';').map((g) => TVW_GROUPS[g.trim()] || g.trim()).filter(Boolean)[0] || 'Без категории' }));
    const list = tvToChannels(items, 'x:').map((c) => ({ ...c, cc: ((c.tvg || '').match(/\.([a-z]{2,3})(?:@|$)/) || [])[1] || 'int' }));
    TVW.all = list; TVW.at = Date.now(); TVW.byId = new Map(list.map((c) => [c.id, c]));
    return list;
  })();
  try { return await TVW.loading; } finally { TVW.loading = null; }
}
const tvRegion = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {} return (cc) => { const u = String(cc || '').toUpperCase(); if (!u || u === 'INT') return 'Международные'; try { return (dn && dn.of(u === 'UK' ? 'GB' : u)) || u; } catch { return u; } }; })();
const tvChan = (id) => TVD.channels.find((c) => c.id === id) || TVW.byId.get(id);
