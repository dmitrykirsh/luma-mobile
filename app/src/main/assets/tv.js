'use strict';
/* ТВ-каналы на телефоне: список, избранное, недавние, каталог мира, телепрограмма. Играет нативный плеер (см. player.js, режим «live»). */
const tvChipsList = () => {
  const g = new Map();
  for (const c of TVD.channels) g.set(c.group, (g.get(c.group) || 0) + 1);
  return ['Все', '★ Избранные', ...[...g.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0])];
};
const tvFiltered = () => TVD.channels.filter((c) => TVD.cat === 'Все' || (TVD.cat === '★ Избранные' ? tvIsFav(c.id) : c.group === TVD.cat));
const tvHm = (ms) => new Date(ms).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

function tvCard(c) {
  const nn = tvNowNext(c);
  return `<button class="chc" data-ch="${esc(c.id)}"><div class="lg"><span>${esc(c.name.slice(0, 2))}</span>${c.logo ? `<img decoding="async" loading="lazy" src="${esc(/^https?:/.test(c.logo) ? c.logo : '')}" alt="" onerror="this.remove()">` : ''}</div>
    <div class="cn"><b>${esc(c.name)}</b><small>${nn.now ? esc(nn.now) : esc(c.group)}</small></div>${nn.pct != null ? `<i class="pg" style="width:${nn.pct}%"></i>` : ''}</button>`;
}
function tvPaintNow() {
  if (tab !== 'tv') return;
  $$('.chc').forEach((el) => {
    const c = tvChan(el.dataset.ch); if (!c) return;
    const nn = tvNowNext(c), s = $('small', el); if (s && nn.now) s.textContent = nn.now;
    let pg = $('.pg', el); if (nn.pct != null) { if (!pg) { pg = document.createElement('i'); pg.className = 'pg'; el.appendChild(pg); } pg.style.width = nn.pct + '%'; }
  });
}

/* ---------- вкладка «ТВ» ---------- */
async function renderTv(t) {
  const view = $('#view'); view.onscroll = null;
  view.innerHTML = '<div class="top"><h1>ТВ</h1></div><div class="spin"></div>';
  try { await tvLoad(); } catch { if (alive(t)) view.innerHTML = '<div class="top"><h1>ТВ</h1></div><div class="empty"><h3>Каналы не загрузились</h3><p>Проверьте интернет и откройте вкладку ещё раз.</p></div>'; return; }
  if (!alive(t)) return;
  const recent = Object.entries(tvStats()).filter(([id, s]) => s.last && tvChan(id)).sort((a, b) => b[1].last - a[1].last).slice(0, 14).map(([id]) => tvChan(id));
  const favs = tvFavs().map(tvChan).filter(Boolean);
  const rows = TVD.cat === 'Все' && !TVD.q
    ? (favs.length ? `<section class="sec"><h2>Избранные</h2><div class="row chrow">${favs.map(tvCard).join('')}</div></section>` : '') + (recent.length ? `<section class="sec"><h2>Недавно смотрели</h2><div class="row chrow">${recent.map(tvCard).join('')}</div></section>` : '') : '';
  view.innerHTML = `<div class="top"><h1>ТВ</h1><button class="ib" id="tvWorld" title="Каналы мира">${ico('globe')}</button></div>
    <label class="sbox">${ico('search')}<input id="tvq" placeholder="Найти канал" autocomplete="off" value="${esc(TVD.q || '')}"></label>
    <div class="chips" id="tvc">${tvChipsList().map((g) => `<button class="chip ${g === TVD.cat ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
    ${rows}<div class="chgrid" id="tvGrid"></div>`;
  const paintList = () => {
    const q = (TVD.q || '').trim().toLowerCase();
    TVD.list = tvFiltered().filter((c) => !q || c.name.toLowerCase().includes(q)); TVD.shown = 0;
    const g = $('#tvGrid'); if (!g) return;
    g.innerHTML = TVD.list.length ? '' : `<div class="empty"><h3>${TVD.cat === '★ Избранные' ? 'Пока пусто' : 'Каналов не нашлось'}</h3><p>${TVD.cat === '★ Избранные' ? 'Нажмите ☆ в плеере, чтобы добавить канал сюда.' : 'Попробуйте другое название.'}</p></div>`;
    tvMore();
  };
  $('#tvc').onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) { TVD.cat = b.dataset.g; renderTab(); } };
  $('#tvWorld').onclick = () => openTvWorld({});
  const q = $('#tvq'); let qt = 0;
  q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { TVD.q = q.value; paintList(); }, 200); };
  view.onscroll = () => { if (tab === 'tv' && view.scrollTop + view.clientHeight > view.scrollHeight - 800) tvMore(); };
  paintList();
}
function tvMore() {
  const g = $('#tvGrid'); if (!g || TVD.shown >= TVD.list.length) return;
  const part = TVD.list.slice(TVD.shown, TVD.shown + 48); TVD.shown += part.length;
  g.insertAdjacentHTML('beforeend', part.map(tvCard).join(''));
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.chc'); if (!el) return;
  const c = tvChan(el.dataset.ch); if (!c) return;
  if (!TVD.list.length) TVD.list = TVD.channels;
  tvPlay(c);
});

/* ---------- каналы мира: страны и поиск ---------- */
async function openTvWorld(r) {
  const pg = pushPage();
  pg.innerHTML = backBtn() + '<div class="spin" style="margin-top:40vh"></div>';
  let all;
  try { all = await tvWideLoad(); } catch { if (alivePg(pg)) pg.innerHTML = backBtn() + '<div class="empty" style="padding-top:40vh"><h3>Каталог не загрузился</h3><p>Проверьте интернет и попробуйте ещё раз.</p></div>'; return; }
  if (!alivePg(pg)) return;
  const cc = r.cc || '', base = cc ? all.filter((c) => c.cc === cc) : all;
  pg.innerHTML = `${backBtn()}<div class="top" style="padding-top:calc(var(--sat) + 62px)"><h1>${cc ? esc(tvRegion(cc)) : 'Каналы мира'}</h1></div>
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
    let shown = 0; const more = () => { const part = list.slice(shown, shown + 60); shown += part.length; g.insertAdjacentHTML('beforeend', part.map(tvCard).join('')); };
    more(); pg.onscroll = () => { if (shown < list.length && pg.scrollTop + pg.clientHeight > pg.scrollHeight - 800) more(); };
    TVD.list = list;
  };
  const run = () => { const q = ($('#wq', pg).value || '').trim().toLowerCase(); if (!q) { if (cc) show(base); else countries(); return; } show(base.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 300)); };
  if (cc) show(base); else countries();
  let wt = 0; $('#wq', pg).oninput = () => { clearTimeout(wt); wt = setTimeout(run, 250); };
}

/* ---------- воспроизведение ---------- */
function tvPlay(ch, srcIdx = 0, fresh = true) {
  if (!ch || !NATIVE || !NATIVE.npStart) return;
  const token = ++NP.token, first = !NP.on;
  Object.assign(NP, { on: true, d: { id: -1, name: ch.name }, seasons: [], season: null, episode: null, key: '', tr: null, secs: [], menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '1', audioNames: [], scrub: null, skipSec: null, live: { ch, srcIdx: srcIdx % ch.sources.length, tries: first || fresh ? 0 : (NP.live ? NP.live.tries : 0) } });
  if (fresh) { tvX().tvLast = ch.id; const st = tvStats(); const s = (st[ch.id] = st[ch.id] || { n: 0, t: 0, last: 0, name: '' }); s.last = Date.now(); s.n++; s.name = ch.name; save(); }
  npDom();
  const el = $('#np'); el.classList.remove('hidden'); el.classList.add('live'); document.body.classList.add('np'); document.documentElement.classList.add('np');
  npApplySubSize(); npSubLast = null; window.npCue('');
  try { NATIVE.playerMode(true); } catch {}
  $('#np .np-load').classList.remove('hidden');
  tvPaintHead();
  $('#npPrev').classList.remove('hidden'); $('#npNext').classList.remove('hidden');
  closeMenu(); npUi(5000);
  const src = ch.sources[NP.live.srcIdx];
  NATIVE.npStart(JSON.stringify({ url: src.url, ua: src.ua || NP_UA, referer: src.ref || '', startMs: 0, subs: [] }));
  clearInterval(TVD.timers.count);
  TVD.timers.count = setInterval(() => { if (NP.on && NP.live && NP.st.w) { const s = tvStats()[NP.live.ch.id]; if (s) { s.t += 15; s.last = Date.now(); save(); } } }, 15000);
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
  if (ev === 'ready') { $('#np .np-load').classList.add('hidden'); npPaintChips(); }
  else if (ev === 'error') {
    if (L.ch.sources.length > 1 && L.tries < L.ch.sources.length - 1) { toast('Источник ' + (((L.srcIdx + 1) % L.ch.sources.length) + 1) + ' из ' + L.ch.sources.length); tvPlay(L.ch, L.srcIdx + 1, false); return; }
    $('#np .np-load').classList.add('hidden'); toast('Нет сигнала. Выберите другой канал');
  }
}
function tvClean() { clearInterval(TVD.timers.count); clearInterval(TVD.timers.head); $('#np')?.classList.remove('live'); NP.live = null; }
function tvChip(m) {
  if (m === 'star') { const on = tvToggleFav(NP.live.ch.id); toast(on ? 'Канал в избранном' : 'Убрано из избранного'); tvPaintHead(); return; }
  if (m === 'src') { if (NP.live.ch.sources.length > 1) tvPlay(NP.live.ch, NP.live.srcIdx + 1, false); else toast('Источник один'); return; }
  openMenu(m);
}
/** Содержимое боковой панели для режима «live»: телепрограмма и список каналов. */
function tvMenu(kind) {
  const ch = NP.live.ch;
  if (kind === 'prog') {
    const id = (ch.tvg && TVD.epg.programmes[ch.tvg]) ? ch.tvg : TVD.epg.alias[ch.id];
    const list = (id && TVD.epg.programmes[id]) || [], now = Date.now();
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
window.lumaOpenTv = async (id) => { try { await tvLoad(); const c = tvChan(id); if (c) { TVD.list = TVD.list.length ? TVD.list : TVD.channels; tvPlay(c); } } catch {} };
