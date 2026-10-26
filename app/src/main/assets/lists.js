'use strict';
/* Экраны подборок: поиск, сохранённые, популярные, страница подборки с фильмами из каталога. Данные — listsdata.js. */
const LS_SRC = { letterboxd: 'Letterboxd', mdblist: 'MDBList', trakt: 'Trakt' };
const srcOfList = (l) => l.source || (String(l.url).startsWith('md:') ? 'mdblist' : String(l.url).startsWith('tr:') ? 'trakt' : 'letterboxd');
function listCard(l) {
  const n = l.count ? l.count + ' ' + plural(l.count, 'фильм', 'фильма', 'фильмов') : '';
  return `<button class="lc" data-list="${esc(l.url)}"><div class="lart"></div><span class="src ${srcOfList(l)}">${LS_SRC[srcOfList(l)] || ''}</span><b>${esc(l.title)}</b><small>${esc([l.author, n].filter(Boolean).join(' · '))}</small>${(l.names || []).length ? `<em>${esc(l.names.slice(0, 3).join(' · '))}</em>` : ''}</button>`;
}
const lsRowHtml = (title, lists) => (lists.length ? `<section class="sec"><h2>${esc(title)}</h2><div class="row lrow">${lists.map(listCard).join('')}</div></section>` : '');

/* постеры из подборки и название по-русски подставляются в карточки по очереди */
const lsQ = []; let lsBusy = 0;
function lsEnhance(root) { $$('.lc:not([data-enh])', root).forEach((c) => { c.dataset.enh = '1'; lsQ.push(c); }); lsPump(); }
function lsPump() {
  while (lsBusy < 2 && lsQ.length) {
    const c = lsQ.shift(); if (!document.contains(c)) continue;
    lsBusy++; lsCard(c).catch(() => {}).finally(() => { lsBusy--; lsPump(); });
  }
}
async function lsCard(c) {
  const b = $('b', c), title = b ? b.textContent : '';
  const [posters, ru] = await Promise.all([lsPreview(c.dataset.list).catch(() => []), lsRu(title).catch(() => title)]);
  if (!document.contains(c)) return;
  if (posters.length) $('.lart', c).innerHTML = posters.map((u) => `<img src="${esc(u)}" alt="" decoding="async" onerror="this.remove()">`).join('');
  if (b && ru && ru !== title) { b.textContent = ru; b.insertAdjacentHTML('afterend', `<i class="lorig">${esc(title)}</i>`); }
}

async function openLists() {
  const pg = pushPage();
  pg.innerHTML = `${backBtn()}<div class="top" style="padding-top:calc(var(--sat) + 62px)"><h1>Подборки</h1></div>
    <label class="sbox">${ico('search')}<input id="lq" placeholder="Например: ужасы, Хэллоуин, лучшие фильмы" autocomplete="off"></label>
    <div id="lres"></div><div id="ltop"><div class="spin"></div></div>`;
  const q = $('#lq', pg); let seq = 0, qt = 0;
  const run = async () => {
    const text = q.value.trim(), my = ++seq;
    if (text.length < 2) { $('#lres', pg).innerHTML = ''; $('#ltop', pg).style.display = ''; return; }
    $('#ltop', pg).style.display = 'none'; $('#lres', pg).innerHTML = '<div class="spin"></div>';
    const query = await toEnglish(text), jobs = {};
    if (lsSecret('mdblist')) jobs.mdblist = async () => (await mdb('/lists/search', { query, limit: 40 })).filter((l) => !l.private).map(mdSummary);
    if (lsSecret('trakt')) jobs.trakt = async () => (await trakt('/search/list', { query, limit: 40 })).json.map((x) => x.list).filter((l) => l && l.privacy !== 'private' && l.ids && l.ids.trakt).map(trSummary);
    const out = {}; await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { out[k] = await fn(); } catch {} }));
    if (my !== seq || !alivePg(pg)) return;
    const a = out.mdblist || [], b = out.trakt || [], lists = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) lists.push(a[i]); if (b[i]) lists.push(b[i]); }
    $('#lres', pg).innerHTML = lists.length ? `<h3 class="ph3">${query.toLowerCase() !== text.toLowerCase() ? `Ищем «${esc(query)}»` : 'Найдено'}</h3><div class="lgrid">${lists.map(listCard).join('')}</div>`
      : `<div class="empty"><h3>Ничего не нашлось</h3><p>${Object.keys(jobs).length ? 'Попробуйте другое слово.' : 'Для поиска нужны ключи MDBList или Trakt: Моё → Настройки.'}</p></div>`;
    lsEnhance($('#lres', pg));
  };
  q.oninput = () => { clearTimeout(qt); qt = setTimeout(run, 450); };
  const jobs = { letterboxd: lbPopular };
  if (lsSecret('mdblist')) jobs.mdblist = async () => (await mdb('/lists/top', { limit: 30 })).filter((l) => !l.private).map(mdSummary);
  if (lsSecret('trakt')) jobs.trakt = async () => (await trakt('/lists/popular', { limit: 30 })).json.map((x) => x.list).filter((l) => l && l.ids && l.ids.trakt).map(trSummary);
  const res = {};
  await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { res[k] = await fn(); } catch { res[k] = []; } }));
  if (!alivePg(pg)) return;
  const html = lsRowHtml('Сохранённые', savedLists()) + lsRowHtml('MDBList · популярные', res.mdblist || []) + lsRowHtml('Trakt · популярные', res.trakt || []) + lsRowHtml('Letterboxd · популярные', res.letterboxd || []);
  $('#ltop', pg).innerHTML = html || '<div class="empty"><h3>Подборки не загрузились</h3><p>Проверьте интернет.</p></div>';
  lsEnhance(pg);
}

async function openList(ref) {
  const pg = pushPage();
  pg.innerHTML = backBtn() + '<div class="spin" style="margin-top:40vh"></div>';
  let L;
  try { L = await getList(ref); } catch (e) { if (alivePg(pg)) pg.innerHTML = backBtn() + `<div class="empty" style="padding-top:40vh"><h3>Не получилось открыть подборку</h3><p>${esc(LS_ERR[e.code] || 'Проверьте интернет и попробуйте ещё раз.')}</p></div>`; return; }
  if (!alivePg(pg)) return;
  const found = [], total = L.films.length;
  pg.innerHTML = `${backBtn()}<div class="phead lhead"><div class="pinfo"><div class="ty">${esc(LS_SRC[srcOfList(L)] || '')}</div><h1>${esc(L.title)}</h1><div class="orig">${esc([L.author, (L.count || total) + ' ' + plural(L.count || total, 'фильм', 'фильма', 'фильмов')].filter(Boolean).join(' · '))}</div></div></div>
    ${L.desc ? `<div class="desc cl" id="ldesc">${esc(L.desc)}</div>` : ''}
    <div class="da" style="padding-top:0"><button class="btn ${isListSaved(L.url) ? '' : 'primary'}" id="lsave">${ico('heart')}<span>${isListSaved(L.url) ? 'В сохранённых' : 'Сохранить'}</span></button></div>
    <p class="lprog" id="lprog"></p><div class="grid" id="lgrid"></div>`;
  $('#lsave', pg).onclick = () => {
    const a = savedLists(), i = a.findIndex((x) => x.url === L.url);
    if (i >= 0) a.splice(i, 1); else a.unshift({ url: L.url, source: srcOfList(L), title: L.title, author: L.author, count: L.count, desc: (L.desc || '').slice(0, 160), names: L.names || [] });
    save(); const on = i < 0; $('#lsave', pg).classList.toggle('primary', !on); $('#lsave span', pg).textContent = on ? 'В сохранённых' : 'Сохранить'; toast(on ? 'Подборка сохранена' : 'Подборка убрана');
  };
  const grid = $('#lgrid', pg), prog = $('#lprog', pg);
  const paint = (done) => { prog.textContent = done >= total ? `В Luma есть ${found.length} из ${total}` : `Ищем в Luma… проверено ${done} из ${total}, нашли ${found.length}`; };
  paint(0);
  for (let i = 0; i < total; i += 8) {
    const got = await Promise.all(L.films.slice(i, i + 8).map(matchFilm));
    if (!alivePg(pg)) return;
    const add = got.filter(Boolean).filter((x) => !found.some((y) => y.id === x.id));
    found.push(...add);
    if (add.length) grid.insertAdjacentHTML('beforeend', add.map(card).join(''));
    paint(Math.min(total, i + 8));
  }
  paint(total);
  if (!found.length) grid.outerHTML = '<div class="empty"><h3>В Luma пока ничего нет</h3><p>Загляните позже.</p></div>';
}
document.addEventListener('click', (e) => { const c = e.target.closest('.lc'); if (c && c.dataset.list) openList(c.dataset.list); });

/* ---------- праздничная подборка на главной ---------- */
function homeHoliday(t) {
  if (!window.lumaHoliday) return;
  window.lumaHoliday.load(t, (set) => {
    if (!alive(t) || !$('#view') || tab !== 'home') return;
    const old = $('#holi'); if (old) old.remove();
    const items = set.items.map((x) => x.it);
    const html = `<section class="sec" id="holi"><h2>${esc(set.name)}<small>${esc(window.lumaHoliday.when(set.diff))}</small></h2><div class="row">${items.map(card).join('')}</div></section>`;
    const hb = $('#heroBox'); if (hb) hb.insertAdjacentHTML('afterend', html);
  });
}
