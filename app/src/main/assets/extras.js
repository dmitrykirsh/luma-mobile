/* Рейтинг Letterboxd и поиск трейлеров (TMDB/YouTube и Rutube). Копия из Luma TV (details.js); позже уйдёт в общий модуль. */
'use strict';
/* ---------- Letterboxd (страница фильма по TMDB id; читаем рейтинг из разметки) ---------- */
let lbCache = {}; try { lbCache = JSON.parse(localStorage.getItem('luma.m.lb') || '{}'); } catch {}
async function lbRating(tmdb) {
  if (!tmdb) return null;
  const c = lbCache[tmdb]; if (c && Date.now() - c.at < 6 * 3600e3) return c.v;
  try {
    const r = await fetch(tvPx('https://letterboxd.com/tmdb/' + tmdb + '/', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', '', true));
    const text = await r.text();
    const v = text.match(/"ratingValue":\s*([\d.]+)/), n = text.match(/"ratingCount":\s*(\d+)/);
    const out = v ? { value: Number(v[1]), count: n ? Number(n[1]) : 0 } : null;
    lbCache[tmdb] = { at: Date.now(), v: out }; try { localStorage.setItem('luma.m.lb', JSON.stringify(lbCache)); } catch {}
    return out;
  } catch { return null; }
}

/* ---------- трейлеры: TMDB (YouTube) + поиск Rutube с той же строгой проверкой, что на десктопе ---------- */
const trNrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const trYears = (x) => [...String(x || '').matchAll(/\b(19\d\d|20\d\d)\b/g)].map((m) => Number(m[1]));
const TR_WORDS = /трейлер|trailer|тизер|teaser|official|официальн|ролик/i;
function trScore(t, v) {
  const title = trNrm(v.title);
  const names = [t.name, t.origin].map(trNrm).filter((n) => n.length >= 3);
  if (!names.some((n) => title.includes(n))) return 0;
  if (v.duration != null && (v.duration < 15 || v.duration > 420)) return 0;
  const yr = Number(t.year) || 0; let s = 1;
  if (yr) { const ys = trYears(v.title); if (ys.length && !ys.includes(yr)) return 0; if (ys.includes(yr)) s += 3; else if (trYears(v.description).includes(yr)) s += 1; else return 0; }
  if (TR_WORDS.test(v.title)) s += 3;
  if (v.duration != null && v.duration <= 240) s += 1;
  return s;
}
// YouTube в некоторых сетях недоступен (встроенный плеер остаётся чёрным), поэтому сначала проверяем доступность
let ytOk = null;
function ytReachable() {
  if (ytOk) return ytOk;
  ytOk = new Promise((res) => { const tm = setTimeout(() => res(false), 4000); fetch('https://www.youtube.com/generate_204', { mode: 'no-cors' }).then(() => { clearTimeout(tm); res(true); }).catch(() => { clearTimeout(tm); res(false); }); });
  return ytOk;
}
async function findTrailers(t) {
  const out = [];
  const rutube = (async () => {
    const nm = t.name || '', or = t.origin || '', y = t.year || '';
    const qs = [`${nm} ${y} трейлер`, or && trNrm(or) !== trNrm(nm) ? `${or} ${y} trailer` : '', `${nm} ${y} официальный трейлер`].filter(Boolean);
    const seen = new Map();
    await Promise.all(qs.map(async (q) => {
      try {
        const r = await fetch(tvPx('https://rutube.ru/api/search/video/?query=' + encodeURIComponent(q), '', '', true)); const j = await r.json();
        for (const v of j.results || []) { if (seen.has(v.id)) continue; const sc = trScore(t, { title: v.title, description: v.description, duration: v.duration }); if (sc) seen.set(v.id, { sc, item: { src: 'Rutube', id: v.id, title: v.title, thumb: v.thumbnail_url, url: 'https://rutube.ru/play/embed/' + v.id + '?autoStart=1' } }); }
      } catch {}
    }));
    return [...seen.values()].sort((a, b) => b.sc - a.sc).slice(0, 6).map((x) => x.item);
  })();
  const yt = (async () => {
    const viaApp = !!(NATIVE && NATIVE.openYoutube);   // трейлер откроется в приложении YouTube, поэтому доступность youtube.com из WebView не важна
    if (!t.tmdb || !tmHas() || (!viaApp && !(await ytReachable()))) return [];
    try {
      const j = await tmdb(`/${t.kind === 'tv' ? 'tv' : 'movie'}/${t.tmdb}/videos`, { include_video_language: 'ru,en,null' });
      const vids = (j.results || []).filter((v) => v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type)).sort((a, b) => (b.official - a.official) || (a.iso_639_1 === 'ru' ? -1 : 0) - (b.iso_639_1 === 'ru' ? -1 : 0) || String(b.published_at).localeCompare(String(a.published_at)));
      return vids.slice(0, 4).map((v) => ({ src: 'YouTube', id: v.key, title: v.name, thumb: `https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`, url: `https://www.youtube-nocookie.com/embed/${v.key}?autoplay=1&rel=0` }));
    } catch { return []; }
  })();
  const [a, b] = await Promise.all([rutube, yt]);
  return [...a, ...b];
}
