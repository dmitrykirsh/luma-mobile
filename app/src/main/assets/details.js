'use strict';
/* Страницы поверх вкладок (фильм, человек) и сама страница фильма: оценки с логотипами, вкладки, актёры, трейлеры, кадры. */
const PG = [];   // стек открытых страниц
const rateCls = (n) => (n >= 7 ? 'hi' : n >= 5.5 ? 'mid' : 'lo');
const dList = (a) => (Array.isArray(a) && a.length ? a.join(', ') : '');
const rateChip = (key, cls, val, title) => `<span class="rate ${cls}" title="${esc(title)}">${window.brandIcon ? window.brandIcon(key) : ''}<b>${val}</b></span>`;
const SEC_CAT = { 1: 0, 2: 3, 3: 1, 4: 4, 5: 3, 6: 2, 7: 2 };   // тип записи -> индекс категории каталога

function pushPage() {
  const el = document.createElement('section'); el.className = 'pg';
  $('#pages').appendChild(el); PG.push(el); document.body.classList.add('pgs');
  return el;
}
function popPage() {
  const el = PG.pop(); if (!el) return false;
  if (el._onClose) { try { el._onClose(); } catch {} }
  el.classList.add('out'); setTimeout(() => el.remove(), 260);
  if (!PG.length) { document.body.classList.remove('pgs'); if(typeof mobileLibraryRefreshIfNeeded==='function')mobileLibraryRefreshIfNeeded(); }
  return true;
}
const backBtn = () => `<button class="ib dback" data-back="1">${ico('back')}</button>`;
document.addEventListener('click', (e) => { if (e.target.closest('[data-back]')) popPage(); });
const alivePg = (el) => PG.includes(el);

/* ---------- страница фильма ---------- */
const preImg = (u) => new Promise((res) => { if (!u) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });
/** Кадр, логотип, постер и оценки грузятся заранее: страница открывается сразу готовой, но не дольше таймаута. */
async function detailsPrefetch(d) {
  const poster = preImg(d.poster);
  const T = await tmFind(d).catch(() => null);
  if (!T) { await poster; return null; }
  const [, bd, logo, lb, om] = await Promise.all([poster, preImg(T.backdrop ? TMI(T.backdrop, 'w1280') : ''), preImg(T.logo ? TMI(T.logo, 'w500') : ''),
    T.kind === 'movie' ? lbRating(T.tmdb).catch(() => null) : null, omdbRatings(T.imdb).catch(() => null)]);
  let rates = '';
  if (T.vote) rates += rateChip('tmdb', rateCls(T.vote), T.vote.toFixed(1), 'TMDB');
  if (lb) rates += rateChip('lb', rateCls(lb.value * 2), lb.value.toFixed(1), 'Letterboxd');
  if (om && om.rt) rates += rateChip('rt', om.rt >= 60 ? 'hi' : 'lo', om.rt + '%', 'Rotten Tomatoes');
  if (om && om.mc) rates += rateChip('mc', om.mc >= 61 ? 'hi' : om.mc >= 40 ? 'mid' : 'lo', om.mc, 'Metacritic');
  if (logo) { logo.className = 'logo-img'; logo.alt = d.name; }
  return { T, logo, rates };
}
async function openDetails(id, opts = {}, existingPg = null) {
  const pg = existingPg || pushPage();
  pg.innerHTML = backBtn() + '<div class="spin" style="margin-top:40vh"></div>';
  let d;
  try { d = await info(id); if (!d || typeof d !== 'object' || Array.isArray(d) || d.id == null) { cache.delete('/info/' + id); throw new Error('BAD_DETAILS'); } } catch { if (alivePg(pg)) { pg.innerHTML = backBtn() + '<div class="empty" style="padding-top:35vh"><h3>Не удалось открыть страницу</h3><p>Проверьте подключение и попробуйте ещё раз.</p><button class="btn" data-details-retry>Повторить</button></div>'; pg.querySelector('[data-details-retry]').onclick = () => openDetails(id, opts, pg); } return; }
  if (!alivePg(pg)) return;
  const pre = await Promise.race([detailsPrefetch(d).catch(() => null), wait(4500)]);
  if (!alivePg(pg)) return;
  const inf = d.info || {}, seasons = seasonsOf(d), serial = seasons.length > 0;
  const people = d.people || {};
  const X = { d, inf, seasons, serial, cur: null, tab: '', T: null, trailers: null, shots: [], recsP: null, pg };
  const lastEp = () => { const h = S.history.find((x) => String(x.id) === String(d.id)); return h && h.season ? h : null; };
  X.cur = (lastEp() && lastEp().season) || (seasons[0] && seasons[0].season);
  pg._x = X;
  if (pre && pre.T) { X.T = pre.T; X.shots = pre.T.shots || []; X.logoImg = pre.logo; X.rates = pre.rates; X.pre = true; }
  const tabs = [['about', 'О фильме']];
  if (serial) tabs.push(['eps', 'Серии']);
  tabs.push(['trailers', 'Трейлеры']);
  if ((people.actors || []).length || (people.directors || []).length) tabs.push(['cast', 'Актёры']);
  if (X.shots.length > 1) tabs.push(['shots', 'Кадры']);
  tabs.push(['more', 'Похожее']);
  X.tabs = tabs;
  const kp = Number(d.kp_rating) || 0, im = Number(d.imdb_rating) || 0;
  X.paintHead = () => {
    const h = serial ? lastEp() : S.history.find(x=>String(x.id)===String(d.id)),sourceId=h?.source==='vk'?h.vkId:h?.source==='rutube'?h.rutubeId:'',rsm=(h?.source==='vk'||h?.source==='rutube')?(sourceId?resumeInfo(mobileSourceProgressKey(h.source,sourceId,d.id,h.season,h.episode)):null):serial?(h?resumeInfo(d.id,h.season,h.episode):null):resumeInfo(d.id);
    const label = (rsm || (serial && h)) ? 'Продолжить' + (serial && h ? ` · ${h.season}×${h.episode}` : '') + (rsm ? ' · ' + fmtTime(rsm.t) : '') : 'Смотреть';
    const bd = X.T && X.T.backdrop ? TMI(X.T.backdrop, 'w1280') : (d.poster || '');
    pg.querySelector('.dh')?.remove(); pg.querySelector('.da')?.remove(); pg.querySelector('.mobile-source-bar')?.remove();
    pg.insertAdjacentHTML('afterbegin', `<div class="dh"><div class="bgp ${X.T && X.T.backdrop ? 'bd' : ''}" style="background-image:url('${esc(bd)}')"></div>
      <div class="in"><div class="poster">${poster(d)}</div><div class="meta"><div class="ty">${esc(TYPES[d.type] || '')}${inf.age ? ' · ' + esc(inf.age) + '+' : ''}</div><h1 id="dTitle">${esc(d.name)}</h1><div class="orig">${esc(d.origin_name || inf.name_eng || '')}</div>
        <div class="tags">${[d.year && `<span>${d.year}</span>`, inf.time && `<span>${esc(inf.time)}</span>`, serial && `<span>${seasons.length} сез.</span>`, ...(inf.country || []).slice(0, 2).map((c) => `<span>${esc(c)}</span>`), d.quality && `<span>${esc(d.quality)}</span>`].filter(Boolean).join('')}</div></div></div>
      <div class="rates" id="dRates">${kp ? rateChip('kp', rateCls(kp), kp.toFixed(1), 'Кинопоиск') : ''}${im ? rateChip('imdb', rateCls(im), im.toFixed(1), 'IMDb') : ''}</div>
      <div class="genres">${(inf.genre || []).map((g) => `<button class="gchip" data-genre="${esc(g)}">${esc(g)}</button>`).join('')}</div></div>
      <div class="da"><button class="btn primary" id="dplay">${ico('play')} ${esc(label)}</button>${rsm ? `<button class="ib" id="dstart" title="С начала">${ico('restart')}</button>` : ''}<button class="ib ${isFav(d.id) ? 'on' : ''}" id="dfav" aria-label="${isFav(d.id) ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-pressed="${isFav(d.id)}">${ico('heart')}</button></div><div class="mobile-source-bar"><span>Другие источники</span><button data-mobile-source="rutube"><img src="platforms/rutube-icon.svg" alt="">Rutube</button><button data-mobile-source="vk"><img src="platforms/vk-video.svg" alt="">VK Видео</button></div>`);
    $('#dplay', pg).onclick = () => { const hh=serial?lastEp():S.history.find(x=>String(x.id)===String(d.id)),sourceId=hh?.source==='vk'?hh.vkId:hh?.source==='rutube'?hh.rutubeId:'';const sn=serial?(hh?.season||seasons[0].season):null,ep=serial?(hh?.episode||seasons[0].episodes[0]):null;if(sourceId)playMobileSource(hh.source,d,sn,ep,{id:sourceId,title:d.name});else if(hh?.source==='vk'||hh?.source==='rutube')openMobileSource(hh.source,d,sn,ep,seasons);else if(serial)playItem(d,seasons,sn,ep);else playItem(d,seasons); };
    $('#dstart', pg)?.addEventListener('click', () => {const hh=serial?lastEp():S.history.find(x=>String(x.id)===String(d.id)),sourceId=hh?.source==='vk'?hh.vkId:hh?.source==='rutube'?hh.rutubeId:'',sn=serial?(hh?.season||seasons[0].season):null,ep=serial?(hh?.episode||seasons[0].episodes[0]):null;if(sourceId)playMobileSource(hh.source,d,sn,ep,{id:sourceId,title:d.name},{fromStart:true});else if(serial)playItem(d,seasons,sn,ep,{fromStart:true});else playItem(d,seasons,undefined,undefined,{fromStart:true});});
    $('#dfav', pg).onclick = () => { const button = $('#dfav', pg), on = toggleFav(d); button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on)); button.setAttribute('aria-label', on ? 'Убрать из избранного' : 'Добавить в избранное'); };
    $$('.mobile-source-bar [data-mobile-source]',pg).forEach(b=>b.onclick=()=>{const hh=lastEp(),season=serial?(hh?.season||seasons[0].season):null,episode=serial?(hh?.episode||seasons[0].episodes[0]):null;openMobileSource(b.dataset.mobileSource,d,season,episode,seasons);});
    $$('[data-genre]', pg).forEach((b) => (b.onclick = () => { catState.cat = SEC_CAT[d.type] ?? 0; catState.genre = b.dataset.genre; catState.sort = 0; while (PG.length) popPage(); switchTab('cat', true); }));
    if (X.rates) $('#dRates', pg).insertAdjacentHTML('beforeend', X.rates);
    if (X.logoImg) { const t = $('#dTitle', pg); t.textContent = ''; t.appendChild(X.logoImg.cloneNode()); t.classList.add('has-logo'); }
  };
  pg.innerHTML = backBtn() + '<div class="dtabs" id="dTabs"></div><div id="dPanel" class="dpanel"></div>';
  X.paintHead();
  $('#dTabs', pg).innerHTML = tabs.map(([k, l]) => `<button class="chip" data-dtab="${k}">${l}</button>`).join('');
  $('#dTabs', pg).onclick = (e) => { const b = e.target.closest('[data-dtab]'); if (b) selectTab(X, b.dataset.dtab); };
  selectTab(X, serial && lastEp() ? 'eps' : 'about');
  detailsEnhance(X);
  X.refresh = () => { const y = pg.scrollTop; X.paintHead(); const tab = X.tab; X.tab = ''; selectTab(X, tab); pg.scrollTop = y; };
  if (opts.autoplay) $('#dplay', pg).click();
}
function selectTab(X, k) {
  if (X.tab === k) return;
  X.tab = k;
  $$('#dTabs .chip', X.pg).forEach((b) => b.classList.toggle('on', b.dataset.dtab === k));
  const p = $('#dPanel', X.pg); if (!p) return;
  (PANELS[k] || PANELS.about)(p, X);
}
const dFact = (k, v) => (v ? `<b>${esc(k)}</b><span>${esc(v)}</span>` : '');
const PANELS = {
  about(p, X) {
    const { inf } = X;
    const facts = [dFact('Премьера', inf.premier_rus || inf.premier), dFact('Режиссёр', dList(inf.director)), dFact('Сценарий', dList(inf.screenwriter)), dFact('Продюсеры', dList(inf.producer).slice(0, 120)), dFact('Оператор', dList(inf.operator)), dFact('Композитор', dList(inf.composer)), dFact('Бюджет', inf.budget), dFact('Рейтинг MPAA', inf.rate_mpaa)].join('');
    p.innerHTML = `<div class="desc cl" id="ddesc">${esc(inf.description || 'Описание пока не добавили.')}</div>${(inf.description || '').length > 220 ? '<button class="more" id="dmore">Читать полностью</button>' : ''}
      ${facts ? `<div class="facts">${facts}</div>` : ''}
      ${(inf.trivia || []).length ? `<h3 class="ph3">Интересные факты</h3>${inf.trivia.slice(0, 6).map((x) => `<div class="triv">${esc(x)}</div>`).join('')}` : ''}<div style="height:60px"></div>`;
    $('#dmore', p)?.addEventListener('click', () => { $('#ddesc', p).classList.remove('cl'); $('#dmore', p).remove(); });
  },
  eps(p, X) {
    const { d, seasons } = X, sObj = seasons.find((s) => s.season == X.cur) || seasons[0], h = S.history.find((x) => String(x.id) === String(d.id)),expanded=String(X.expandedSeason||'')===String(sObj.season),visible=expanded?sObj.episodes:sObj.episodes.slice(0,12),generation=X.episodeRender=(X.episodeRender||0)+1;
    p.innerHTML = `<div class="chips">${seasons.map((s) => `<button class="chip ${s.season == sObj.season ? 'on' : ''}" data-s="${s.season}">Сезон ${s.season}</button>`).join('')}</div>
      <div class="eps mobile-episode-grid">${visible.map((e) => { const dn = isDone(d.id, sObj.season, e), pct = dn ? 0 : mobileEpisodeProgressPct(d.id, sObj.season, e); return `<button class="ep mobile-episode ${dn ? 'done' : ''} ${h && h.season == sObj.season && h.episode == e ? 'cur' : ''}" data-e="${esc(e)}"><span class="mobile-episode-art"><span class="mobile-episode-play">▶</span>${pct ? `<i style="width:${pct}%"></i>` : ''}</span><span class="mobile-episode-copy"><b>Серия ${esc(e)}</b><small>${dn?'Просмотрено':h && h.season == sObj.season && h.episode == e?'Продолжить':'Смотреть'}</small></span></button>`; }).join('')}</div>${sObj.episodes.length>12?`<button class="ao-episodes-more" data-e-expand aria-expanded="${expanded}">${expanded?'Свернуть серии':'Все серии · '+sObj.episodes.length} <span>${expanded?'↑':'↓'}</span></button>`:''}`;
    $('[data-e-expand]',p)?.addEventListener('click',()=>{X.expandedSeason=expanded?'':String(sObj.season);X.tab='';selectTab(X,'eps');if(expanded)p.scrollIntoView({block:'start'});});
    $$('.chips [data-s]', p).forEach((b) => (b.onclick = () => { X.cur = b.dataset.s; X.expandedSeason=''; X.tab = ''; selectTab(X, 'eps'); }));
    $$('.ep', p).forEach((b) => (b.onclick = () => {const h=S.history.find(x=>String(x.id)===String(d.id)&&String(x.season)===String(sObj.season)&&String(x.episode)===String(b.dataset.e)),id=h?.source==='vk'?h.vkId:h?.source==='rutube'?h.rutubeId:'';if(id)playMobileSource(h.source,d,sObj.season,b.dataset.e,{id,title:d.name});else playItem(d,seasons,sObj.season,b.dataset.e);}));
    const season=String(sObj.season);(async()=>{const match=X.T||await tmFind(d);if(!alivePg(X.pg)||X.tab!=='eps'||X.episodeRender!==generation||String(X.cur)!==season||!match||match.kind!=='tv')return;const data=await tmdb('/tv/'+encodeURIComponent(match.tmdb)+'/season/'+encodeURIComponent(season));if(!alivePg(X.pg)||X.tab!=='eps'||X.episodeRender!==generation||String(X.cur)!==season)return;const rows=new Map((data.episodes||[]).map(x=>[String(x.episode_number),x]));$$('.mobile-episode',p).forEach(b=>{const ep=rows.get(String(b.dataset.e));if(!ep)return;const imgPath=ep.still_path;if(imgPath){const img=document.createElement('img');img.loading='lazy';img.alt='';img.onerror=()=>img.remove();img.src=TMI(imgPath,'w500');$('.mobile-episode-art',b).prepend(img);}if(ep.name&&!/^серия\s*\d+$/i.test(ep.name))$('.mobile-episode-copy small',b).textContent=ep.name;});})().catch(()=>{});
  },
  async trailers(p, X) {
    p.innerHTML = '<div class="spin"></div>';
    const { d, inf } = X;
    if (!X.trailers) X.trailers = findTrailers({ name: d.name, origin: d.origin_name || inf.name_eng, year: d.year, tmdb: X.T && X.T.tmdb, kind: X.T && X.T.kind });
    const list = await X.trailers;
    if (!alivePg(X.pg) || X.tab !== 'trailers') return;
    X.trList = list;
    p.innerHTML = list.length ? `<div class="trailers">${list.map((x, i) => `<button class="tr" data-i="${i}"><div class="th"><img loading="lazy" src="${esc(x.thumb)}" alt=""><i>${ico('play')}</i></div><b>${esc(x.title)}</b><small>${esc(x.src)}</small></button>`).join('')}</div>` : '<div class="empty"><h3>Трейлеров пока нет</h3></div>';
    $$('.tr', p).forEach((b) => (b.onclick = () => openTrailer(list[+b.dataset.i])));
  },
  cast(p, X) {
    const people = X.d.people || {};
    const row = (title, arr, role) => (arr && arr.length ? `<h3 class="ph3">${title}</h3><div class="people">${arr.map((x) => `<button class="person" data-pid="${x.id}"><div class="pha">${x.avatar_url ? `<img loading="lazy" src="${esc(x.avatar_url)}" alt="" onerror="this.remove()">` : ''}<span>${esc([...(x.name || '?')][0])}</span></div><b>${esc(x.name)}</b>${role && x.role ? `<small>${esc(x.role)}</small>` : ''}</button>`).join('')}</div>` : '');
    p.innerHTML = row('Режиссёры', people.directors) + row('В ролях', people.actors, true) + '<div style="height:60px"></div>';
    $$('.person', p).forEach((b) => (b.onclick = () => openPerson({ lift: b.dataset.pid })));
  },
  async shots(p, X) {
    p.innerHTML = `<div class="shots">${X.shots.map((b, i) => `<button class="shot" data-i="${i}"><img loading="lazy" src="${esc(TMI(b, 'w780'))}" alt=""></button>`).join('')}</div><div style="height:60px"></div>`;
    $$('.shot', p).forEach((b) => (b.onclick = () => openLightbox(X.shots.map((s) => TMI(s, 'w1280')), +b.dataset.i)));
  },
  async more(p, X) {
    const { d, inf } = X;
    p.innerHTML = '<div id="partsWrap"></div><div id="simWrap"><div class="spin"></div></div>';
    const parts = (d.parts || []).filter((id) => id !== d.id);
    if (parts.length) Promise.all(parts.map((id) => info(id).catch(() => null))).then((arr) => { const w = $('#partsWrap', p), list = arr.filter(Boolean); if (!w || !alivePg(X.pg) || !list.length) return; w.innerHTML = `<h3 class="ph3">Другие части</h3><div class="row">${list.map(card).join('')}</div>`; });
    const recs = await (X.recsP || Promise.resolve(null));
    if (!alivePg(X.pg) || X.tab !== 'more') return;
    const w = $('#simWrap', p); if (!w) return;
    if (recs && recs.length >= 6) { w.innerHTML = `<h3 class="ph3">Рекомендуют зрители</h3><div class="row">${recs.map(card).join('')}</div>`; return; }
    // рекомендаций TMDB мало: подбираем по жанрам, рейтингу и году
    const cats = { 1: 'films', 2: 'cartoons', 3: 'series', 4: 'tvshows', 5: 'cartoon_series', 6: 'anime_films', 7: 'anime_series' }[d.type] || 'films';
    const gens = (inf.genre || []).slice(0, 3).map((g) => g[0].toUpperCase() + g.slice(1));
    let pool = [];
    try {
      const lists = await Promise.all((gens.length ? gens : ['']).map((g) => catalog({ cat: cats, limit: 60, sort: 'kp', genre: g }).catch(() => [])));
      const byId = new Map();
      for (const l of lists) for (const x of l) { const o = byId.get(x.id); if (o) o.hits++; else byId.set(x.id, { x, hits: 1 }); }
      const kp0 = Number(d.kp_rating) || Number(d.imdb_rating) || 7, y0 = Number(d.year) || 2000;
      pool = [...byId.values()].map(({ x, hits }) => { const kp = Number(x.kp_rating) || Number(x.imdb_rating) || 0; return { x, score: hits * 3 - Math.abs(kp - kp0) * 1.5 - Math.abs((x.year || y0) - y0) / 8 - (kp ? 0 : 3) }; }).sort((a, b) => b.score - a.score).map((o) => o.x);
    } catch {}
    const sim = pool.filter((x) => x.id !== d.id && !parts.includes(x.id)).slice(0, 18);
    if (!alivePg(X.pg) || X.tab !== 'more') return;
    w.innerHTML = sim.length ? `<h3 class="ph3">Вам может понравиться</h3><div class="row">${sim.map(card).join('')}</div>` : '';
  }
};

/* дополнительные данные: кадр, логотип, оценки, рекомендации */
async function detailsEnhance(X) {
  const { d, pg } = X;
  let T; try { T = await tmFind(d); } catch { T = null; }
  if (!alivePg(pg)) return;
  if (!T) { X.recsP = Promise.resolve(null); return; }
  const had = X.pre;
  X.T = T; X.shots = T.shots || [];
  if (!had && T.backdrop) { const im = new Image(); im.onload = () => { if (alivePg(pg)) X.paintHead(); }; im.src = TMI(T.backdrop, 'w1280'); }
  if (!had && T.logo) { const img = new Image(); img.className = 'logo-img'; img.alt = d.name; img.onload = () => { X.logoImg = img; if (alivePg(pg)) { const t = $('#dTitle', pg); if (t) { t.textContent = ''; t.appendChild(img.cloneNode()); t.classList.add('has-logo'); } } }; img.src = TMI(T.logo, 'w500'); }
  if (X.shots.length > 1 && !$('[data-dtab=shots]', pg)) { $('[data-dtab=more]', pg)?.insertAdjacentHTML('beforebegin', '<button class="chip" data-dtab="shots">Кадры</button>'); X.tabs.splice(X.tabs.length - 1, 0, ['shots', 'Кадры']); }
  X.recsP = (async () => { const out = []; let i = 0; const rc = T.recs || []; await Promise.all(Array.from({ length: 4 }, async () => { while (i < rc.length) { const x = rc[i++]; const m = await tmMatchCached(x, T.kind).catch(() => null); if (m && m.id !== d.id) out.push({ m, o: i }); } })); return out.sort((a, b) => a.o - b.o).map((x) => x.m); })();
  if (had) { X.recsP = X.recsP || null; }
  const add = (html) => { X.rates = (X.rates || '') + html; if (alivePg(pg)) $('#dRates', pg)?.insertAdjacentHTML('beforeend', html); };
  if (!had && T.vote) add(rateChip('tmdb', rateCls(T.vote), T.vote.toFixed(1), 'TMDB'));
  if (!had && T.kind === 'movie') lbRating(T.tmdb).then((o) => { if (o) add(rateChip('lb', rateCls(o.value * 2), o.value.toFixed(1), 'Letterboxd')); }).catch(() => {});
  if (!had) omdbRatings(T.imdb).then((o) => { if (!o) return; if (o.rt) add(rateChip('rt', o.rt >= 60 ? 'hi' : 'lo', o.rt + '%', 'Rotten Tomatoes')); if (o.mc) add(rateChip('mc', o.mc >= 61 ? 'hi' : o.mc >= 40 ? 'mid' : 'lo', o.mc, 'Metacritic')); }).catch(() => {});
  if (X.tab === 'trailers') { X.tab = ''; selectTab(X, 'trailers'); }   // трейлеры точнее с TMDB-id
  if (X.tab === 'more') { X.tab = ''; selectTab(X, 'more'); }
}

/* ---------- трейлеры и кадры ---------- */
let mobileYoutubePage=null;
function openMobileYoutube(id){if(!/^[\w-]{11}$/.test(String(id||'')))return;const pg=pushPage();mobileYoutubePage={pg,id};pg.innerHTML=`${backBtn()}<div class="mobile-youtube"><span>YOUTUBE · В LUMA</span><h1>Просмотр видео</h1><div class="mobile-youtube-player"><div class="mobile-youtube-message">Подключаем видео…</div></div><button class="btn" data-youtube-external>Открыть в YouTube ↗</button></div>`;pg.querySelector('[data-youtube-external]').onclick=()=>{popPage();NATIVE?.openYoutube(id);};pg._onClose=()=>{if(mobileYoutubePage?.pg===pg)mobileYoutubePage=null;NATIVE?.clearYoutubeEmbed?.();};if(NATIVE?.prepareYoutubeEmbed)NATIVE.prepareYoutubeEmbed(id);else window.lumaMobileYoutubeReady(id,false);}
window.lumaMobileYoutubeReady=(id,ok)=>{const current=mobileYoutubePage;if(!current||current.id!==id||!alivePg(current.pg))return;const host=current.pg.querySelector('.mobile-youtube-player');if(!host)return;if(!ok){host.innerHTML='<div class="mobile-youtube-message"><span>Не удалось подключить видео.</span><button class="mobile-search-retry" data-youtube-retry>Повторить</button></div>';host.querySelector('[data-youtube-retry]').onclick=()=>{host.innerHTML='<div class="mobile-youtube-message">Подключаем видео…</div>';if(NATIVE?.prepareYoutubeEmbed)NATIVE.prepareYoutubeEmbed(id);else window.lumaMobileYoutubeReady(id,false);};return;}host.innerHTML=`<iframe title="YouTube" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&amp;playsinline=1&amp;rel=0&amp;enablejsapi=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;};
window.lumaYoutubePause=()=>{const f=mobileYoutubePage?.pg.querySelector('.mobile-youtube-player iframe');f?.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}), 'https://www.youtube-nocookie.com');};
function openTrailer(t) {
  if (t.src === 'YouTube' && NATIVE && NATIVE.openYoutube) { openMobileYoutube(t.id); return; }
  if (t.src === 'Rutube') { playTrailer(t); return; }
  if (NATIVE && NATIVE.openUrl) NATIVE.openUrl(t.url);
}
function openLightbox(list, i) {
  if (!Array.isArray(list) || !list.length) return;
  const pg = pushPage(); pg.classList.add('lbx'); let k = Math.max(0, Math.min(list.length - 1, Number(i) || 0));
  pg.innerHTML = `${backBtn()}<img alt=""><div class="lbx-error" hidden><span>Не удалось загрузить кадр</span><button class="btn" data-lbx-retry>Повторить</button></div><div class="lbx-nav"><button data-lbx-prev aria-label="Предыдущий кадр">‹</button><div class="n" aria-live="polite"></div><button data-lbx-next aria-label="Следующий кадр">›</button></div>`;
  const img = $('img', pg), error = $('.lbx-error', pg), prev = $('[data-lbx-prev]', pg), next = $('[data-lbx-next]', pg);
  const show = (d) => { k = (k + d + list.length) % list.length; error.hidden = true; img.hidden = false; img.alt = `Кадр ${k + 1} из ${list.length}`; img.src = list[k]; $('.n', pg).textContent = (k + 1) + ' / ' + list.length; };
  img.onload = () => { error.hidden = true; }; img.onerror = () => { img.hidden = true; error.hidden = false; };
  prev.hidden = next.hidden = list.length < 2; prev.onclick = () => show(-1); next.onclick = () => show(1); $('[data-lbx-retry]', pg).onclick = () => show(0);
  let start = null;
  pg.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) start = { id:e.pointerId, x:e.clientX, y:e.clientY }; });
  pg.addEventListener('pointerup', (e) => { if (!start || start.id !== e.pointerId) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; start = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) show(dx < 0 ? 1 : -1); });
  pg.addEventListener('pointercancel', () => { start = null; });
  pg.addEventListener('keydown', (e) => { if (list.length > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); show(e.key === 'ArrowLeft' ? -1 : 1); } });
  show(0);
}
