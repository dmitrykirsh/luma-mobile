/* Слияние данных (резервная копия, синхронизация) и описание ключей сервисов. Копия из Luma TV (app.js, settings.js). */
'use strict';
const uniq = (list, key) => { const m = new Map(); for (const x of list) if (x && x[key] != null && !m.has(x[key])) m.set(x[key], x); return [...m.values()]; };
function mergeTvFavorites(localList, localMeta, incomingList, incomingMeta) {
  const meta = Object.create(null);
  for (const source of [localMeta, incomingMeta]) if (source && typeof source === 'object' && !Array.isArray(source)) {
    for (const [id, item] of Object.entries(source)) {
      if (!id || ['__proto__','prototype','constructor'].includes(id) || !item || typeof item.on !== 'boolean' || !Number.isSafeInteger(item.ts) || item.ts <= 0) continue;
      const prev = meta[id];
      if (!prev || item.ts > prev.ts || (item.ts === prev.ts && !item.on && prev.on)) meta[id] = {on:item.on, ts:item.ts};
    }
  }
  const list = [...new Set([...(Array.isArray(localList)?localList:[]), ...(Array.isArray(incomingList)?incomingList:[])].filter(id=>typeof id==='string'||typeof id==='number').map(String).filter(Boolean))];
  for (const [id, item] of Object.entries(meta)) if (item.on && !list.includes(id)) list.push(id);
  return { list:list.filter(id=>!meta[id] || meta[id].on), meta };
}

function mergeBackup(b) {
  if(b?.secrets?.animeon&&!window.LumaAnimeOnSecret)throw new Error('ANIMEON_SECURE_CHANNEL_UNAVAILABLE');
  const d = b.data || {};
  const favs = new Map();for(const item of [...(S.favs||[]),...(d.favs||[])]){if(!item||item.id==null)continue;const key=String(item.id),old=favs.get(key);if(!old||Number(item.at||0)>Number(old.at||0))favs.set(key,item);}S.favs=[...favs.values()];
  const m = new Map();
  for (const x of [...(S.history || []), ...(d.history || [])]) { if(!x||x.id==null)continue;const key=String(x.id),o = m.get(key); if (!o || (x.ts || 0) > (o.ts || 0)) m.set(key, x); }
  S.history = [...m.values()].sort((a, b2) => (b2.ts || 0) - (a.ts || 0)).slice(0, 60);
  S.gone = S.gone || {};
  for (const [gk, gts] of Object.entries(d.gone || {})) if (gts > (S.gone[gk] || 0)) S.gone[gk] = gts;   // отметки об удалении: удалённое на одном устройстве не возвращается с другого
  { const cut = Date.now() - 90 * 864e5; for (const gk of Object.keys(S.gone)) if (S.gone[gk] < cut) delete S.gone[gk]; }
  S.favs = S.favs.filter((f) => !(S.gone['f:' + f.id] > (f.at || 0)));
  const seenAfter = (id, ts) => [S.progress || {}, d.progress || {}].some(pr=>Object.entries(pr).some(([k,p])=>{const base=String(k).replace(/^(?:vk|rutube)~[^~]+~/,'');return (base===String(id)||base.startsWith(String(id)+':'))&&(p.ts||0)>ts;}));   // был просмотр позже удаления: запись остаётся
  S.history = S.history.filter((h) => !(S.gone['h:' + h.id] > (h.ts || 0) && !seenAfter(h.id, S.gone['h:' + h.id])));
  S.seen = { ...(S.seen || {}) };
  for (const [k, arr] of Object.entries(d.seen || {})) S.seen[k] = [...new Set([...(S.seen[k] || []), ...arr])];
  S.done = { ...(S.done || {}) };
  for (const [k, arr] of Object.entries(d.done || {})) if (Array.isArray(arr)) S.done[k] = [...new Set([...(S.done[k] || []), ...arr])];
  S.progress = { ...(S.progress || {}) };
  for (const [k, p] of Object.entries(d.progress || {})) if (!S.progress[k] || (p.ts || 0) > (S.progress[k].ts || 0)) S.progress[k] = p;
  const incomingSecrets={...(b.secrets||{})};
  if(incomingSecrets.animeon){if(window.LumaAnimeOnSecret)aoAdoptSecret(incomingSecrets.animeon);delete incomingSecrets.animeon;}
  if(S.secrets?.animeon&&window.LumaAnimeOnSecret){aoAdoptSecret(S.secrets.animeon);delete S.secrets.animeon;}
  S.secrets = { ...(S.secrets || {}), ...incomingSecrets };
  const x = (S.extra = S.extra || {});
  // Сохраняем поля других платформ при круговом обмене, даже если на телефоне пока нет их экранов.
  const owned=new Set(['favs','history','seen','done','gone','progress','watchPrefs','lists','tvFav','tvFavMeta','tvStats','tvCustom','tvLast']);
  const timed=new Set(['sourceHistory','sportFollows','sportReminders','tvEpgLinks']);
  const foreign=x.syncForeign={...(x.syncForeign||{})};
  for(const [key,value] of Object.entries(d)){
    if(owned.has(key)||['__proto__','prototype','constructor'].includes(key))continue;
    if(timed.has(key)&&value&&typeof value==='object'&&!Array.isArray(value)){
      const merged={...(foreign[key]||{})};for(const [id,item] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(id))continue;const old=merged[id];if(item&&typeof item==='object'&&(!old||Number(item.ts||0)>Number(old.ts||0)))merged[id]=item;}foreign[key]=merged;
    }else foreign[key]=value;
  }
  if (d.watchPrefs && typeof d.watchPrefs === 'object' && !Array.isArray(d.watchPrefs)) {
    x.watchPrefs = { ...(x.watchPrefs || {}) };
    for (const [id, pref] of Object.entries(d.watchPrefs)) if (pref && typeof pref === 'object' && !Array.isArray(pref) && (!x.watchPrefs[id] || Number(pref.ts || 0) > Number(x.watchPrefs[id].ts || 0))) x.watchPrefs[id] = pref;
  }
  {const lists=new Map();for(const item of [...(Array.isArray(x.lists)?x.lists:[]),...(Array.isArray(d.lists)?d.lists:[])]){if(!item||typeof item.url!=='string'||!item.url)continue;const old=lists.get(item.url);if(!old||Number(item.at||0)>Number(old.at||0))lists.set(item.url,item);}x.lists=[...lists.values()].filter(item=>!(Number(S.gone['l:'+item.url]||0)>Number(item.at||0)));}
  { const merged = mergeTvFavorites(x.tvFav, x.tvFavMeta, d.tvFav, d.tvFavMeta); x.tvFav = merged.list; x.tvFavMeta = merged.meta; }
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
