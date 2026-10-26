/* Слияние данных (резервная копия, синхронизация) и описание ключей сервисов. Копия из Luma TV (app.js, settings.js). */
'use strict';
const uniq = (list, key) => { const m = new Map(); for (const x of list) if (x && x[key] != null && !m.has(x[key])) m.set(x[key], x); return [...m.values()]; };

function mergeBackup(b) {
  const d = b.data || {};
  S.favs = uniq([...(S.favs || []), ...(d.favs || [])], 'id');
  const m = new Map();
  for (const x of [...(S.history || []), ...(d.history || [])]) { const o = m.get(x.id); if (!o || (x.ts || 0) > (o.ts || 0)) m.set(x.id, x); }
  S.history = [...m.values()].sort((a, b2) => (b2.ts || 0) - (a.ts || 0)).slice(0, 60);
  S.gone = S.gone || {};
  for (const [gk, gts] of Object.entries(d.gone || {})) if (gts > (S.gone[gk] || 0)) S.gone[gk] = gts;   // отметки об удалении: удалённое на одном устройстве не возвращается с другого
  { const cut = Date.now() - 90 * 864e5; for (const gk of Object.keys(S.gone)) if (S.gone[gk] < cut) delete S.gone[gk]; }
  S.favs = S.favs.filter((f) => !(S.gone['f:' + f.id] > (f.at || 0)));
  const seenAfter = (id, ts) => [S.progress || {}, d.progress || {}].some((pr) => Object.entries(pr).some(([k, p]) => k.startsWith(id + ':') && (p.ts || 0) > ts));   // был просмотр позже удаления: запись остаётся
  S.history = S.history.filter((h) => !(S.gone['h:' + h.id] > (h.ts || 0) && !seenAfter(h.id, S.gone['h:' + h.id])));
  S.seen = { ...(S.seen || {}) };
  for (const [k, arr] of Object.entries(d.seen || {})) S.seen[k] = [...new Set([...(S.seen[k] || []), ...arr])];
  S.progress = { ...(S.progress || {}) };
  for (const [k, p] of Object.entries(d.progress || {})) if (!S.progress[k] || (p.ts || 0) > (S.progress[k].ts || 0)) S.progress[k] = p;
  S.secrets = { ...(S.secrets || {}), ...(b.secrets || {}) };
  const x = (S.extra = S.extra || {});
  if (d.lists) x.lists = uniq([...(x.lists || []), ...d.lists], 'url');
  if (d.tvFav) x.tvFav = [...new Set([...(x.tvFav || []), ...d.tvFav])];
  if (d.tvStats) { x.tvStats = x.tvStats || {}; for (const [id, st] of Object.entries(d.tvStats)) { const o = x.tvStats[id]; if (!o || (st.last || 0) > (o.last || 0)) x.tvStats[id] = { ...st, n: Math.max(st.n || 0, o?.n || 0), t: Math.max(st.t || 0, o?.t || 0) }; } }
  if (d.tvCustom) { const cur = x.tvCustom || []; x.tvCustom = [...cur, ...d.tvCustom.filter((e) => e && e.url && !cur.some((c) => c.url === e.url))]; }
  if (d.tvLast && !x.tvLast) x.tvLast = d.tvLast;
  S.imported = Date.now();
  save();
  return { favs: (d.favs || []).length, history: (d.history || []).length, keys: Object.keys(b.secrets || {}) };
}

const UA_SET = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const KEYS = {
  tmdb: { name: 'TMDB', use: 'Кадры, логотипы, рекомендации, актёры и тренды на главной', re: /^[\w.-]{20,}$/, help: 'Бесплатный ключ: <b>themoviedb.org</b> → Настройки → API → «Ключ API (v3)» (или длинный токен, начинающийся с eyJ).',
    async check(k) { const bearer = k.startsWith('eyJ'); const r = await fetch('https://api.themoviedb.org/3/configuration' + (bearer ? '' : '?api_key=' + encodeURIComponent(k)), bearer ? { headers: { Authorization: 'Bearer ' + k } } : {}); return r.status === 401 ? 'BAD' : r.ok ? '' : 'NET'; } },
  omdb: { name: 'OMDb', use: 'Рейтинги Rotten Tomatoes и Metacritic', re: /^[A-Za-z0-9]{6,14}$/, help: 'Бесплатный ключ: <b>omdbapi.com</b> → API Key (до 1000 запросов в день). Ключ придёт на почту.',
    async check(k) { const r = await fetch('https://www.omdbapi.com/?i=tt0111161&apikey=' + encodeURIComponent(k)); const j = await r.json().catch(() => ({})); return j.Response === 'False' ? (/limit/i.test(j.Error || '') ? 'LIMIT' : 'BAD') : ''; } },
  trakt: { name: 'Trakt', use: 'Подборки Trakt', re: /^[A-Za-z0-9_-]{30,100}$/, help: 'Бесплатно: <b>trakt.tv</b> → Settings → Your API Apps → New Application (Redirect URI: http://localhost) → скопируйте <b>Client ID</b>.',
    async check(k) { const r = await fetch(tvPx('https://api.trakt.tv/lists/popular?limit=1', 'Luma-TV', '', true, { 'trakt-api-version': '2', 'trakt-api-key': k })); return r.status === 401 || r.status === 403 ? 'BAD' : r.ok ? '' : 'NET'; } },
  mdblist: { name: 'MDBList', use: 'Подборки MDBList', re: /^[A-Za-z0-9_-]{16,80}$/, help: 'Бесплатно: <b>mdblist.com</b> → Preferences → API Key.',
    async check(k) { const r = await fetch(tvPx('https://api.mdblist.com/lists/top?limit=1&apikey=' + encodeURIComponent(k), 'Luma-TV', '', true)); return r.status === 401 || r.status === 403 ? 'BAD' : r.ok ? '' : 'NET'; } }
};
const KEY_ERR = { BAD: 'Ключ не подошёл: проверьте, что скопировали его целиком.', NET: 'Сервис не ответил. Проверьте интернет.', LIMIT: 'Достигнут дневной лимит ключа, но сам ключ рабочий.' };
