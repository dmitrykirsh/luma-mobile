/* Разбор страницы плеера сайта: адреса потоков, озвучки, субтитры, превью. Копия из Luma TV (nplayer.js); позже уйдёт в общий модуль. */
'use strict';
const tvB64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tvPx = (u, ua = '', ref = '', raw = false, hdr = null) => 'https://liftw.ws/__p/' + tvB64(JSON.stringify({ u, ua, ref, ...(raw ? { raw: true } : {}), ...(hdr ? { hdr } : {}) }));
const NP_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
/* ---------- данные со страницы плеера ---------- */
const npCache = new Map();
function jsonAt(html, from, open, close) {   // вырезает JSON-значение (массив или объект) начиная с позиции from
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close) { depth--; if (depth === 0) return html.slice(from, i + 1); }
  }
  return null;
}
// превью для перемотки: спрайты кадров (по умолчанию 10×10 кадров 160×90 раз в 5 секунд)
function parsePreview(raw) {
  if (!raw) return null;
  const src = (String(raw).match(/src:\s*"([^"]+)"/) || String(raw).match(/"src":\s*"([^"]+)"/) || [])[1];
  if (!src || !src.includes('${spriteNum}')) return null;
  const num = (k, d) => { const m = String(raw).match(new RegExp('["\\s{,]' + k + '"?\\s*:\\s*(\\d+)')); return m ? Number(m[1]) : d; };
  return { src, interval: num('interval', 5), w: num('width', 160), h: num('height', 90), size: num('spriteSize', 100), row: num('rowSize', 10), first: num('firstNum', 1) };
}
function npParse(html) {
  const tk = html.match(/var lok = 1, (\w+)= "(\w+)"/), tok = tk ? tk[2] : '';
  const fix = (u) => (u ? u + (tok ? '&' + tok : '') : '');   // страница дописывает этот ключ ко всем адресам потоков
  const out = { title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '', seasons: null, movie: null };
  const sIdx = html.indexOf('seasons:[');
  if (sIdx >= 0) {
    const raw = jsonAt(html, sIdx + 'seasons:'.length, '[', ']');
    if (raw) { try { out.seasons = JSON.parse(raw); } catch {} }
    if (out.seasons) for (const s of out.seasons) if (s.episodes) s.episodes.sort((x, y) => Number(x.episode) - Number(y.episode));   // серии иногда приходят вперемешку
    if (out.seasons) for (const s of out.seasons) for (const e of s.episodes || []) { e.hls = fix(e.hls); e.dasha = fix(e.dasha); e.dash = fix(e.dash); e.prev = e.preview && e.preview.src ? parsePreview(JSON.stringify(e.preview)) : null; }
  }
  if (!out.seasons) {
    const mi = html.lastIndexOf('makePlayer({'); const seg = mi >= 0 ? html.slice(mi) : html;
    const hls = (seg.match(/hls:\s*"([^"]+)"/) || [])[1];
    const dash = (seg.match(/\bdash:\s*"([^"]+)"/) || [])[1];
    const part = (re, o, c) => { const m = seg.match(re); if (!m) return null; const raw = jsonAt(seg, m.index + m[0].length - 1, o, c); try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
    out.movie = { prev: parsePreview((html.match(/preview:\s*\{[\s\S]*?pad:\s*\d+\s*\}/) || [])[0]), hls: fix(hls), dash: fix(dash), dasha: fix((seg.match(/dasha:\s*"([^"]+)"/) || [])[1]), audio: part(/audio:\s*\{/, '{', '}') || { names: [], order: [] }, cc: part(/cc:\s*\[/, '[', ']') || [], sections: part(/sections:\s*\[/, '[', ']') || [], duration: Number((seg.match(/duration:\s*(\d+)/) || [])[1]) || 0 };
  }
  return out;
}
async function npEmbed(d) {
  const ck = d.id, hit = npCache.get(ck);
  if (hit && Date.now() - hit.t < 15 * 60e3) return hit.v;
  let last;
  const urls = [d.iframe_uri];
  try { const u = new URL(d.iframe_uri); for (const h of ['embed.liftw.ws', 'zenithjs.ws']) if (u.hostname !== h) { const x = new URL(d.iframe_uri); x.hostname = h; urls.push(x.href); } } catch {}
  for (const u of urls) {
    try {
      const r = await fetch(tvPx(u, NP_UA, 'https://liftw.ws/', true));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = npParse(await r.text());
      if (v.seasons || (v.movie && v.movie.hls)) { npCache.set(ck, { t: Date.now(), v }); return v; }
      throw new Error('NO_STREAM');
    } catch (e) { last = e; }
  }
  throw last;
}
function npSource(data, season, episode) {
  if (data.seasons) {
    const s = data.seasons.find((x) => String(x.season) === String(season)); const e = s && s.episodes.find((x) => String(x.episode) === String(episode));
    if (!e) return null;
    return { prev: e.prev, hls: e.hls, dash: e.dash, dasha: e.dasha, audio: e.audio || { names: [], order: [] }, cc: e.cc || [], sections: e.sections || [], duration: e.duration || 0, title: e.title || '' };
  }
  return data.movie;
}

