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
  pg.innerHTML = `${backBtn()}<div class="mobile-catalog-head mobile-lists-head"><span>КОЛЛЕКЦИИ LUMA</span><div><h1>Подборки</h1></div><p>Истории, собранные сообществом и сервисами.</p></div>
    <label class="sbox">${ico('search')}<input id="lq" placeholder="Название или тема" autocomplete="off"></label>
    <div id="lres"></div><div id="ltop"><div class="spin"></div></div>`;
  const q = $('#lq', pg); let seq = 0, qt = 0, topSeq = 0;
  const run = async () => {
    const text = q.value.trim(), my = ++seq;
    if (text.length < 2) { $('#lres', pg).innerHTML = ''; $('#ltop', pg).style.display = ''; return; }
    $('#ltop', pg).style.display = 'none'; $('#lres', pg).innerHTML = '<div class="spin"></div>';
    const query = await toEnglish(text), jobs = {};
    if (my !== seq || !alivePg(pg)) return;
    if (lsSecret('mdblist')) jobs.mdblist = async () => (await mdb('/lists/search', { query, limit: 40 })).filter((l) => !l.private).map(mdSummary);
    if (lsSecret('trakt')) jobs.trakt = async () => (await trakt('/search/list', { query, limit: 40 })).json.map((x) => x.list).filter((l) => l && l.privacy !== 'private' && l.ids && l.ids.trakt).map(trSummary);
    const out = {}, failed = []; await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { out[k] = await fn(); } catch { failed.push(k); } }));
    if (my !== seq || !alivePg(pg)) return;
    const a = out.mdblist || [], b = out.trakt || [], lists = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) lists.push(a[i]); if (b[i]) lists.push(b[i]); }
    $('#lres', pg).innerHTML = lists.length ? `<h3 class="ph3">${query.toLowerCase() !== text.toLowerCase() ? `Ищем «${esc(query)}»` : 'Найдено'}</h3>${failed.length?'<div class="lprog">Часть источников недоступна, результаты могут быть неполными. <button class="mobile-search-retry" data-list-search-retry>Повторить</button></div>':''}<div class="lgrid">${lists.map(listCard).join('')}</div>`
      : `<div class="empty"><h3>${failed.length?'Поиск временно недоступен':'Ничего не нашлось'}</h3><p>${failed.length?'Проверьте подключение и попробуйте снова.':Object.keys(jobs).length ? 'Попробуйте другое слово.' : 'Для поиска нужны ключи MDBList или Trakt: Моё → Настройки.'}</p>${failed.length?'<button class="btn" data-list-search-retry>Повторить</button>':''}</div>`;
    lsEnhance($('#lres', pg));
  };
  $('#lres',pg).onclick=e=>{if(e.target.closest('[data-list-search-retry]'))run();};
  q.oninput = () => { seq++; clearTimeout(qt); qt = setTimeout(run, 450); };
  pg._onClose = () => { seq++; topSeq++; clearTimeout(qt); };
  pg._refreshSaved = () => { const box=$('[data-ls-saved]',pg);if(box){box.innerHTML=lsRowHtml('Сохранённые',savedLists());lsEnhance(box);} };
  const jobs = { letterboxd: lbPopular };
  if (lsSecret('mdblist')) jobs.mdblist = async () => (await mdb('/lists/top', { limit: 30 })).filter((l) => !l.private).map(mdSummary);
  if (lsSecret('trakt')) jobs.trakt = async () => (await trakt('/lists/popular', { limit: 30 })).json.map((x) => x.list).filter((l) => l && l.ids && l.ids.trakt).map(trSummary);
  const loadTop = async () => {
    const current=++topSeq, top=$('#ltop',pg); top.innerHTML='<div data-ls-saved></div><div class="spin"></div>'; pg._refreshSaved();
    const res={}, failed=[];
    await Promise.all(Object.entries(jobs).map(async ([k, fn]) => { try { res[k] = await fn(); } catch { res[k] = []; failed.push(k); } }));
    if (!alivePg(pg) || current!==topSeq) return;
    const html = lsRowHtml('MDBList · популярные', res.mdblist || []) + lsRowHtml('Trakt · популярные', res.trakt || []) + lsRowHtml('Letterboxd · популярные', res.letterboxd || []);
    const notice=failed.length?'<div class="empty"><h3>Некоторые подборки недоступны</h3><p>Проверьте подключение и попробуйте ещё раз.</p><button class="btn" data-list-top-retry>Повторить</button></div>':!html&&!savedLists().length?'<div class="empty"><h3>Подборки не загрузились</h3><p>Попробуйте ещё раз.</p><button class="btn" data-list-top-retry>Повторить</button></div>':'';
    top.innerHTML='<div data-ls-saved></div>'+html+notice;pg._refreshSaved();lsEnhance(pg);
  };
  $('#ltop',pg).onclick=e=>{if(e.target.closest('[data-list-top-retry]'))loadTop();};
  await loadTop();
}

async function openList(ref, existingPg = null) {
  const pg = existingPg || pushPage();
  if (existingPg && pg._onClose) { pg._onClose(); pg._onClose = null; }
  pg.innerHTML = backBtn() + '<div class="spin" style="margin-top:40vh"></div>';
  let L;
  try { L = await getList(ref); } catch (e) { if (alivePg(pg)) { pg.innerHTML = backBtn() + `<div class="empty" style="padding-top:35vh"><h3>Не получилось открыть подборку</h3><p>${esc(LS_ERR[e.code] || 'Проверьте интернет и попробуйте ещё раз.')}</p><button class="btn" data-list-open-retry>Повторить</button></div>`; pg.querySelector('[data-list-open-retry]').onclick = () => openList(ref, pg); } return; }
  if (!alivePg(pg)) return;
  const found = [], total = L.films.length;
  pg.innerHTML = `${backBtn()}<div class="mobile-catalog-head mobile-list-detail"><span>ПОДБОРКА · ${esc(LS_SRC[srcOfList(L)] || 'LUMA')}</span><div><h1>${esc(L.title)}</h1></div><p>${esc([L.author, (L.count || total) + ' ' + plural(L.count || total, 'фильм', 'фильма', 'фильмов')].filter(Boolean).join(' · '))}</p>${L.desc?`<p class="mobile-list-description cl" id="ldesc">${esc(L.desc)}</p><button class="mobile-list-expand" id="lexpand" aria-expanded="false" hidden>Читать описание</button>`:''}<button class="btn ${isListSaved(L.url) ? '' : 'primary'}" id="lsave">${ico('heart')}<span>${isListSaved(L.url) ? 'В сохранённых' : 'Сохранить'}</span></button></div>
    ${L.failedPages?.length?'<div class="lprog">Часть страниц источника не загрузилась. <button class="mobile-search-retry" data-list-source-retry>Повторить</button></div>':''}<p class="lprog" id="lprog"></p><div class="grid" id="lgrid"></div><div class="mobile-list-more" data-list-more></div>`;
  const desc=$('#ldesc',pg),expand=$('#lexpand',pg);let descObserver;if(desc&&expand){const measure=()=>{if(!desc.classList.contains('expanded'))expand.hidden=desc.scrollHeight<=desc.clientHeight+1;};measure();if(typeof ResizeObserver!=='undefined'){descObserver=new ResizeObserver(measure);descObserver.observe(desc);}expand.addEventListener('click',()=>{const expanded=desc.classList.toggle('expanded');expand.textContent=expanded?'Свернуть описание':'Читать описание';expand.setAttribute('aria-expanded',String(expanded));if(!expanded)measure();});}
  $('[data-list-source-retry]',pg)?.addEventListener('click',()=>openList(ref,pg));
  $('#lsave', pg).onclick = () => {
    const a = savedLists(), i = a.findIndex((x) => x.url === L.url);
    if (i >= 0) {markListRemoved(L.url);a.splice(i, 1);} else a.unshift({ url: L.url, source: srcOfList(L), title: L.title, author: L.author, count: L.count, desc: (L.desc || '').slice(0, 160), names: L.names || [], at:listSavedAt(L.url) });
    save(); PG.forEach(page=>page._refreshSaved?.()); const on = i < 0; $('#lsave', pg).classList.toggle('primary', !on); $('#lsave span', pg).textContent = on ? 'В сохранённых' : 'Сохранить'; toast(on ? 'Подборка сохранена' : 'Подборка убрана');
  };
  const grid=$('#lgrid',pg),prog=$('#lprog',pg),more=$('[data-list-more]',pg),seen=new Set();let offset=0,busy=false,blocked=false,emptyRuns=0,observer,active=true;
  const paint=()=>{prog.textContent=offset>=total?`В Luma есть ${found.length} из ${total}`:`Ищем в Luma… проверено ${offset} из ${total}, нашли ${found.length}`;};
  const load=async()=>{if(!active||busy||blocked||offset>=total||!alivePg(pg))return;busy=true;more.innerHTML='<div class="spin"></div>';try{const got=await Promise.all(L.films.slice(offset,offset+8).map(matchFilm));if(!active||!alivePg(pg))return;offset=Math.min(total,offset+8);const add=[];for(const item of got){if(!item||item.id==null)continue;const key=String(item.id);if(seen.has(key))continue;seen.add(key);found.push(item);add.push(item);}if(add.length){emptyRuns=0;grid.insertAdjacentHTML('beforeend',add.map(card).join(''));}else emptyRuns++;paint();blocked=offset<total&&emptyRuns>=4;more.innerHTML=offset>=total?(found.length?'':'<div class="empty"><h3>В Luma пока ничего нет</h3><p>Загляните позже.</p></div>'):blocked?'<button class="btn" data-list-continue>Искать дальше</button>':'<div class="spin"></div>';if(offset>=total)observer?.disconnect();}catch{if(active&&alivePg(pg)){blocked=true;more.innerHTML='<button class="btn" data-list-continue>Повторить загрузку</button>';}}finally{busy=false;if(active&&alivePg(pg)&&!blocked&&offset<total)requestAnimationFrame(()=>{if(active&&alivePg(pg)&&more.getBoundingClientRect().top<pg.getBoundingClientRect().bottom+400)load();});}};
  more.onclick=e=>{if(e.target.closest('[data-list-continue]')){blocked=false;emptyRuns=0;load();}};
  observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)load();},{root:pg,rootMargin:'400px'});observer.observe(more);pg._onClose=()=>{active=false;observer.disconnect();descObserver?.disconnect();};paint();if(total)load();else more.innerHTML='<div class="empty"><h3>В подборке пока ничего нет</h3></div>';

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
