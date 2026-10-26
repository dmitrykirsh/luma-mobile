'use strict';
/* Luma для телефона: главная, каталог, поиск, «Моё», страница фильма. Плеер — в player.js. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NATIVE = typeof Native !== 'undefined' ? Native : null;

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
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>'
};
const ico = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${ICONS[n]}</svg>`;
const TYPES = { 1: 'Фильм', 2: 'Мультфильм', 3: 'Сериал', 4: 'ТВ-шоу', 5: 'Мультсериал', 6: 'Аниме-фильм', 7: 'Аниме-сериал' };
const CATS = [['films', 'Фильмы'], ['series', 'Сериалы'], ['anime_series,anime_films', 'Аниме'], ['cartoons,cartoon_series', 'Мультфильмы'], ['tvshows', 'ТВ-шоу']];
const SORTS = [['popular', 'Популярное'], ['new', 'Новинки'], ['kp', 'Кинопоиск'], ['imdb', 'IMDb']];

/* ---------- хранилище ---------- */
const LS = 'luma.m';
let S = { favs: [], history: [], progress: {}, seen: {}, done: {} };
try { S = { ...S, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch {}
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} }, 250); };

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
async function catalog({ cat = 'films', page = 1, limit = 20, sort = 'popular', last = false } = {}) {
  const q = new URLSearchParams({ category: cat, page, limit, sort });
  if (last) q.set('last', 'true');
  const r = await api('/list/categories?' + q);
  return Array.isArray(r) ? r : (r.items || []);
}
const info = (id) => api('/info/' + id, 600000);
const search = async (q) => (await api('/search?q=' + encodeURIComponent(q), 60000)).items || [];
function seasonsOf(d) {
  const e = d.episodes; if (!e || typeof e !== 'object') return [];
  return Object.keys(e).sort((a, b) => a - b).map((k) => ({ season: k, episodes: [...e[k]].sort((a, b) => a - b) }));
}

/* ---------- данные пользователя ---------- */
const brief = (it) => ({ id: it.id, type: it.type, name: it.name, origin_name: it.origin_name, poster: it.poster, year: it.year, kp_rating: it.kp_rating ?? it.kp, imdb_rating: it.imdb_rating ?? it.imdb, quality: it.quality });
const isFav = (id) => S.favs.some((f) => f.id === id);
function toggleFav(it) {
  if (isFav(it.id)) { S.favs = S.favs.filter((f) => f.id !== it.id); toast('Убрано из избранного'); }
  else { S.favs.unshift(brief(it)); toast('Добавлено в избранное'); }
  save(); return isFav(it.id);
}
function addHistory(it, season, episode) {
  S.history = S.history.filter((h) => h.id !== it.id);
  S.history.unshift({ ...brief(it), season, episode, ts: Date.now() });
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
  const m = /^(\d+):([^:]+):([^:]+)$/.exec(key); if (!m) return;
  const k = m[1] + ':' + m[2], a = (S.done[k] = S.done[k] || []);
  if (!a.includes(m[3])) a.push(m[3]);
}
function storeProgress(key, t, d) {
  if (!key || !isFinite(t) || !isFinite(d) || d < 120) return;
  if (t > d - 45) { delete S.progress[key]; markDone(key); }
  else if (t >= 5) S.progress[key] = { t: Math.floor(t), d: Math.floor(d), ts: Date.now() };
  else return;
  const keys = Object.keys(S.progress);
  if (keys.length > 400) keys.sort((x, y) => (S.progress[x].ts || 0) - (S.progress[y].ts || 0)).slice(0, keys.length - 400).forEach((k) => delete S.progress[k]);
  save();
}

/* ---------- мелочи интерфейса ---------- */
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
const ratingOf = (it) => { const r = Number(it.kp_rating ?? it.kp) || Number(it.imdb_rating ?? it.imdb) || 0; return r > 0 ? r.toFixed(1) : ''; };
const poster = (it, cls = '') => `<img class="${cls}" loading="lazy" decoding="async" src="${esc(it.poster || '')}" alt="" onerror="this.remove()">`;
function card(it) {
  const r = ratingOf(it);
  return `<button class="card" data-id="${it.id}"><div class="pos"><i>${esc([...(it.name || '?')][0])}</i>${poster(it)}${it.quality ? `<span class="bd q">${esc(it.quality)}</span>` : ''}${r ? `<span class="bd r">${r}</span>` : ''}</div><b>${esc(it.name)}</b><span class="m">${[it.year, TYPES[it.type]].filter(Boolean).join(' · ')}</span></button>`;
}
function contCard(h) {
  const pct = h.season ? progressPct(h.id, h.season, h.episode) : progressPct(h.id);
  const left = h.season ? `Сезон ${h.season} · Серия ${h.episode}` : [h.year, TYPES[h.type]].filter(Boolean).join(' · ');
  return `<button class="cw" data-id="${h.id}" data-play="1">${poster(h)}<span class="pl">${ico('play')}</span><div class="t"><b>${esc(h.name)}</b><span>${esc(left)}</span></div><div class="pb"><i style="width:${pct}%"></i></div></button>`;
}
function secHtml(title, inner, more = '') { return `<section class="sec"><h2>${esc(title)}${more}</h2>${inner}</section>`; }
const rowOf = (items) => `<div class="row">${items.map(card).join('')}</div>`;
const skeleton = () => '<div class="sk"></div><div class="sk"></div><div class="sk"></div>';

/* ---------- вкладки ---------- */
const TABS = [['home', 'Главная', 'home'], ['cat', 'Каталог', 'grid'], ['search', 'Поиск', 'search'], ['mine', 'Моё', 'user']];
let tab = 'home', scrollPos = {}, token = 0;
function buildTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${ico(i)}<span>${l}</span></button>`).join('');
  $$('#tabs button').forEach((b) => (b.onclick = () => { if (b.dataset.t === tab) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; } switchTab(b.dataset.t); }));
}
function switchTab(k) {
  scrollPos[tab] = $('#view').scrollTop; tab = k; buildTabs();
  renderTab(); $('#view').scrollTop = scrollPos[k] || 0;
}
function renderTab() { const t = ++token; ({ home: renderHome, cat: renderCat, search: renderSearch, mine: renderMine })[tab](t); }
const alive = (t) => t === token;

/* ---------- главная ---------- */
async function renderHome(t) {
  const view = $('#view');
  const head = `<div class="top"><div class="logo">${LOGO}</div><h1>Luma</h1></div>`;
  view.innerHTML = head + skeleton();
  const hist = S.history.filter((h) => progressPct(h.id, h.season, h.episode) > 0 || h.season || true).slice(0, 12);
  const want = [
    ['Новинки', { cat: 'films', sort: 'new', last: true, limit: 8 }],
    ['Фильмы', { cat: 'films', sort: 'popular' }],
    ['Сериалы', { cat: 'series', sort: 'popular' }],
    ['Аниме', { cat: 'anime_series,anime_films', sort: 'popular' }],
    ['Мультфильмы', { cat: 'cartoons,cartoon_series', sort: 'popular' }],
    ['ТВ-шоу', { cat: 'tvshows', sort: 'popular' }]
  ];
  const res = await Promise.all([...want.map(([, q]) => catalog(q).catch(() => null)), catalog({ cat: 'series', sort: 'new', last: true, limit: 8 }).catch(() => null)]);
  res[0] = [...(res[0] || []).slice(0, 4), ...(res[want.length] || []).slice(0, 4)].sort((a, b) => (b.views || 0) - (a.views || 0));
  if (!alive(t)) return;
  const fresh = res[0] || [];
  let html = head;
  if (fresh.length) html += `<div class="hero">${fresh.slice(0, 6).map((it) => `<button class="hb" data-id="${it.id}">${poster(it)}<div class="t"><div class="tag">${esc([TYPES[it.type], it.year].filter(Boolean).join(' · '))}</div><h3>${esc(it.name)}</h3><span class="go">${ico('play')} Смотреть</span></div></button>`).join('')}</div>`;
  if (hist.length) html += secHtml('Продолжить просмотр', `<div class="row">${hist.map(contCard).join('')}</div>`);
  want.forEach(([title], i) => { if (i > 0 && res[i] && res[i].length) html += secHtml(title, rowOf(res[i])); });
  if (res.every((r) => !r)) html += '<div class="empty"><h3>Нет связи</h3><p>Не удалось загрузить каталог.</p><br><button class="btn" id="retry">Повторить</button></div>';
  view.innerHTML = html;
  $('#retry')?.addEventListener('click', renderTab);
}

/* ---------- каталог ---------- */
let catState = { cat: 0, sort: 0, page: 1, items: [], busy: false, end: false };
async function renderCat(t) {
  const view = $('#view');
  const bar = () => `<div class="top"><h1>Каталог</h1></div><div class="chips" id="cc">${CATS.map(([, l], i) => `<button class="chip ${i === catState.cat ? 'on' : ''}" data-c="${i}">${l}</button>`).join('')}</div><div class="chips" id="cs">${SORTS.map(([, l], i) => `<button class="chip ${i === catState.sort ? 'on' : ''}" data-s="${i}">${l}</button>`).join('')}</div>`;
  view.innerHTML = bar() + '<div class="grid" id="cg"></div><div id="cm"></div>';
  catState.items = []; catState.page = 1; catState.end = false;
  $('#cc').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { catState.cat = +b.dataset.c; renderTab(); } };
  $('#cs').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { catState.sort = +b.dataset.s; renderTab(); } };
  view.onscroll = () => { if (tab === 'cat' && view.scrollTop + view.clientHeight > view.scrollHeight - 700) loadMore(t); };
  await loadMore(t);
}
async function loadMore(t) {
  if (catState.busy || catState.end || !alive(t)) return;
  catState.busy = true;
  try {
    const items = await catalog({ cat: CATS[catState.cat][0], sort: SORTS[catState.sort][0], page: catState.page, limit: 24 });
    if (!alive(t)) return;
    if (!items.length) catState.end = true;
    else { catState.page++; $('#cg').insertAdjacentHTML('beforeend', items.map(card).join('')); }
  } catch { if (alive(t) && !catState.items.length) $('#cm').innerHTML = '<div class="empty"><h3>Нет связи</h3></div>'; }
  catState.busy = false;
}

/* ---------- поиск ---------- */
let lastQ = '', searchT = 0;
function renderSearch(t) {
  const view = $('#view');
  view.innerHTML = `<div class="top"><h1>Поиск</h1></div><label class="sbox">${ico('search')}<input id="q" placeholder="Фильм, сериал, аниме…" autocomplete="off" enterkeyhint="search" value="${esc(lastQ)}"></label><div id="sr"></div>`;
  view.onscroll = null;
  const q = $('#q');
  const run = async () => {
    const v = q.value.trim(); lastQ = v;
    if (v.length < 2) { $('#sr').innerHTML = ''; return; }
    $('#sr').innerHTML = '<div class="spin"></div>';
    try { const r = await search(v); if (!alive(t) || q.value.trim() !== v) return; $('#sr').innerHTML = r.length ? `<div class="grid">${r.map(card).join('')}</div>` : '<div class="empty"><h3>Ничего не нашлось</h3><p>Попробуйте другое название.</p></div>'; }
    catch { if (alive(t)) $('#sr').innerHTML = '<div class="empty"><h3>Нет связи</h3></div>'; }
  };
  q.oninput = () => { clearTimeout(searchT); searchT = setTimeout(run, 380); };
  if (lastQ) run(); else setTimeout(() => q.focus(), 150);
}

/* ---------- моё ---------- */
let mineTab = 'favs';
function renderMine(t) {
  const view = $('#view'); view.onscroll = null;
  const list = mineTab === 'favs' ? S.favs : S.history;
  view.innerHTML = `<div class="top"><h1>Моё</h1></div><div class="chips" id="mt"><button class="chip ${mineTab === 'favs' ? 'on' : ''}" data-m="favs">Избранное</button><button class="chip ${mineTab === 'hist' ? 'on' : ''}" data-m="hist">История</button><button class="chip ${mineTab === 'app' ? 'on' : ''}" data-m="app">О приложении</button></div>
    <div id="mb">${mineTab === 'app' ? `<div class="list"><div class="li">${ico('info')}<div>Luma для телефона<small>Версия ${esc(NATIVE ? NATIVE.version() : '—')}</small></div></div>
      <button class="li" id="clr">${ico('trash')}<div>Очистить историю<small>Список «Продолжить просмотр» и отметки серий</small></div></button></div>`
      : list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty"><h3>${mineTab === 'favs' ? 'Пока пусто' : 'История пуста'}</h3><p>${mineTab === 'favs' ? 'Нажмите ♥ на странице фильма, чтобы он появился здесь.' : 'Здесь будет всё, что вы смотрели.'}</p></div>`}</div>`;
  $('#mt').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { mineTab = b.dataset.m; renderTab(); } };
  $('#clr')?.addEventListener('click', () => { S.history = []; S.progress = {}; S.seen = {}; S.done = {}; save(); toast('История очищена'); });
}

/* ---------- страница фильма ---------- */
let det = null;
async function openDetails(id, opts = {}) {
  const box = $('#det');
  box.classList.remove('hidden'); box.scrollTop = 0;
  box.innerHTML = `<button class="ib dback" id="dback">${ico('back')}</button><div class="spin" style="margin-top:40vh"></div>`;
  $('#dback').onclick = closeDetails;
  let d;
  try { d = await info(id); } catch { box.innerHTML = `<button class="ib dback" id="dback">${ico('back')}</button><div class="empty" style="padding-top:40vh"><h3>Нет связи</h3><p>Не удалось открыть страницу.</p></div>`; $('#dback').onclick = closeDetails; return; }
  if ($('#det').classList.contains('hidden')) return;
  const inf = d.info || {}, seasons = seasonsOf(d), serial = seasons.length > 0;
  const last = S.history.find((h) => h.id === d.id);
  det = { d, seasons, serial, cur: (last && last.season) || (seasons[0] && seasons[0].season) };
  const r = ratingOf(d);
  const lastEp = () => { const h = S.history.find((x) => x.id === d.id); return h && h.season ? h : null; };
  const paint = () => {
    const h = lastEp(), resume = serial ? (h && (resumeInfo(d.id, h.season, h.episode) || h)) : resumeInfo(d.id);
    const label = serial ? (h ? `Продолжить · ${h.season}×${h.episode}` : 'Смотреть') : (resume && resumeInfo(d.id) ? 'Продолжить' : 'Смотреть');
    const sObj = seasons.find((s) => s.season == det.cur) || seasons[0];
    box.innerHTML = `<button class="ib dback" id="dback">${ico('back')}</button>
      <div class="dh"><div class="bgp" style="background-image:url('${esc(d.poster || '')}')"></div>
        <div class="in"><div class="poster">${poster(d)}</div><div class="meta"><h1>${esc(d.name)}</h1><div class="orig">${esc(d.origin_name || inf.name_eng || '')}</div>
          <div class="tags">${[d.year && `<span>${d.year}</span>`, `<span>${esc(TYPES[d.type] || '')}</span>`, r && `<span class="r">${r}</span>`, d.quality && `<span>${esc(d.quality)}</span>`].filter(Boolean).join('')}</div></div></div></div>
      <div class="da"><button class="btn primary" id="dplay">${ico('play')} ${label}</button><button class="ib ${isFav(d.id) ? 'on' : ''}" id="dfav">${ico('heart')}</button></div>
      <div class="desc cl" id="ddesc">${esc(inf.description || 'Описание пока не добавили.')}</div><button class="more" id="dmore">Читать полностью</button>
      <div class="facts">${[['Жанр', inf.genre], ['Страна', inf.country], ['Режиссёр', inf.director], ['В ролях', inf.actors]].filter(([, v]) => v).map(([k, v]) => `<b>${k}</b><span>${esc(String(Array.isArray(v) ? v.slice(0, 6).join(', ') : v).slice(0, 160))}</span>`).join('')}</div>
      ${serial ? `<div class="chips">${seasons.map((s) => `<button class="chip ${s.season == sObj.season ? 'on' : ''}" data-s="${s.season}">Сезон ${s.season}</button>`).join('')}</div>
      <div class="eps">${sObj.episodes.map((e) => { const pct = isDone(d.id, sObj.season, e) ? 0 : progressPct(d.id, sObj.season, e); return `<button class="ep ${isDone(d.id, sObj.season, e) ? 'done' : ''} ${h && h.season == sObj.season && h.episode == e ? 'cur' : ''}" data-e="${e}">${e}${pct ? `<i style="width:${pct}%"></i>` : ''}</button>`; }).join('')}</div>` : '<div style="height:90px"></div>'}`;
    $('#dback').onclick = closeDetails;
    $('#dplay').onclick = () => { if (serial) { const hh = lastEp(); const s = hh ? hh.season : seasons[0].season, e = hh ? hh.episode : seasons[0].episodes[0]; playItem(d, seasons, s, e); } else playItem(d, seasons); };
    $('#dfav').onclick = () => { $('#dfav').classList.toggle('on', toggleFav(d)); };
    $('#dmore').onclick = () => { $('#ddesc').classList.remove('cl'); $('#dmore').remove(); };
    if ((inf.description || '').length < 220) $('#dmore')?.remove();
    $$('.chips [data-s]', box).forEach((b) => (b.onclick = () => { det.cur = b.dataset.s; const y = box.scrollTop; paint(); box.scrollTop = y; }));
    $$('.ep', box).forEach((b) => (b.onclick = () => playItem(d, seasons, sObj.season, b.dataset.e)));
  };
  det.paint = paint; paint();
  if (opts.autoplay) { const hh = lastEp(); if (serial) playItem(d, seasons, hh ? hh.season : seasons[0].season, hh ? hh.episode : seasons[0].episodes[0]); else playItem(d, seasons); }
}
function closeDetails() { $('#det').classList.add('hidden'); det = null; }
/** После просмотра обновляем кнопки «Продолжить» и отметки серий. */
function refreshAfterPlay() { if (det && !$('#det').classList.contains('hidden') && det.paint) { const y = $('#det').scrollTop; det.paint(); $('#det').scrollTop = y; } if (tab === 'home') { const y = $('#view').scrollTop; renderTab(); setTimeout(() => ($('#view').scrollTop = y), 0); } }

/* ---------- нажатия ---------- */
document.addEventListener('click', (e) => {
  const c = e.target.closest('.card, .hb, .cw'); if (!c || !c.dataset.id) return;
  openDetails(+c.dataset.id, { autoplay: !!c.dataset.play });
});

/* ---------- кнопка «Назад» ---------- */
window.lumaBack = () => {
  if (window.npBack && window.npBack()) return true;
  if (!$('#det').classList.contains('hidden')) { closeDetails(); return true; }
  if (tab !== 'home') { switchTab('home'); return true; }
  return false;
};
window.lumaOpen = (id, play) => { try { openDetails(+id, { autoplay: !!play }); } catch {} };   // luma://open?id=123&play=1
window.lumaPause = () => { try { if (window.npPauseIfPlaying) window.npPauseIfPlaying(); } catch {} };

buildTabs(); renderTab();
try { const l = NATIVE && NATIVE.takeLink(); if (l) { const [id, p] = l.split(','); setTimeout(() => window.lumaOpen(id, p === '1'), 300); } } catch {}
