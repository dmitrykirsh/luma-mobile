'use strict';
/* Luma для телефона: главная, каталог, поиск, «Моё», страница фильма. Плеер — в player.js. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NATIVE = typeof Native !== 'undefined' ? Native : null;
// Доступ к сохранённому входу разрешён только основной странице Luma, не вложенным плеерам.
let aoSecretCache='', aoSecretSeq=0; const aoSecretPending=new Map();
function aoSecretCall(action,value=''){return new Promise(resolve=>{if(!window.LumaAnimeOnSecret)return resolve(null);const id=++aoSecretSeq,timer=setTimeout(()=>{aoSecretPending.delete(id);resolve(null);},5000);aoSecretPending.set(id,v=>{clearTimeout(timer);resolve(v);});window.LumaAnimeOnSecret.postMessage(JSON.stringify({id,action,value}));});}
if(window.LumaAnimeOnSecret)window.LumaAnimeOnSecret.onmessage=e=>{try{const m=JSON.parse(e.data),cb=aoSecretPending.get(m.id);if(cb){aoSecretPending.delete(m.id);cb(m.value);}}catch{}};
async function aoRefreshSecret(force=false){const value=await aoSecretCall('get');if(typeof value==='string'){let c=0,n=0;try{c=JSON.parse(aoSecretCache).updatedAt||0;}catch{}try{n=JSON.parse(value).updatedAt||0;}catch{}if(force||n>=c)aoSecretCache=value;}return aoSecretCache;}
function aoAdoptSecret(value){let next,cur;try{next=JSON.parse(value);cur=JSON.parse(aoSecretCache||'{}');}catch{return;}if(!Number.isSafeInteger(next.updatedAt)||next.updatedAt<=Number(cur.updatedAt||0))return;aoSecretCache=value;aoSecretCall('adopt',value).then(ok=>aoRefreshSecret(ok!==true));}
setTimeout(()=>aoRefreshSecret().then(()=>{if(typeof syServe==='function')syServe();}),0);

const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7.500" height="7.500" rx="2"/><rect x="13.500" y="3" width="7.500" height="7.500" rx="2"/><rect x="3" y="13.500" width="7.500" height="7.500" rx="2"/><rect x="13.500" y="13.500" width="7.500" height="7.500" rx="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.500-6 8-6s7 2 8 6"/>',
  heart: '<path d="M12 20s-7-4.400-9-9.200C1.800 7.400 4 4 7.300 4c1.900 0 3.400 1 4.700 2.800C13.300 5 14.800 4 16.700 4 20 4 22.200 7.400 21 10.800 19 15.600 12 20 12 20z"/>',
  play: '<path d="M7 4.500v15l13-7.500z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  sync: '<path d="M4 12a8 8 0 0 1 13.700-5.600L20 8.500M20 4v4.500h-4.500M20 12a8 8 0 0 1-13.700 5.600L4 15.500M4 20v-4.500h4.500"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.500-5.800M20 4v5h-5"/>',
  restart: '<path d="M4 12a8 8 0 1 1 2.500 5.800M4 20v-5h5"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M9.5 3v8a2.5 2.5 0 0 0 5 0V3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
const ico = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${ICONS[n]}</svg>`;
const TYPES = { 1: 'Фильм', 2: 'Мультфильм', 3: 'Сериал', 4: 'ТВ-шоу', 5: 'Мультсериал', 6: 'Аниме-фильм', 7: 'Аниме-сериал' };
const CATS = [['films', 'Фильмы'], ['series', 'Сериалы'], ['anime_series,anime_films', 'Аниме'], ['cartoons,cartoon_series', 'Мультфильмы'], ['tvshows', 'ТВ-шоу']];
const SORTS = [['popular', 'Популярное'], ['new', 'Новинки'], ['kp', 'Кинопоиск'], ['imdb', 'IMDb']];

/* ---------- хранилище ---------- */
const LS = 'luma.m';
let S = { favs: [], history: [], progress: {}, seen: {}, done: {}, gone: {}, secrets: {}, extra: {} };
try { S = { ...S, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch {}
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} try { if (S.group && NATIVE && NATIVE.syncUpdate) NATIVE.syncUpdate(exportJson()); } catch {} try { if(typeof mobileSyncReminders==='function')mobileSyncReminders(); } catch {} }, 250); };

/* ---------- API (несколько зеркал, пробуем по очереди) ---------- */
const cache = new Map();
const HOSTS = ['api.liftw.ws', 'api.embandr.ws', 'api.niteface.ws', 'api.faphz.com', 'api.lateremb.ws'];
let hostI = 0;
async function api(p, ttl = 120000) {
  const c = cache.get(p);
  if (c && Date.now() - c.t < ttl) return c.v;
  let err;
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < HOSTS.length; k++) {
      const i = (hostI + k) % HOSTS.length;
      try {
        const r = await fetch('https://' + HOSTS[i] + p);
        if (!r.ok) { if (r.status < 500 && r.status !== 429) throw Object.assign(new Error('HTTP ' + r.status), { final: true }); throw new Error('HTTP ' + r.status); }
        const v = await r.json(); cache.set(p, { t: Date.now(), v }); hostI = i; return v;
      } catch (e) { err = e; if (e.final) throw e; }
    }
    await wait(500);
  }
  throw err;
}
async function catalog({ cat = 'films', page = 1, limit = 20, sort = 'popular', last = false, genre = '' } = {}) {
  const q = new URLSearchParams({ category: cat, page, limit });
  if (last || sort === 'new') q.set('last', 'true'); else q.set('sort', sort);
  if (genre) q.set('genre', genre);
  const r = await api('/list/categories?' + q);
  return Array.isArray(r) ? r : (r.items || []);
}
async function catalogBatchInfo(ids){let last;for(let k=0;k<HOSTS.length;k++){const i=(hostI+k)%HOSTS.length;try{const response=await fetch('https://'+HOSTS[i]+'/info/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});if(!response.ok)throw Error('HTTP '+response.status);hostI=i;return await response.json();}catch(e){last=e;}}throw last||Error('Нет связи');}
const info = (id) => api('/info/' + id, 600000);
const search = async (q) => (await api('/search?q=' + encodeURIComponent(q), 60000)).items || [];
function seasonsOf(d) {
  const e = d.episodes; if (!e || typeof e !== 'object') return [];
  return Object.keys(e).sort((a, b) => a - b).map((k) => ({ season: k, episodes: [...new Map([...e[k]].map((episode) => [String(episode), episode])).values()].sort((a, b) => a - b) }));
}

/* ---------- данные пользователя ---------- */
const brief = (it) => ({ id: it.id, type: it.type, name: it.name, origin_name: it.origin_name, poster: it.poster, year: it.year, kp_rating: it.kp_rating ?? it.kp, imdb_rating: it.imdb_rating ?? it.imdb, quality: it.quality });
const goneMark = (k, id) => { S.gone = S.gone || {};const key=k+':'+id,items=k==='h'?S.history:k==='f'?S.favs:[],field=k==='h'?'ts':'at',times=(items||[]).filter(x=>String(x.id)===String(id)).map(x=>Number(x[field])||0);if(k==='h')for(const [progressKey,progress] of Object.entries(S.progress||{})){const base=progressKey.replace(/^(?:vk|rutube)~[^~]+~/,'');if(base===String(id)||base.startsWith(String(id)+':'))times.push(Number(progress?.ts)||0);}const latest=Math.max(0,...times);S.gone[key]=Math.max(Date.now(),latest+1,Number(S.gone[key]||0)+1); };
const isFav = (id) => S.favs.some((f) => String(f.id) === String(id));
function toggleFav(it) {
  if (isFav(it.id)) { const at=Math.max(0,...S.favs.filter(f=>String(f.id)===String(it.id)).map(f=>Number(f.at)||0));S.favs = S.favs.filter((f) => String(f.id) !== String(it.id)); S.gone ||= {};S.gone['f:'+it.id]=Math.max(Date.now(),at+1,Number(S.gone['f:'+it.id]||0)+1); toast('Убрано из избранного'); }
  else { S.favs.unshift({ ...brief(it), at: Math.max(Date.now(),Number(S.gone?.['f:'+it.id]||0)+1) }); toast('Добавлено в избранное'); }
  save(); if(tab==='mine'&&typeof PG!=='undefined'&&PG.length)mobileLibraryDirty=true; return isFav(it.id);
}
function addHistory(it, season, episode) {
  const previous = Math.max(0, ...S.history.filter((h) => String(h.id) === String(it.id)).map((h) => Number(h.ts) || 0));
  S.history = S.history.filter((h) => String(h.id) !== String(it.id));
  S.history.unshift({ ...brief(it), season, episode, ts: Math.max(Date.now(), previous + 1, Number(S.gone?.['h:'+it.id]||0)+1) });
  S.history = S.history.slice(0, 60);
  if (season) { const k = it.id + ':' + season; (S.seen[k] = S.seen[k] || []); if (!S.seen[k].includes(String(episode))) S.seen[k].push(String(episode)); }
  save();
}
const progKey = (id, season, episode) => (season ? `${id}:${season}:${episode}` : String(id));
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function resumeInfo(id, season, episode) { const p = S.progress[progKey(id, season, episode)]; return p && p.t >= 10 && p.d && p.t < p.d - 45 ? p : null; }
const progressPct = (id, season, episode) => { const p = resumeInfo(id, season, episode); return p ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0; };
const isDone = (id, season, episode) => (S.done[id + ':' + season] || []).includes(String(episode));
function markDone(key) {
  const m = /^(.+):([^:]+):([^:]+)$/.exec(String(key).replace(/^(?:vk|rutube)~[^~]+~/,'')); if (!m) return;
  const k = m[1] + ':' + m[2], a = (S.done[k] = S.done[k] || []);
  if (!a.includes(m[3])) a.push(m[3]);
}
function storeProgress(key, t, d) {
  if (!key || !isFinite(t) || !isFinite(d) || d < 120) return;
  if (t > d - 45) { delete S.progress[key]; markDone(key); }
  else if (t >= 5) S.progress[key] = { t: Math.floor(t), d: Math.floor(d), ts: Math.max(Date.now(), Number(S.progress[key]?.ts || 0) + 1) };
  else return;
  const keys = Object.keys(S.progress);
  if (keys.length > 400) keys.sort((x, y) => (S.progress[x].ts || 0) - (S.progress[y].ts || 0)).slice(0, keys.length - 400).forEach((k) => delete S.progress[k]);
  save();
}

/* ---------- мелочи интерфейса ---------- */
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.classList.remove('q'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
// тихий тост фоновой синхронизации: маленький, в углу и никогда во время просмотра
function toastSync(msg) {
  if ((typeof NP !== 'undefined' && NP.on) || (typeof TVD !== 'undefined' && TVD.cur)) return;
  const t = $('#toast'); t.textContent = msg; t.classList.add('q'); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.classList.remove('q'), 350); }, 2400);
}
const ratingOf = (it) => { const r = Number(it.kp_rating ?? it.kp) || Number(it.imdb_rating ?? it.imdb) || 0; return r > 0 ? r.toFixed(1) : ''; };
const poster = (it, cls = '') => `<img class="${cls}" loading="lazy" decoding="async" src="${esc(it.poster || '')}" alt="" onerror="this.remove()">`;
function card(it) {
  const r = ratingOf(it);
  return `<button class="card" data-id="${it.id}"><div class="pos"><i>${esc([...(it.name || '?')][0])}</i>${poster(it)}${it.quality ? `<span class="bd q">${esc(it.quality)}</span>` : ''}${r ? `<span class="bd r">${r}</span>` : ''}</div><b>${esc(it.name)}</b><span class="m">${[it.year, TYPES[it.type]].filter(Boolean).join(' · ')}</span></button>`;
}
function contCard(h) {
  const sourceId=h.source==='vk'?h.vkId:h.source==='rutube'?h.rutubeId:'', sourceProgress=sourceId?resumeInfo(mobileSourceProgressKey(h.source,sourceId,h.id,h.season,h.episode)):null;
  const pct = (h.source==='vk'||h.source==='rutube') ? (sourceProgress ? Math.min(100,Math.round(sourceProgress.t/sourceProgress.d*100)) : 0) : h.season ? progressPct(h.id, h.season, h.episode) : progressPct(h.id);
  const left = h.season ? `Сезон ${h.season} · Серия ${h.episode}` : [h.year, TYPES[h.type]].filter(Boolean).join(' · ');
  return `<button class="cw" data-id="${h.id}" data-play="1">${poster(h)}<span class="pl">${ico('play')}</span><div class="t"><b>${esc(h.name)}</b><span>${esc(left)}</span></div><div class="pb"><i style="width:${pct}%"></i></div></button>`;
}
function secHtml(title, inner, more = '') { return `<section class="sec"><h2>${esc(title)}${more}</h2>${inner}</section>`; }
const rowOf = (items) => `<div class="row">${items.map(card).join('')}</div>`;
const skeleton = () => '<div class="sk"></div><div class="sk"></div><div class="sk"></div>';

/* ---------- вкладки ---------- */
const TABS = [['home', 'Главная', 'home'], ['cat', 'Каталог', 'grid'], ['tv', 'ТВ', 'tv'], ['search', 'Поиск', 'search'], ['mine', 'Моё', 'user']];
let tab = 'home', scrollPos = {}, token = 0;
function buildTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${ico(i)}<span>${l}</span></button>`).join('');
  $$('#tabs button').forEach((b) => (b.onclick = () => { if (b.dataset.t === tab) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; } switchTab(b.dataset.t); }));
}
function switchTab(k, top) {
  scrollPos[tab] = $('#view').scrollTop; tab = k; buildTabs();
  renderTab(); $('#view').scrollTop = top ? 0 : (scrollPos[k] || 0);
}
function renderTab() { const t = ++token; ({ home: renderHome, cat: renderCat, tv: renderTv, search: renderSearch, mine: renderMine })[tab](t); }
const alive = (t) => t === token;

/* ---------- главная ---------- */
const sec = (id, title) => `<section class="sec" id="${id}" hidden><h2>${esc(title)}</h2><div class="row"></div></section>`;
function fillRow(id, items, opts = {}) {
  const box = $('#' + id); if (!box) return;
  if (!items || !items.length) { box.hidden = true; return; }
  box.hidden = false;
  $('.row', box).innerHTML = items.map((x) => (opts.cont ? contCard(x) : card(x))).join('');
}
const freshOf = (d, back) => { const y = new Date().getFullYear(); let r = d.filter((x) => +x.year >= y - back); if (r.length < 6) r = d.filter((x) => +x.year >= y - back - 3); return (r.length >= 6 ? r : d).slice(0, 20); };
function heroHtml(items) {
  return `<div class="hero" id="hero">${items.map((h, i) => {
    const it = h.it, img = h.alt ? TMI(h.alt, 'w780') : (h.bd ? TMI(h.bd, 'w780') : it.poster), wide = h.bd ? TMI(h.bd, 'w1280') : '';
    const meta = [it.year, ...(h.genres || []).slice(0, 2), ratingOf(it) && '★ ' + ratingOf(it)].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
    return `<button class="hb" data-id="${it.id}"><picture>${wide ? `<source media="(orientation:landscape)" srcset="${esc(wide)}">` : ''}<img src="${esc(img)}" alt="" ${i ? 'loading="lazy"' : ''} onerror="this.remove()"></picture><div class="t"><div class="tag">${esc(h.tag || '★ В тренде')}</div><h3>${esc(it.name)}</h3><div class="hm">${meta}</div><span class="go">${ico('play')} Смотреть</span></div></button>`;
  }).join('')}</div><div class="dots" id="hdots">${items.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`;
}
async function renderHome(t) {
  const view = $('#view'); view.onscroll = null;
  const hist = S.history.slice(0, 20);
  const head = `<div class="top"><div class="logo">${LOGO}</div><h1>Luma</h1></div>`;
  view.innerHTML = head + '<div id="heroBox"><div class="sk hs"></div></div>' + (hist.length ? sec('rCont', 'Продолжить просмотр') : '') + mobilePlatformStrip() + sec('tm0', 'В тренде на этой неделе') + sec('rNew', 'Новинки кино') + sec('tm1', 'Сериалы в тренде') + sec('rSer', 'Новые сериалы') + sec('tm2', 'Сейчас в кино') + sec('rTop', 'Лучшее по Кинопоиску') + sec('tm3', 'Лучшие фильмы всех времён') + sec('rCar', 'Мультфильмы') + sec('rAni', 'Аниме') + sec('rShow', 'ТВ-шоу') + sec('tm4', 'Скоро выйдут');
  if (hist.length) fillRow('rCont', hist, { cont: true });
  const load = (id, o, back) => catalog({ limit: back ? 60 : 20, ...o }).then((d) => { if (back) d = freshOf(d, back); if (alive(t)) fillRow(id, d); return d; }).catch(() => { if (alive(t)) fillRow(id, []); return []; });
  const lift = [load('rNew', { cat: 'films', last: true }, 1), load('rSer', { cat: 'series', last: true }, 2), load('rTop', { cat: 'films', sort: 'kp' }), load('rCar', { cat: 'cartoons,cartoon_series' }), load('rAni', { cat: 'anime_series,anime_films' }), load('rShow', { cat: 'tvshows' })];
  // баннер: тренды TMDB; при сбое — новинки каталога
  (async () => {
    let items = null;
    try {
      const j = await tmdb('/trending/movie/week', {});
      const picks = (j.results || []).filter((x) => x.backdrop_path).slice(0, 8);
      const got = (await Promise.all(picks.map(async (x) => { const it = await tmMatchCached(x, 'movie'); return it ? { it, alt: x.poster_path || '', bd: x.backdrop_path, genres: (x.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean) } : null; }))).filter(Boolean);
      if (got.length >= 3) items = got;
    } catch {}
    if (!items) { const d = await lift[0]; items = (d || []).filter((x) => x.poster).slice(0, 6).map((it) => ({ it, tag: 'Новинка' })); }
    if (!alive(t)) return;
    const box = $('#heroBox'); if (!box) return;
    if (!items.length) { box.innerHTML = '<div class="empty"><h3>Не удалось загрузить рекомендации</h3><p>Проверьте подключение и попробуйте ещё раз.</p><button class="btn" data-home-retry>Повторить</button></div>'; box.querySelector('[data-home-retry]').onclick = () => { if (tab === 'home') renderTab(); }; return; }
    box.innerHTML = heroHtml(items);
    const hero = $('#hero'), dots = $$('#hdots i');
    hero.onscroll = () => { const i = Math.round(hero.scrollLeft / (hero.firstElementChild.offsetWidth + 12)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  })();
  const rows = [['tm0', '/trending/movie/week', {}, 'movie'], ['tm1', '/trending/tv/week', {}, 'tv'], ['tm2', '/movie/now_playing', { region: 'RU' }, 'movie'], ['tm3', '/movie/top_rated', {}, 'movie'], ['tm4', '/movie/upcoming', { region: 'RU' }, 'movie']];
  homeHoliday(t);
  (async () => { for (const [id, p, q, k] of rows) { try { const r = await tmRow(p, q, k); if (alive(t)) fillRow(id, r.map((x) => x.it)); } catch {} } })();
}

/* ---------- каталог ---------- */
const GENRES = ['Боевик','Комедия','Драма','Триллер','Фантастика','Ужасы','Детектив','Фэнтези','Мелодрама','Приключения','Криминал','Семейный','Биография','Военный','История','Документальный','Музыка','Мюзикл','Спорт','Вестерн','Детский','Мультфильм'];
let catState = { cat: 0, sort: 0, genre: '', page: 1, busy: false, end: false };
function mobileCatSort(){const s=openSheet(`<h3>Сортировка</h3><p class="sub">Как расположить тайтлы в каталоге.</p><div class="ao-genre-list">${SORTS.map((x,i)=>`<button class="chip ${catState.sort===i?'on':''}" data-cat-sort="${i}">${esc(x[1])}</button>`).join('')}</div>`);s.addEventListener('click',e=>{const b=e.target.closest('[data-cat-sort]');if(!b)return;catState.sort=Number(b.dataset.catSort);closeSheet();renderTab();});}
function mobileCatGenres(){if(catState.cat===2){openAoMobileGenres([],genres=>openAoMobileGenreResults(genres));return;}const selected=new Set(String(catState.genre||'').split(',').filter(Boolean));const genres=[...new Set([...selected,...GENRES])];const s=openSheet(`<h3>Жанры</h3><p class="sub">Можно выбрать несколько жанров.</p><div class="ao-genre-list">${genres.map((g,i)=>`<button class="chip ${selected.has(g)?'on':''}" data-cat-genre="${i}" aria-pressed="${selected.has(g)}">${esc(g)}</button>`).join('')}</div><div class="dbtns"><button class="btn" data-cat-reset>Сбросить</button><button class="btn primary" data-cat-apply>Показать</button></div>`);s.addEventListener('click',e=>{const b=e.target.closest('[data-cat-genre]');if(b){const g=genres[Number(b.dataset.catGenre)];if(selected.has(g))selected.delete(g);else selected.add(g);b.classList.toggle('on',selected.has(g));b.setAttribute('aria-pressed',String(selected.has(g)));return;}if(e.target.closest('[data-cat-reset]')){selected.clear();s.querySelectorAll('[data-cat-genre]').forEach(x=>{x.classList.remove('on');x.setAttribute('aria-pressed','false');});return;}if(e.target.closest('[data-cat-apply]')){catState.genre=[...selected].join(',');closeSheet();renderTab();}});}
async function mobileCatalogCollections(t,kind){
  const jobs=[['Популярно сейчас','/trending/'+kind+'/day',{}],['На этой неделе','/trending/'+kind+'/week',{}],['Высоко оценены','/'+kind+'/top_rated',{}]],results=await Promise.allSettled(jobs.map(([,path,params])=>tmRow(path,params,kind)));if(!alive(t)||tab!=='cat')return;const host=$('#catCollections');if(!host)return;const seen=new Set();let html='';for(let i=0;i<jobs.length;i++){if(results[i].status!=='fulfilled')continue;const list=[];for(const x of results[i].value){const item=x.it,key=String(item?.id||'');if(!key||seen.has(key))continue;list.push(item);if(list.length>=12)break;}if(list.length<4)continue;list.forEach(x=>seen.add(String(x.id)));html+=`<section class="sec mobile-cat-collection"><h2>${esc(jobs[i][0])}</h2><div class="row">${list.map(card).join('')}</div></section>`;}const view=$('#view'),scrollTop=view?.scrollTop||0,anchor=scrollTop>0?$$('#cg .card').find(c=>!seen.has(String(c.dataset.id))&&c.getBoundingClientRect().bottom>(view?.getBoundingClientRect().top||0)):null,oldTop=anchor?.getBoundingClientRect().top;catState.highlightIds=seen;$$('#cg .card').forEach(c=>{if(seen.has(String(c.dataset.id)))c.remove();});host.innerHTML=html;if(anchor&&view&&Number.isFinite(oldTop))view.scrollTop+=anchor.getBoundingClientRect().top-oldTop;if(!$('#cg .card')&&!catState.end&&!catState.busy&&!catState.blocked)requestAnimationFrame(()=>{if(alive(t))loadMore(t);});
}
async function renderCat(t) {
  const view = $('#view');
  const chosen=String(catState.genre||'').split(',').filter(Boolean),genreLabel=chosen.length?chosen.slice(0,2).join(' · ')+(chosen.length>2?' +'+(chosen.length-2):''):'Все жанры';
  view.innerHTML = `<div class="mobile-catalog-head"><span>КАТАЛОГ LUMA</span><div><h1>Каталог</h1><button class="mobile-catalog-lists" id="openLists">${ico('list')} Подборки</button></div><p>Фильмы, сериалы и истории на любой вечер.</p></div><div class="chips mobile-catalog-categories" id="cc">${CATS.map(([, l], i) => `<button class="chip ${i === catState.cat ? 'on' : ''}" data-c="${i}">${l}</button>`).join('')}<button class="chip" data-mobile-sport>Спорт</button></div>
    <div class="mobile-catalog-filters"><button data-cat-sort-open><small>Сортировка</small><b>${esc(SORTS[catState.sort][1])}</b><i>⌄</i></button><button data-cat-genres-open><small>${catState.cat===2?'Жанры AnimeOn':'Жанры'}</small><b>${esc(catState.cat===2?'Все жанры':genreLabel)}</b><i>⌄</i></button></div>
    <div id="catCollections"></div><div class="grid" id="cg"></div><div id="cm"></div>`;
  catState.page = 1; catState.end = false; catState.busy = false;catState.blocked=false;catState.highlightIds=new Set();catState.catalogSeen=new Set();
  if(!chosen.length&&catState.sort===0&&(catState.cat===0||catState.cat===1))mobileCatalogCollections(t,catState.cat===0?'movie':'tv').catch(()=>{});
  $('#openLists').onclick = openLists;
  $('[data-mobile-sport]',view).onclick=openMobileSport;
  if (catState.cat === 2) {
    $('.mobile-catalog-filters',view).insertAdjacentHTML('afterend', '<div class="ao-mobile-entry"><button class="ao-mobile-entry-button" id="openAnimeOn"><span><b>AnimeOn</b><small>Онгоинги, рейтинги и подборки</small></span><i>›</i></button></div>');
    $('#openAnimeOn').onclick = openAoMobileCatalog;
  }
  if(catState.cat===4){$('.mobile-catalog-filters',view).insertAdjacentHTML('afterend','<div class="ao-mobile-entry"><button class="ao-mobile-entry-button" id="openMobileShows"><span><b>Шоу Rutube и VK Видео</b><small>Поиск программ и выпусков</small></span><i>›</i></button></div>');$('#openMobileShows').onclick=()=>openMobileShows();}
  $('#cc').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { catState.cat = +b.dataset.c; renderTab(); } };
  $('[data-cat-sort-open]',view).onclick=mobileCatSort;
  $('[data-cat-genres-open]',view).onclick=mobileCatGenres;
  view.onscroll = () => { if (tab === 'cat' && view.scrollTop + view.clientHeight > view.scrollHeight - 700) loadMore(t); };
  await loadMore(t);
}
async function loadMore(t) {
  if (catState.busy || catState.end || catState.blocked || !alive(t)) return;
  catState.busy = true;let added=0;
  try {
    const wanted=String(catState.genre||'').split(',').filter(Boolean),localOnly=['биография','история','спорт'].includes(String(wanted[0]||'').toLocaleLowerCase('ru-RU'));let attempts=0;
    $('#cm').innerHTML='<div class="mobile-cat-loading"><div class="spin"></div></div>';
    while(!catState.end&&added<12&&attempts++<8){
      let items=await catalog({cat:CATS[catState.cat][0],sort:SORTS[catState.sort][0],page:catState.page,limit:24,genre:wanted.length&&!localOnly?wanted[0]:''});
      if(!alive(t))return;
      if(!items.length){catState.end=true;break;}
      if(wanted.length>1||localOnly){const batch=await catalogBatchInfo(items.map(x=>String(x.id)));if(!alive(t))return;const byId=new Map((batch.items||[]).map(x=>[String(x.id),x]));if(items.some(x=>!Array.isArray(byId.get(String(x.id))?.info?.genre)))throw Error('Жанры недоступны');const norm=x=>String(x).trim().toLocaleLowerCase('ru-RU'),required=wanted.map(norm);items=items.filter(x=>{const genres=byId.get(String(x.id)).info.genre.map(norm);return required.every(g=>genres.includes(g));});}
      catState.page++;items=items.filter(it=>{const id=String(it.id);if(catState.catalogSeen.has(id)||catState.highlightIds.has(id))return false;catState.catalogSeen.add(id);return true;});if(items.length){$('#cg').insertAdjacentHTML('beforeend',items.map(card).join(''));added+=items.length;}
    }
    $('#cm').innerHTML='';const hasCards=!!$('#cg .card');if(!hasCards&&catState.end)$('#cm').innerHTML='<div class="empty"><h3>Ничего не найдено</h3><p>Попробуйте другие жанры.</p></div>';else if(!catState.end&&added===0){catState.blocked=true;$('#cm').innerHTML='<div class="empty"><h3>В просмотренных страницах совпадений нет</h3><button class="btn" data-cat-retry>Искать дальше</button></div>';}
  } catch { if (alive(t)) {catState.blocked=true;$('#cm').innerHTML = '<div class="empty"><h3>Не удалось загрузить каталог</h3><button class="btn" data-cat-retry>Повторить</button></div>'; } }
  finally{if(alive(t)){catState.busy=false;$('#cm [data-cat-retry]')?.addEventListener('click',()=>{catState.blocked=false;loadMore(t);});const view=$('#view');if(added>0&&!catState.end&&!catState.blocked&&view&&view.scrollTop+view.clientHeight>view.scrollHeight-700)requestAnimationFrame(()=>{if(alive(t))loadMore(t);});}}
}

/* ---------- поиск ---------- */
let lastQ = '', searchT = 0;
function renderSearch(t) {
  const view = $('#view');
  view.innerHTML = `<div class="mobile-catalog-head mobile-search-head"><span>ПОИСК В LUMA</span><div><h1>Поиск</h1></div><p>Фильмы, сериалы, аниме и люди.</p></div><label class="sbox">${ico('search')}<input id="q" placeholder="Название или имя" autocomplete="off" enterkeyhint="search" value="${esc(lastQ)}"></label><div id="sr"></div>`;
  view.onscroll = null;
  const q=$('#q'),host=$('#sr');let seq=0,retrySection=null;
  const run=()=>{const v=q.value.trim(),current=++seq;lastQ=v;if(v.length<2){host.innerHTML='<div class="mobile-search-empty"><span>⌕</span><b>Что будем смотреть?</b><p>Введите название фильма, сериала, аниме или имя человека.</p></div>';return;}
    const sections=[{id:'titles',label:'Фильмы и сериалы',load:()=>search(v),render:items=>`<div class="grid">${items.map(card).join('')}</div>`},{id:'anime',label:'Аниме · AnimeOn',load:()=>aoMobileSearch(v),render:items=>`<div class="grid">${items.map(card).join('')}</div>`},{id:'people',label:'Люди',load:()=>peopleSearch(v),render:items=>`<div class="people" id="pplRow">${items.map(x=>`<button class="person" data-tm="${esc(x.id)}"><div class="pha">${x.photo?`<img loading="lazy" src="${esc(x.photo)}" alt="" onerror="this.remove()">`:''}<span>${esc([...(x.name||'?')][0])}</span></div><b>${esc(x.name)}</b><small>${esc(x.dept)}</small></button>`).join('')}</div>`}];
    host.innerHTML=sections.map(x=>`<section class="mobile-search-section" data-search-section="${x.id}"><h3 class="ph3">${x.label}</h3><div class="mobile-search-state">Загружаем…</div></section>`).join('');
    const pending=new Set();
    const loadPart=part=>{if(pending.has(part.id)||!alive(t)||current!==seq||q.value.trim()!==v)return;const el=host.querySelector(`[data-search-section="${part.id}"]`);if(!el)return;pending.add(part.id);el.innerHTML=`<h3 class="ph3">${part.label}</h3><div class="mobile-search-state">Загружаем…</div>`;Promise.resolve().then(part.load).then(items=>{if(!alive(t)||current!==seq||q.value.trim()!==v)return;const old=el.getBoundingClientRect(),top=view.getBoundingClientRect().top;el.innerHTML=`<h3 class="ph3">${part.label}</h3>${Array.isArray(items)&&items.length?part.render(items):'<p class="mobile-search-state">Ничего не найдено</p>'}`;if(old.bottom<=top)view.scrollTop+=el.getBoundingClientRect().height-old.height;}).catch(()=>{if(!alive(t)||current!==seq||q.value.trim()!==v)return;el.innerHTML=`<h3 class="ph3">${part.label}</h3><div class="mobile-search-state">Источник временно недоступен <button class="mobile-search-retry" data-search-retry="${part.id}">Повторить</button></div>`;}).finally(()=>pending.delete(part.id));};
    retrySection=id=>{const part=sections.find(x=>x.id===id);if(part)loadPart(part);};sections.forEach(loadPart);
  };
  host.onclick=e=>{const retry=e.target.closest('[data-search-retry]');if(retry){retrySection?.(retry.dataset.searchRetry);return;}const person=e.target.closest('#pplRow .person');if(person)openPerson({tmdb:person.dataset.tm});};
  q.oninput=()=>{seq++;clearTimeout(searchT);searchT=setTimeout(run,380);};
  q.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchT);q.blur();run();}};
  if(lastQ)run();else{run();setTimeout(()=>{if(alive(t)&&tab==='search'&&!q.value)q.focus();},150);}
}

/* ---------- моё ---------- */
function mobileLibraryHistoryInfo(h){const sourceId=h.source==='vk'?h.vkId:h.source==='rutube'?h.rutubeId:'',p=(h.source==='vk'||h.source==='rutube')?(sourceId?resumeInfo(mobileSourceProgressKey(h.source,sourceId,h.id,h.season,h.episode)):null):resumeInfo(h.id,h.season,h.episode),source=h.source==='vk'?'VK Видео':h.source==='rutube'?'Rutube':String(h.id).startsWith('ao:')?'AnimeOn':'',parts=[h.season&&h.episode?h.season+' сезон · '+h.episode+' серия':'',source].filter(Boolean),pct=p?Math.max(0,Math.min(100,Math.round(p.t/p.d*100))):0;return parts.length||pct?`<div class="mobile-library-history">${parts.length?`<small>${esc(parts.join(' · '))}</small>`:''}${pct?`<div class="mobile-library-progress" aria-label="Просмотрено ${pct}%"><i style="width:${pct}%"></i></div>`:''}</div>`:'';}
let mineTab = 'favs', mobileLibraryDirty = false;
function mobileLibraryRefreshIfNeeded(){if(!mobileLibraryDirty||tab!=='mine')return;mobileLibraryDirty=false;const view=$('#view'),top=view?.scrollTop||0;renderTab();if(view)view.scrollTop=top;}
function renderMine(t) {
  const view = $('#view'); view.onscroll = null;
  const list = mineTab === 'favs' ? S.favs : S.history;
  const body = mineTab === 'set' ? `<div style="padding:0 16px">${settingsHtml()}</div>`
    : list.length ? `<div class="grid mobile-library-grid">${list.map(it=>`<div class="mobile-library-card">${card(it)}${mineTab==='hist'?mobileLibraryHistoryInfo(it):''}<button class="mobile-library-menu" data-library-options="${esc(it.id)}" aria-label="Действия: ${esc(it.name)}">⋯</button></div>`).join('')}</div>` : `<div class="empty"><h3>${mineTab === 'favs' ? 'Пока пусто' : 'История пуста'}</h3><p>${mineTab === 'favs' ? 'Нажмите ♥ на странице фильма, чтобы он появился здесь.' : 'Здесь будет всё, что вы смотрели.'}</p></div>`;
  view.innerHTML = `<div class="mobile-catalog-head mobile-mine-head"><span>ВАША БИБЛИОТЕКА</span><div><h1>Моё</h1></div><p>Избранное, история и настройки Luma.</p></div><div class="chips mobile-mine-tabs" id="mt"><button class="chip ${mineTab === 'favs' ? 'on' : ''}" data-m="favs">Избранное</button><button class="chip ${mineTab === 'hist' ? 'on' : ''}" data-m="hist">История</button><button class="chip ${mineTab === 'set' ? 'on' : ''}" data-m="set">Настройки</button></div><div id="mb" class="${mineTab==='set'?'mobile-settings':''}">${body}</div>`;
  $('#mt').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { mineTab = b.dataset.m; renderTab(); } };
  $('#mb').addEventListener('click',e=>{const b=e.target.closest('[data-library-options]');if(!b)return;const kind=mineTab,id=b.dataset.libraryOptions,it=(kind==='favs'?S.favs:S.history).find(x=>String(x.id)===id);if(!it)return;const label=kind==='favs'?'Убрать из избранного':'Убрать из истории',sheet=openSheet(`<h3>${esc(it.name)}</h3><p class="sub">${kind==='favs'?'Удалить этот тайтл из избранного?':'Удалить эту запись из истории? Прогресс просмотра сохранится.'}</p><div class="dbtns"><button class="btn" data-library-cancel>Отмена</button><button class="btn primary" data-library-remove aria-label="${label}">Убрать</button></div>`);$('[data-library-cancel]',sheet).onclick=closeSheet;$('[data-library-remove]',sheet).onclick=()=>{if(kind==='favs')toggleFav(it);else{goneMark('h',it.id);S.history=S.history.filter(x=>String(x.id)!==id);save();toast('Убрано из истории');}closeSheet();if(tab==='mine'&&mineTab===kind)renderTab();};});
  if (mineTab === 'set') bindSettings($('#mb'));
}

/* ---------- долгое нажатие на «Продолжить просмотр»: убрать из списка ---------- */
(() => {
  let tm = 0, held = false, heldCard = null, sx = 0, sy = 0;
  const cancel = () => clearTimeout(tm);
  document.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.cw'); if (!c) return;
    held = false; heldCard = null; sx = e.clientX; sy = e.clientY;
    tm = setTimeout(() => {
      held = true; heldCard = c; c.classList.add('held');
      const raw=c.dataset.id,id=/^(?:ao|vk|rutube):/.test(raw)?raw:Number(raw),h=S.history.find(x=>String(x.id)===String(id)); if (!h) return;
      const sh = openSheet(`<h3>${esc(h.name)}</h3><p class="sub">Убрать из списка «Продолжить просмотр»?</p><div class="dbtns"><button class="btn primary" id="hdel">Убрать</button><button class="btn" id="hno">Отмена</button></div>`);
      $('#hno', sh).onclick = closeSheet;
      $('#hdel', sh).onclick = () => { goneMark('h', id); S.history = S.history.filter(x=>String(x.id)!==String(id)); save(); closeSheet(); toast('Убрано из списка'); if (tab === 'home') renderTab(); };
    }, 550);
  });
  document.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel(); });
  document.addEventListener('pointerup', cancel); document.addEventListener('pointercancel', cancel);
  document.addEventListener('click', e => { if(!held)return;const same=e.target.closest('.cw')===heldCard;held=false;heldCard=null;if(same){e.stopPropagation();e.preventDefault();} }, true);
})();

/* ---------- нажатия ---------- */
document.addEventListener('click', (e) => {
  const c = e.target.closest('.card, .hb, .cw'); if (!c || !c.dataset.id) return;
  if (c.dataset.id.startsWith('ao:')) { openAoMobileDetails(c.dataset.id.slice(3),{autoplay:!!c.dataset.play}); return; }
  if (/^(?:vk|rutube):/.test(c.dataset.id)){const h=S.history.find(x=>String(x.id)===c.dataset.id),provider=h?.source,videoId=provider==='vk'?h.vkId:provider==='rutube'?h.rutubeId:'';if(provider&&videoId)playMobileSource(provider,h,null,null,{id:videoId,title:h.name});return;}
  openDetails(+c.dataset.id, { autoplay: !!c.dataset.play });
});

/* ---------- кнопка «Назад» ---------- */
window.lumaBack = () => {
  if (window.npBack && window.npBack()) return true;
  if (window.sheetBack && window.sheetBack()) return true;
  if (PG.length) { popPage(); return true; }
  if (tab !== 'home') { switchTab('home'); return true; }
  return false;
};
window.lumaOpen = (id, play) => { try { openDetails(+id, { autoplay: !!play }); } catch {} };   // luma://open?id=123&play=1
window.lumaPause = () => { try { if (window.npPauseIfPlaying) window.npPauseIfPlaying(); } catch {} };

addEventListener('DOMContentLoaded', () => {
  buildTabs(); renderTab();
  try { const l = NATIVE && NATIVE.takeLink(); if (l) { const [id, p] = l.split(','); setTimeout(() => window.lumaOpen(id, p === '1'), 300); } } catch {}
});
