/* TMDB для Luma: тренды, кадры, логотипы, рекомендации, рейтинги. Копия из Luma TV (app.js); позже уйдёт в общий модуль. */
'use strict';
const TM_GENRES = { 28: 'боевик', 12: 'приключения', 16: 'мультфильм', 35: 'комедия', 80: 'криминал', 99: 'документальный', 18: 'драма', 10751: 'семейный', 14: 'фэнтези', 36: 'история', 27: 'ужасы', 10402: 'музыка', 9648: 'детектив', 10749: 'мелодрама', 878: 'фантастика', 10770: 'телефильм', 53: 'триллер', 10752: 'военный', 37: 'вестерн', 10759: 'боевик и приключения', 10762: 'детский', 10765: 'фантастика и фэнтези', 10766: 'мыльная опера', 10768: 'война и политика' };
// Общий тестовый ключ TMDB лежит в секрете Worker на Cloudflare, а не в приложении. Он работает, пока пользователь не ввёл свой ключ.
const TM_SHARED = 'https://luma-tmdb-shared.dimakirsch.workers.dev';
const tmHas = () => true;
let tmMatches = {}; try { tmMatches = JSON.parse(localStorage.getItem('luma.m.m') || '{}'); } catch {}
let tmSaveT = 0, tmBusy = 0; const tmWait = [];
const tmSlot = () => new Promise((res) => { const go = () => { tmBusy++; res(); }; tmBusy < 4 ? go() : tmWait.push(go); });
const tmFree = () => { tmBusy--; const n = tmWait.shift(); if (n) n(); };
function tmPersist() { clearTimeout(tmSaveT); tmSaveT = setTimeout(() => { try { if (Object.keys(tmMatches).length > 2500) tmMatches = {}; localStorage.setItem('luma.m.m', JSON.stringify(tmMatches)); } catch {} }, 1500); }
// сопоставление записи TMDB с каталогом; удачные и честные «нет в каталоге» запоминаются
async function tmMatchCached(t, kind) {
  const ck = kind + ':' + t.id;
  if (tmMatches[ck] !== undefined) return tmMatches[ck] || null;
  await tmSlot();
  try { const m = await matchRec(t, kind); tmMatches[ck] = m ? brief(m) : 0; tmPersist(); return m ? tmMatches[ck] : null; }
  catch { return null; } finally { tmFree(); }
}
// ряды TMDB запоминаются на 6 часов: главная открывается сразу, а TMDB и поиск по каталогу не дёргаются заново
let tmRows = {}; try { tmRows = JSON.parse(localStorage.getItem('luma.m.rows') || '{}'); } catch {}
async function tmRow(path, params, kind) {
  const ck = path + JSON.stringify(params || {}), hit = tmRows[ck];
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.items;
  const items = await tmRowFetch(path, params, kind);
  if (items.length) { tmRows[ck] = { at: Date.now(), items }; try { localStorage.setItem('luma.m.rows', JSON.stringify(tmRows)); } catch {} }
  return items;
}
async function tmRowFetch(path, params, kind) {
  const j = await tmdb(path, params || {});
  const res = (j.results || []).slice(0, 20);
  const out = await Promise.all(res.map(async (t) => { const it = await tmMatchCached(t, kind); return it ? { it: { ...it, alt: t.poster_path || '' }, bd: t.backdrop_path || '', overview: t.overview || '', genres: (t.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean), kind } : null; }));
  return out.filter(Boolean);
}


const TV_TYPES = [3, 4, 5, 7], MOVIE_TYPES = [1, 2, 6];
const TMI = (p, size) => 'https://image.tmdb.org/t/p/' + size + p;
const tmCache = new Map();
async function tmdb(path, params = {}) {
  const key = S.secrets && S.secrets.tmdb, shared = !key;   // своего ключа нет: идём через общий посредник
  const u = new URL((shared ? TM_SHARED : 'https://api.themoviedb.org') + (shared ? '/3' : '/3') + path);
  u.searchParams.set('language', 'ru-RU');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  if (key) { if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key; else u.searchParams.set('api_key', key); }
  const ck = u.toString(); if (tmCache.has(ck)) return tmCache.get(ck);
  const r = await fetch(u, { headers });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? (shared ? 'SHARED' : 'BAD_KEY') : 'HTTP ' + r.status);
  const v = await r.json(); tmCache.set(ck, v); return v;
}
const nrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const nameOk = (a, b) => { a = nrm(a); b = nrm(b); return !!a && !!b && (a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)))); };
const tmFindCache = new Map();
function tmFind(d) {
  const ck = d.id; if (tmFindCache.has(ck)) return tmFindCache.get(ck);
  const p = tmFindRaw(d); tmFindCache.set(ck, p); p.catch(() => tmFindCache.delete(ck)); return p;
}
async function tmFindRaw(d) {
  const kind = TV_TYPES.includes(d.type) ? 'tv' : 'movie';
  let found = null;
  for (const q of [...new Set([d.origin_name, d.name].filter(Boolean))]) {
    const p = { query: q };
    if (d.year) p[kind === 'tv' ? 'first_air_date_year' : 'year'] = d.year;
    let j = await tmdb('/search/' + kind, p);
    if (!(j.results || []).length && d.year) { delete p.year; delete p.first_air_date_year; j = await tmdb('/search/' + kind, p); }
    found = (j.results || []).find((r) => nameOk(r.title || r.name, d.name) || nameOk(r.original_title || r.original_name, d.origin_name)) || null;
    if (found) break;
  }
  if (!found) return null;
  const x = await tmdb('/' + kind + '/' + found.id, { append_to_response: 'images,recommendations,external_ids', include_image_language: 'ru,en,null' });
  const bds = (x.images?.backdrops || []).slice().sort((a, b) => b.vote_average - a.vote_average).slice(0, 14).map((b) => b.file_path);
  const logos = x.images?.logos || [];
  const logo = (logos.find((l) => l.iso_639_1 === 'ru') || logos.find((l) => l.iso_639_1 === 'en') || logos[0])?.file_path || '';
  return { kind, tmdb: found.id, vote: Number(x.vote_average) || 0, imdb: x.imdb_id || (x.external_ids && x.external_ids.imdb_id) || '', backdrop: x.backdrop_path || bds[0] || '', shots: bds, logo, recs: (x.recommendations?.results || []).slice(0, 16) };
}
async function matchRec(t, kind) {
  const types = kind === 'tv' ? TV_TYPES : MOVIE_TYPES;
  const title = t.title || t.name, orig = t.original_title || t.original_name;
  const year = Number(String(t.release_date || t.first_air_date || '').slice(0, 4)) || 0;
  for (const q of [...new Set([title, orig].filter(Boolean))]) {
    const items = await search(q);
    const hit = items.find((it) => types.includes(it.type) && (!year || !it.year || Math.abs(it.year - year) <= 1) && (nameOk(it.name, title) || nameOk(it.name, orig) || nameOk(it.origin_name, orig) || nameOk(it.origin_name, title)));
    if (hit) return hit;
  }
  return null;
}
// Rotten Tomatoes и Metacritic через OMDb (ключ приезжает с резервной копией); ответы запоминаются на 3 дня
let omdbC = {}; try { omdbC = JSON.parse(localStorage.getItem('luma.m.omdb') || '{}'); } catch {}
async function omdbRatings(imdb) {
  const key = S.secrets && S.secrets.omdb; if (!key || !imdb) return null;
  const c = omdbC[imdb]; if (c && Date.now() - c.at < 3 * 86400e3) return c;
  const r = await fetch('https://www.omdbapi.com/?i=' + encodeURIComponent(imdb) + '&apikey=' + encodeURIComponent(key));
  const j = await r.json(); if (j.Response === 'False') return null;
  const get = (n) => (j.Ratings || []).find((x) => x.Source === n)?.Value || '';
  const rt = parseInt(get('Rotten Tomatoes')) || 0, mc = parseInt(get('Metacritic')) || 0;
  omdbC[imdb] = { at: Date.now(), rt, mc };
  try { localStorage.setItem('luma.m.omdb', JSON.stringify(omdbC)); } catch {}
  return omdbC[imdb];
}
