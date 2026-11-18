'use strict';
/* ТВ-каналы на телефоне: список, избранное, недавние, каталог мира, телепрограмма. Играет нативный плеер (см. player.js, режим «live»). */
const tvChipsList = () => {
  const g = new Map();
  for (const c of TVD.channels) g.set(c.group, (g.get(c.group) || 0) + 1);
  return ['Все', '★ Избранные', ...[...g.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0])];
};
const tvFiltered = () => TVD.cat==='★ Избранные'?tvFavs().map(tvChan).filter(Boolean):TVD.channels.filter(c=>TVD.cat==='Все'||c.group===TVD.cat);
const tvHm = (ms) => new Date(ms).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

let tvLogoFallbackPromise=null;
function tvLogoFallbacks(){if(tvLogoFallbackPromise)return tvLogoFallbackPromise;tvLogoFallbackPromise=(async()=>{const [channels,logos]=await Promise.all(['channels','logos'].map(async file=>{const r=await fetch(tvPx('https://iptv-org.github.io/api/'+file+'.json','','',true),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP');return r.json();}));const logoById=new Map();for(const l of logos)if(l?.in_use&&typeof l.url==='string'&&/^https:\/\//i.test(l.url)&&!logoById.has(l.channel))logoById.set(l.channel,l.url);const matches=new Map();for(const c of channels){const logo=logoById.get(c.id);if(!logo)continue;for(const name of [c.name,...(c.alt_names||[])]){const k=tvNrm(name);if(!k)continue;const options=matches.get(k)||[];if(!options.some(x=>x.id===c.id))options.push({id:c.id,url:logo,country:String(c.country||'').toUpperCase()});matches.set(k,options);}}return matches;})().catch(()=>{tvLogoFallbackPromise=null;return new Map();});return tvLogoFallbackPromise;}
async function tvApplyLogoFallback(img){if(!img?.isConnected||img.dataset.logoFallback)return;img.dataset.logoFallback='1';const c=tvChan(img.closest('[data-ch]')?.dataset.ch);if(!c){img.remove();return;}const map=await tvLogoFallbacks(),options=map.get(tvNrm(c.name))||[],country=String(c.cc||'ru').toUpperCase(),local=options.filter(x=>x.country===country),chosen=local.length===1?local[0]:options.length===1?options[0]:null,url=chosen?.url;if(!img.isConnected)return;if(!url||url===c.logo){img.remove();return;}img.src=url;}
function tvTryPendingLogos(root){setTimeout(()=>{if(!root?.isConnected)return;root.querySelectorAll('.chc .lg img').forEach(img=>{if(!img.complete||!img.naturalWidth)tvApplyLogoFallback(img);});},8000);}
function tvCard(c, showRegion = false) {
  const nn = tvNowNext(c);
  return `<button class="chc" data-ch="${esc(c.id)}"><div class="lg"><span>${esc(c.name.slice(0, 2))}</span>${c.logo ? `<img decoding="async" loading="lazy" src="${esc(/^https?:/.test(c.logo) ? c.logo : '')}" alt="" onload="this.parentElement.classList.add('has-logo')" onerror="this.parentElement.classList.remove('has-logo');if(this.dataset.logoFallback)this.remove();else tvApplyLogoFallback(this)">` : ''}</div>
    <div class="cn"><b>${esc(c.name)}</b>${showRegion?`<em class="mobile-world-region">${esc(tvRegion(c.cc))}</em>`:''}<small>${nn.now ? esc(nn.now) : esc(c.group)}</small></div>${nn.pct != null ? `<i class="tv-channel-progress" style="width:${nn.pct}%"></i>` : ''}</button>`;
}
function tvMobileMode(){try{return localStorage.getItem('luma.m.tvMode')==='cards'?'cards':'guide';}catch{return 'guide';}}
function tvWorldCard(c,showRegion=false){return `<div class="mobile-world-card">${tvCard(c,showRegion)}<button class="mobile-world-fav" data-tv-fav="${esc(c.id)}" aria-label="${tvIsFav(c.id)?'Убрать из избранного':'Добавить в избранное'}" aria-pressed="${tvIsFav(c.id)}">${tvIsFav(c.id)?'★':'☆'}</button></div>`;}
function tvGuideProgramHtml(c){const now=Date.now(),programmes=tvSchedule(c).filter(x=>x[1]>now).slice(0,3),live=programmes[0]&&programmes[0][0]<=now;return programmes.length?programmes.map((x,i)=>{const on=mobileTvReminderOn(c,x);return `<div class="${i===0&&live?'on':''}"><time>${esc(tvHm(x[0]))}</time><span>${esc(x[2])}</span>${i===0&&live?'<small>СЕЙЧАС</small>':x[0]>now?`<button data-tv-program="${esc(c.id)}" data-tv-start="${x[0]}" aria-label="${on?'Напоминание включено':'Напомнить'}: ${esc(x[2])}" aria-pressed="${on}">${on?'●':'＋'}</button>`:''}</div>`;}).join(''):'<p>Программа пока недоступна</p>';}
function tvGuideCard(c){return `<article class="mobile-tv-guide" data-guide="${esc(c.id)}"><div class="mobile-tv-guide-head"><button class="mobile-tv-play chc" data-ch="${esc(c.id)}"><span class="lg"><span>${esc(c.name.slice(0,2))}</span>${c.logo?`<img loading="lazy" src="${esc(/^https?:/.test(c.logo)?c.logo:'')}" alt="" onload="this.parentElement.classList.add('has-logo')" onerror="this.parentElement.classList.remove('has-logo');if(this.dataset.logoFallback)this.remove();else tvApplyLogoFallback(this)">`:''}</span><span class="cn"><b>${esc(c.name)}</b><small>${esc(c.group||'Телеканал')}</small></span><span class="mobile-tv-arrow">▶</span></button><button class="mobile-tv-fav" data-tv-fav="${esc(c.id)}" aria-label="${tvIsFav(c.id)?'Убрать из избранного':'В избранное'}" aria-pressed="${tvIsFav(c.id)}">${tvIsFav(c.id)?'★':'☆'}</button></div><div class="mobile-tv-program">${tvGuideProgramHtml(c)}</div></article>`;}
function tvPaintNow() {
  if (tab !== 'tv') return;
  const view=$('#view'),anchor=view?.scrollTop>0?$$('#tvGrid .mobile-tv-guide').find(el=>el.getBoundingClientRect().bottom>view.getBoundingClientRect().top):null,oldTop=anchor?.getBoundingClientRect().top;
  $$('#tvGrid .mobile-tv-guide').forEach(el=>{const c=tvChan(el.dataset.guide),box=$('.mobile-tv-program',el);if(c&&box){const html=tvGuideProgramHtml(c);if(box.innerHTML!==html)box.innerHTML=html;}});
  if(anchor&&view&&Number.isFinite(oldTop))view.scrollTop+=anchor.getBoundingClientRect().top-oldTop;
  $$('.chc:not(.mobile-tv-play)').forEach((el) => {
    const c = tvChan(el.dataset.ch); if (!c) return;
    const nn = tvNowNext(c), s = $('small', el); if (s) s.textContent = nn.now || c.group || 'Телеканал';
    let pg = $('.tv-channel-progress', el); if (nn.pct != null) { if (!pg) { pg = document.createElement('i'); pg.className = 'tv-channel-progress'; el.appendChild(pg); } pg.style.width = nn.pct + '%'; } else pg?.remove();
  });
}

function tvWorldPaintNow(){document.querySelectorAll('.pg #wGrid .chc').forEach(el=>{const c=tvChan(el.dataset.ch);if(!c)return;const nn=tvNowNext(c),small=$('small',el);if(small)small.textContent=nn.now||c.group||'Телеканал';let bar=$('.tv-channel-progress',el);if(nn.pct!=null){if(!bar){bar=document.createElement('i');bar.className='tv-channel-progress';el.appendChild(bar);}bar.style.width=nn.pct+'%';}else bar?.remove();});}

/* ---------- вкладка «ТВ» ---------- */
async function renderTv(t) {
  const view = $('#view'); view.onscroll = null;
  view.innerHTML = '<div class="top"><h1>ТВ</h1></div><div class="spin"></div>';
  try { await tvLoad(); } catch { if (alive(t)) { view.innerHTML = '<div class="top"><h1>ТВ</h1></div><div class="empty"><h3>Каналы не загрузились</h3><p>Проверьте подключение и попробуйте ещё раз.</p><button class="btn" data-tv-load-retry>Повторить</button></div>'; view.querySelector('[data-tv-load-retry]').onclick = () => { if (tab === 'tv') renderTab(); }; } return; }
  if (!alive(t)) return;
  const highlights=()=>{const recent=Object.entries(tvStats()).filter(([id,s])=>s.last&&tvChan(id)).sort((a,b)=>b[1].last-a[1].last).slice(0,14).map(([id])=>tvChan(id)),favs=tvFavs().map(tvChan).filter(Boolean);return (favs.length?`<section class="sec"><h2>Избранные</h2><div class="row chrow">${favs.map(tvCard).join('')}</div></section>`:'')+(recent.length?`<section class="sec"><h2>Недавно смотрели</h2><div class="row chrow">${recent.map(tvCard).join('')}</div></section>`:'');};
  const rows=TVD.cat==='Все'&&!TVD.q?highlights():'';
  let worldPending=[...tvFavs(),...Object.keys(tvStats())].some(id=>String(id).startsWith('x:')&&!tvChan(id));
  view.innerHTML = `<div class="mobile-catalog-head mobile-tv-head"><span>ТЕЛЕКАНАЛЫ LUMA</span><div><h1>ТВ</h1><button class="mobile-catalog-lists" id="tvWorld">${ico('globe')} Каналы мира</button></div><p>Эфиры и программа каналов.</p></div>
    <label class="sbox">${ico('search')}<input id="tvq" placeholder="Найти канал" autocomplete="off" value="${esc(TVD.q || '')}"></label>
    <div class="chips" id="tvc">${tvChipsList().map((g) => `<button class="chip ${g === TVD.cat ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
    <div class="mobile-sport-tabs mobile-tv-tabs"><button data-tv-mode="guide">Программа</button><button data-tv-mode="cards">Каналы</button></div><div class="mobile-tv-reminders"><button data-tv-reminders>Напоминания о передачах</button></div><div id="tvHighlights">${rows}</div><p class="mobile-tv-status" id="tvWorldStatus" hidden></p><div id="tvGrid"></div>`;
  const paintList = () => {
    const q = (TVD.q || '').trim().toLowerCase();
    TVD.list = tvFiltered().filter((c) => !q || c.name.toLowerCase().includes(q)); TVD.shown = 0;
    const status=$('#tvWorldStatus'),missing=tvFavs().filter(id=>String(id).startsWith('x:')&&!tvChan(id)).length;if(status){status.hidden=!missing;status.textContent=missing?(worldPending?'Загружаем избранные каналы мира…':'Часть избранных каналов мира недоступна. Откройте «Каналы мира», чтобы повторить загрузку.') :'';}
    const g = $('#tvGrid'); if (!g) return;
    g._tvList = TVD.list;
    g.className=tvMobileMode()==='guide'?'mobile-tv-guide-list':'chgrid'; const highlights=$('#tvHighlights');if(highlights)highlights.hidden=!!q||TVD.cat!=='Все'||tvMobileMode()==='guide';$$('[data-tv-mode]',view).forEach(b=>{const on=b.dataset.tvMode===tvMobileMode();b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    g.innerHTML = TVD.list.length ? '' : `<div class="empty"><h3>${TVD.cat === '★ Избранные' ? (missing?(worldPending?'Загружаем каналы':'Не удалось загрузить каналы'):'Пока пусто') : 'Каналов не нашлось'}</h3><p>${TVD.cat === '★ Избранные' ? (missing?'': 'Нажмите ☆ в плеере, чтобы добавить канал сюда.') : 'Попробуйте другое название.'}</p></div>`;
    tvMore();
  };
  $('#tvc').onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) { TVD.cat = b.dataset.g; renderTab(); } };
  $$('[data-tv-mode]',view).forEach(b=>b.onclick=()=>{try{localStorage.setItem('luma.m.tvMode',b.dataset.tvMode);}catch{}paintList();});
  $('[data-tv-reminders]',view).onclick=openMobileTvReminders;
  $('#tvWorld').onclick = () => openTvWorld({});
  const q = $('#tvq'); let qt = 0;
  q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { TVD.q = q.value; paintList(); }, 200); };
  view.onscroll = () => { if (tab === 'tv' && view.scrollTop + view.clientHeight > view.scrollHeight - 800) tvMore(); };
  paintList();tvTryPendingLogos(view);
  if(!worldPending)[...new Set(tvFavs().map(tvChan).filter(c=>c?.cc).map(c=>c.cc))].slice(0,3).forEach(cc=>tvWideEpgLoad(cc).catch(()=>{}));
  if(worldPending)tvWideLoad().then(()=>{worldPending=false;if(!alive(t)||tab!=='tv'||(typeof PG!=='undefined'&&PG.length))return;const h=$('#tvHighlights',view);if(h)h.innerHTML=highlights();if(TVD.cat==='★ Избранные')paintList();else{const status=$('#tvWorldStatus',view),missing=tvFavs().some(id=>String(id).startsWith('x:')&&!tvChan(id));if(status){status.hidden=!missing;status.textContent=missing?'Часть избранных каналов мира недоступна. Откройте «Каналы мира», чтобы повторить загрузку.':'';}}tvTryPendingLogos(view);[...new Set(tvFavs().map(tvChan).filter(c=>c?.cc).map(c=>c.cc))].slice(0,3).forEach(cc=>tvWideEpgLoad(cc).catch(()=>{}));}).catch(()=>{worldPending=false;if(alive(t)&&tab==='tv'&&!(typeof PG!=='undefined'&&PG.length))paintList();});
}
function tvMore() {
  const g = $('#tvGrid'); if (!g || TVD.shown >= TVD.list.length) return;
  const part = TVD.list.slice(TVD.shown, TVD.shown + 48); TVD.shown += part.length;
  g.insertAdjacentHTML('beforeend', part.map(tvMobileMode()==='guide'?tvGuideCard:tvCard).join(''));tvTryPendingLogos(g);
}
document.addEventListener('click', (e) => {
  const prog=e.target.closest('[data-tv-program]');if(prog){const c=tvChan(prog.dataset.tvProgram),p=c&&tvSchedule(c).find(x=>Number(x[0])===Number(prog.dataset.tvStart));if(c&&p)openMobileTvProgram(c,p);return;}
  const fav=e.target.closest('[data-tv-fav]');if(fav){const id=fav.dataset.tvFav,on=tvToggleFav(id),ch=tvChan(id),card=fav.closest('.mobile-tv-guide');if(card&&ch)card.outerHTML=tvGuideCard(ch);else{fav.setAttribute('aria-pressed',String(on));fav.setAttribute('aria-label',on?'Убрать из избранного':'Добавить в избранное');fav.textContent=on?'★':'☆';}if(card&&TVD.cat==='★ Избранные'&&tab==='tv'&&!(typeof PG!=='undefined'&&PG.length))renderTab();return;}
  const el = e.target.closest('.chc'); if (!el) return;
  const c = tvChan(el.dataset.ch); if (!c) return;
  const grid=el.closest('#wGrid, #tvGrid'), list=grid?._tvList;
  TVD.list = list?.some(item=>item.id===c.id) ? list : (TVD.channels.some(item=>item.id===c.id) ? TVD.channels : [c]);
  tvPlay(c);
});

/* ---------- каналы мира: страны и поиск ---------- */
async function openTvWorld(r, existingPg = null) {
  const pg = existingPg || pushPage();
  pg.innerHTML = backBtn() + '<div class="spin" style="margin-top:40vh"></div>';
  let all;
  try { all = await tvWideLoad(); } catch { if (alivePg(pg)) { pg.innerHTML = backBtn() + '<div class="empty" style="padding-top:35vh"><h3>Каталог не загрузился</h3><p>Проверьте интернет и попробуйте ещё раз.</p><button class="btn" data-tv-world-retry>Повторить</button></div>'; pg.querySelector('[data-tv-world-retry]').onclick = () => openTvWorld(r, pg); } return; }
  if (!alivePg(pg)) return;
  const cc = r.cc || '', base = cc ? all.filter((c) => c.cc === cc) : all;
  pg.innerHTML = `${backBtn()}<div class="mobile-catalog-head mobile-world-head"><span>ТЕЛЕКАНАЛЫ LUMA</span><div><h1>${cc ? esc(tvRegion(cc)) : 'Каналы мира'}</h1></div><p>${cc ? 'Прямые эфиры выбранной страны.' : 'Выберите страну или найдите канал по названию.'}</p></div>
    <label class="sbox">${ico('search')}<input id="wq" placeholder="${cc ? 'Найти канал' : 'Найти канал среди всех стран'}" autocomplete="off"></label><div id="wbody"></div>`;
  const body = $('#wbody', pg);
  const countries = () => {
    const n = {}; all.forEach((c) => { n[c.cc] = (n[c.cc] || 0) + 1; });
    const rows = Object.entries(n).map(([k, v]) => [k, v, tvRegion(k)]).sort((a, b) => b[1] - a[1]);
    body.innerHTML = `<div class="list">${rows.map(([k, v, name]) => `<button class="li" data-cc="${esc(k)}"><div>${esc(name)}<small>${v} каналов</small></div></button>`).join('')}</div><p class="about">Каталог ведёт сообщество проекта iptv-org. Часть ссылок может не работать.</p>`;
    $$('[data-cc]', body).forEach((b) => (b.onclick = () => openTvWorld({ cc: b.dataset.cc })));
  };
  const show = (list) => {
    body.innerHTML = list.length ? '<div class="chgrid" id="wGrid"></div>' : '<div class="empty"><h3>Каналов не нашлось</h3></div>';
    const g = $('#wGrid', body); if (!g) return;
    let shown = 0; const more = () => { const part = list.slice(shown, shown + 60); shown += part.length; g.insertAdjacentHTML('beforeend', part.map(c=>tvWorldCard(c,!cc)).join('')); tvTryPendingLogos(g); };
    more(); pg.onscroll = () => { if (shown < list.length && pg.scrollTop + pg.clientHeight > pg.scrollHeight - 800) more(); };
    g._tvList = list;
  };
  const run = () => { const q = ($('#wq', pg).value || '').trim().toLowerCase(); if (!q) { if (cc) show(base); else countries(); return; } show(base.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 300)); };
  if (cc) {show(base);tvWideEpgLoad(cc).catch(()=>{});} else countries();
  let wt = 0; $('#wq', pg).oninput = () => { clearTimeout(wt); wt = setTimeout(run, 250); };
}

/* ---------- воспроизведение ---------- */
function tvPlay(ch, srcIdx = 0, fresh = true) {
  if (!ch || !NATIVE || !NATIVE.npStart) return;
  if(ch.cc)tvWideEpgLoad(ch.cc).catch(()=>{});const linked=S.extra?.syncForeign?.tvEpgLinks?.[ch.id];if(linked?.cc)tvWideEpgLoad(linked.cc).catch(()=>{});
  const token = ++NP.token, first = !NP.on;
  Object.assign(NP, { on: true, completed: false, d: { id: -1, name: ch.name }, seasons: [], season: null, episode: null, key: '', tr: null, secs: [], menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '1', audioNames: [], scrub: null, skipSec: null, live: { ch, srcIdx: srcIdx % ch.sources.length, tries: first || fresh ? 0 : (NP.live ? NP.live.tries : 0) } });
  if (fresh) { tvX().tvLast = ch.id; const st = tvStats(); const s = (st[ch.id] = st[ch.id] || { n: 0, t: 0, last: 0, name: '' }); s.last = Math.max(Date.now(), Number(s.last || 0) + 1); s.n++; s.name = ch.name; save(); }
  npDom();
  const el = $('#np'); el.classList.remove('hidden'); el.classList.add('live'); document.body.classList.add('np'); document.documentElement.classList.add('np');
  npApplySubSize(); npSubLast = null; window.npCue('');
  try { NATIVE.playerMode(true); } catch {}
  $('#np .np-load').classList.remove('hidden');
  tvPaintHead();
  $('#npPrev').classList.toggle('hidden',!!ch.ephemeral); $('#npNext').classList.toggle('hidden',!!ch.ephemeral);['prog','list','src','star'].forEach(m=>$('.np-chips [data-m='+m+']')?.classList.toggle('hidden',!!ch.ephemeral));
  closeMenu(); npUi(5000);
  const src = ch.sources[NP.live.srcIdx];
  NATIVE.npStart(JSON.stringify({ url: src.url, ua: src.ua || NP_UA, referer: src.ref || '', startMs: 0, subs: [] }));
  clearTimeout(TVD.timers.start);TVD.timers.start=setTimeout(()=>{if(NP.on&&NP.live&&NP.token===token&&NP.st.b)tvEvent('error');},20000);
  clearInterval(TVD.timers.count);
  TVD.timers.count = setInterval(() => { if (NP.on && NP.live && NP.st.w) { const s = tvStats()[NP.live.ch.id]; if (s) { s.t += 15; s.last = Math.max(Date.now(), Number(s.last || 0) + 1); save(); } } }, 15000);
  clearInterval(TVD.timers.head); TVD.timers.head = setInterval(tvPaintHead, 20000);
}
function tvPaintHead() {
  if (!NP.on || !NP.live) return;
  const c = NP.live.ch, nn = tvNowNext(c);
  $('#np .np-title b').textContent = (tvIsFav(c.id) ? '★ ' : '') + c.name;
  $('#np .np-title span').textContent = (nn.now || c.group) + (nn.next ? ' · Дальше: ' + nn.next : '');
  const s = $('[data-m=src]'); if (s) s.textContent = c.sources.length > 1 ? `Источник ${NP.live.srcIdx + 1}/${c.sources.length}` : 'Источник';
  const st = $('[data-m=star]'); if (st) st.textContent = tvIsFav(c.id) ? '★ В избранном' : '☆ В избранное';
}
function tvZap(dir) {
  const list = TVD.list.length ? TVD.list : TVD.channels;
  let i = list.findIndex((c) => c.id === NP.live.ch.id); if (i < 0) i = 0;
  tvPlay(list[(i + dir + list.length) % list.length]);
}
function tvEvent(ev) {
  const L = NP.live; if (!L) return;
  if (ev === 'ready') { clearTimeout(TVD.timers.start); $('#np .np-load').classList.add('hidden'); npPaintChips(); }
  else if (ev === 'error') {
    clearTimeout(TVD.timers.start);
    if (L.ch.sources.length > 1 && L.tries < L.ch.sources.length - 1) { L.tries++; toast('Источник ' + (((L.srcIdx + 1) % L.ch.sources.length) + 1) + ' из ' + L.ch.sources.length); tvPlay(L.ch, L.srcIdx + 1, false); return; }
    try{NATIVE.npStop();}catch{} $('#np .np-load').classList.add('hidden'); toast(L.ch.ephemeral?'Не удалось открыть эфир':'Нет сигнала. Выберите другой канал');
  }
}
function tvClean() { clearTimeout(TVD.timers.start); clearInterval(TVD.timers.count); clearInterval(TVD.timers.head); $('#np')?.classList.remove('live'); NP.live = null; }
function tvChip(m) {
  if (m === 'star') { const on = tvToggleFav(NP.live.ch.id); toast(on ? 'Канал в избранном' : 'Убрано из избранного'); tvPaintHead(); return; }
  if (m === 'src') { if (NP.live.ch.sources.length > 1) { NP.live.tries=0; tvPlay(NP.live.ch, NP.live.srcIdx + 1, false); } else toast('Источник один'); return; }
  openMenu(m);
}
/** Содержимое боковой панели для режима «live»: телепрограмма и список каналов. */
function tvMenu(kind) {
  const ch = NP.live.ch;
  if (kind === 'prog') {
    const list = tvSchedule(ch), now = Date.now();
    let day = '', rows = '';
    for (const [s0, e0, title] of list) {
      if (e0 < now - 2 * 3600e3) continue;
      const d = new Date(s0).toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' });
      if (d !== day) { day = d; rows += `<h4>${esc(d)}</h4>`; }
      const isNow = s0 <= now && now < e0;
      rows += `<div class="tp ${isNow ? 'now' : e0 < now ? 'past' : ''}"><span>${tvHm(s0)}–${tvHm(e0)}</span><b>${esc(title)}</b></div>`;
    }
    return { title: 'Телепрограмма · ' + ch.name, html: rows || '<div class="me">Для этого канала телепрограмма не найдена.</div>' };
  }
  const list = TVD.list.length ? TVD.list : TVD.channels, i = Math.max(0, list.findIndex((c) => c.id === ch.id)), from = Math.max(0, i - 60), part = list.slice(from, from + 200);
  return { title: TVD.cat + ' · ' + list.length, html: part.map((c) => `<button class="mr ${c.id === ch.id ? 'on' : ''}" data-tvplay="${esc(c.id)}"><i>${c.id === ch.id ? NPI.check : ''}</i><span>${esc(c.name)}</span><small>${esc(tvNowNext(c).now || '')}</small></button>`).join('') };
}
window.lumaOpenTv = async (id) => { try { await tvLoad(); const c = tvChan(id); if (c) { TVD.list = TVD.channels.some(item=>item.id===c.id) ? TVD.channels : [c]; tvPlay(c); } } catch {} };

function mobileTvReminderKey(c,p){return 'tv:'+encodeURIComponent(String(c.id||''))+':'+String(Number(p[0]));}
function mobileTvReminderOn(c,p){return !!mobileSportReminderStore()[mobileTvReminderKey(c,p)]?.on;}
function mobileTvReminderToggle(c,p){if(!c?.id||!Array.isArray(p)||!Number.isFinite(Number(p[0]))||Number(p[0])<=Date.now())return false;const key=mobileTvReminderKey(c,p),all=mobileSportReminderStore(),old=all[key],on=!old?.on;all[key]={id:key,kind:'tv',title:String(p[2]||'Передача').slice(0,240),channelId:String(c.id),channelName:String(c.name||'Телеканал').slice(0,160),channelScope:String(c.id).startsWith('x:')?'world':'all',startsAt:Number(p[0]),endsAt:Number(p[1])||0,on,ts:Math.max(Date.now(),Number(old?.ts||0)+1)};if(on){const fired=mobileSportReminderFired();delete fired[key+':'+Number(p[0])];try{localStorage.setItem(MOBILE_SPORT_FIRED,JSON.stringify(fired));}catch{}}save();if(on){mobileSyncReminders();mobileAskReminderPermission();setTimeout(mobileSportReminderTick,100);}return on;}
function openMobileTvProgram(c,p){const active=mobileTvReminderOn(c,p),hint=mobileReminderHint(),copy=hint.startsWith('Напомним за 15 минут.')?hint:'Напоминание за 15 минут. '+hint,sheet=openSheet(`<span class="mobile-sport-overline">${esc(c.name)}</span><h3>${esc(p[2])}</h3><p class="sub">${esc(new Date(p[0]).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}))} · ${esc(copy)}</p><div class="dbtns"><button class="btn" data-tv-program-close>Закрыть</button><button class="btn primary" data-tv-program-remind aria-label="${active?'Отменить напоминание':'Напомнить за 15 минут'}">${active?'Отменить':'Напомнить'}</button></div>`);$('[data-tv-program-close]',sheet).onclick=closeSheet;$('[data-tv-program-remind]',sheet).onclick=()=>{if(Number(p[0])<=Date.now()){closeSheet();toast('Передача уже началась');return;}const on=mobileTvReminderToggle(c,p);closeSheet();const card=[...document.querySelectorAll('[data-guide]')].find(el=>el.dataset.guide===c.id);if(card){const box=$('.mobile-tv-program',card);if(box)box.innerHTML=tvGuideProgramHtml(c);}toast(on?'Напоминание включено':'Напоминание отменено');};}
function openMobileTvReminders(){const sheet=openSheet('<h3>Напоминания о передачах</h3><p class="sub" data-tv-reminder-hint></p><button class="btn" data-tv-reminder-settings hidden>Настроить уведомления</button><button class="btn" data-tv-reminder-exact hidden>Разрешить точное время</button><div data-tv-reminder-list></div><button class="btn" data-tv-reminder-close>Закрыть</button>');const hint=$('[data-tv-reminder-hint]',sheet),settings=$('[data-tv-reminder-settings]',sheet);hint.textContent=mobileReminderHint();settings.hidden=mobileReminderNativeEnabled();settings.onclick=()=>NATIVE?.remindersOpenSettings?.();const exact=$('[data-tv-reminder-exact]',sheet);exact.hidden=!mobileReminderNativeEnabled()||mobileReminderExactEnabled();exact.onclick=()=>NATIVE?.remindersOpenExactSettings?.();const draw=()=>{const now=Date.now(),entries=Object.values(mobileSportReminderStore()).filter(x=>x?.kind==='tv'&&x.on&&Number(x.startsAt)>now).sort((a,b)=>a.startsAt-b.startsAt),host=$('[data-tv-reminder-list]',sheet);host.innerHTML=entries.length?entries.map((x,i)=>`<button class="mobile-reminder-item" data-tv-reminder-remove="${i}"><span><b>${esc(x.title)}</b><small>${esc(new Date(Number(x.startsAt)).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}))} · ${esc(x.channelName)}</small></span><i>×</i></button>`).join(''):'<p class="sub">Напоминаний пока нет.</p>';$$('[data-tv-reminder-remove]',host).forEach(b=>b.onclick=()=>{const x=entries[Number(b.dataset.tvReminderRemove)],all=mobileSportReminderStore(),old=x&&all[x.id];if(!old)return;all[x.id]={...old,on:false,ts:Math.max(Date.now(),Number(old.ts||0)+1)};save();draw();tvPaintNow();});};$('[data-tv-reminder-close]',sheet).onclick=closeSheet;draw();}
