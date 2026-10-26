'use strict';
/* Плеер Luma для телефона: видео играет нативный ExoPlayer под прозрачной страницей, а управление, меню и субтитры рисует этот интерфейс.
   Жесты: тап — панель, двойной тап — ±10 с или пауза, свайп вбок — перемотка, свайп вверх и вниз — громкость (справа) и яркость (слева). */
const NP = { on: false, d: null, seasons: [], season: null, episode: null, key: '', data: null, src: null, prev: null, st: { p: 0, d: 0, pl: false, b: false, w: false }, menu: '', secs: [], audioNames: [], token: 0, ui: false, uiT: 0, lastSave: 0, subApplied: '', scrub: null, skipSec: null };
const npFmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const npPrefs = () => (S.player = S.player || {});
const sprites = new Map();
const NPI = {
  play: '<svg viewBox="0 0 24 24" class="f"><path d="M7 4.500v15l13-7.500z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="f"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" class="f"><path d="M6 5h2.400v14H6zM20 5.500v13L9.500 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" class="f"><path d="M15.600 5H18v14h-2.400zM4 5.500v13L14.500 12z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
  rew: '<svg viewBox="0 0 24 24"><path d="M3.500 12a8.500 8.500 0 1 0 2.700-6.200"/><path d="M3 3.800v4.700h4.700"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M20.500 12a8.500 8.500 0 1 1-2.700-6.200"/><path d="M21 3.800v4.700h-4.700"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400L7 17M17 7l1.400-1.400"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9.500v5h3.500l4.500 3.800V5.700L7.500 9.500z"/><path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/></svg>'
};

/* ---------- запуск и закрытие ---------- */
function npDom() {
  const el = $('#np'); if (el.dataset.ready) return; el.dataset.ready = 1;
  el.innerHTML = `<div class="np-load"><div class="spin"></div></div><div class="np-buf hidden"><div class="spin"></div></div>
    <div class="np-touch" id="npTouch"></div><div class="np-shade"></div>
    <div class="np-fb l"></div><div class="np-fb r"></div><div class="np-hint hidden"></div>
    <div class="np-top"><button class="np-ib" id="npBack">${NPI.back}</button><div class="np-title"><b></b><span></span></div></div>
    <div class="np-mid"><button class="np-ib m" id="npPrev">${NPI.prev}</button><button class="np-ib big" id="npToggle">${NPI.pause}</button><button class="np-ib m" id="npNext">${NPI.next}</button></div>
    <div class="np-sub"></div>
    <div class="np-skip hidden"><button id="npSkip"><span></span></button></div>
    <div class="np-bot"><div class="np-seek" id="npSeek"><div class="np-thumb hidden"><div class="img"></div><span></span></div><div class="rail"><i class="pos"></i></div><b class="knob"></b></div>
      <div class="np-times"><span class="t0">0:00</span><span class="t1">0:00</span></div>
      <div class="np-chips"><button class="lv" data-m="prog">Программа</button><button class="lv" data-m="list">Каналы</button><button class="lv" data-m="src">Источник</button><button class="lv" data-m="star">☆ В избранное</button><button class="vod" data-m="eps">Серии</button><button data-m="audio">Звук</button><button class="vod" data-m="subs">Субтитры</button><button data-m="quality">Качество</button><button class="vod" data-m="speed">Скорость</button></div></div>
    <div class="np-menu hidden" id="npMenu"></div>`;
  $('#npBack').onclick = () => npClose();
  $('#npToggle').onclick = () => { NATIVE.npCmd('toggle', 0); npUi(3500); };
  $('#npPrev').onclick = () => (NP.live ? tvZap(-1) : npNext(-1));
  $('#npNext').onclick = () => (NP.live ? tvZap(1) : npNext(1));
  $('#npSkip').onclick = () => npDoSkip();
  $$('.np-chips button').forEach((b) => (b.onclick = () => (NP.live && ['star', 'src'].includes(b.dataset.m) ? tvChip(b.dataset.m) : openMenu(b.dataset.m))));
  bindTouch(); bindSeek();
  $('#npMenu').addEventListener('click', onMenuClick);
}
async function playItem(d, seasons, season, episode, opts = {}) {
  if (!NATIVE || !NATIVE.npStart) { toast('Плеер недоступен'); return; }
  const key = progKey(d.id, season, episode);
  const resume = opts.fromStart ? null : resumeInfo(d.id, season, episode);
  const token = ++NP.token;
  Object.assign(NP, { on: true, d, seasons, season, episode, key, tr: null, secs: [], menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '', scrub: null, skipSec: null });
  addHistory(d, season, episode);
  npDom(); NP.live = null; clearInterval(TVD.timers.count); clearInterval(TVD.timers.head);
  const el = $('#np'); el.classList.remove('live'); el.classList.remove('hidden'); document.body.classList.add('np'); document.documentElement.classList.add('np');
  npApplySubSize(); npSubLast = null; window.npCue('');
  try { NATIVE.playerMode(true); } catch {}
  $('#np .np-load').classList.remove('hidden');
  $('#np .np-title b').textContent = d.name;
  $('#np .np-title span').textContent = season ? `Сезон ${season} · Серия ${episode}` : [d.year, TYPES[d.type]].filter(Boolean).join(' · ');
  $('#npPrev').classList.toggle('hidden', !season); $('#npNext').classList.toggle('hidden', !season);
  $('.np-chips [data-m=eps]').classList.toggle('hidden', !season);
  closeMenu(); npUi(5000);
  let data;
  try { data = await npEmbed(d); } catch { if (token === NP.token) npFail('Не удалось получить поток'); return; }
  if (token !== NP.token) return;
  NP.data = data;
  const src = npSource(data, season, episode);
  if (!src || !src.hls) { npFail('Для этой серии нет потока'); return; }
  NP.prev = src.prev || null; NP.src = src; NP.secs = (src.sections || []).filter((x) => x.skip);
  if (NP.prev) { const P = NP.prev; for (let i = 0; i < 4; i++) { const u = P.src.replace('${spriteNum}', P.first + i); if (!sprites.has(u)) { new Image().src = u; sprites.set(u, 1); } } }
  NP.audioNames = (src.audio && src.audio.names) || [];
  const subs = (src.cc || []).map((c) => ({ url: c.url, name: c.name, lang: /eng|англ/i.test(c.name) ? 'en' : /рус|rus/i.test(c.name) ? 'ru' : '' }));
  if (resume) toast('Продолжаем с ' + fmtTime(resume.t));
  // 1080p есть только в DASH (VP9/AV1), HLS сайта отдаёт максимум 720p: DASH берём, если телефон умеет его аппаратно
  const urls = []; try { if (src.dash && NATIVE.npVp9 && NATIVE.npVp9()) urls.push(src.dash); if (src.dasha && NATIVE.npAv1 && NATIVE.npAv1()) urls.push(src.dasha); } catch {}
  urls.push(src.hls);
  NATIVE.npStart(JSON.stringify({ url: urls[0], urls, ua: NP_UA, referer: 'https://liftw.ws/', startMs: resume ? Math.floor(resume.t * 1000) : 0, subs }));
}
function npFail(msg) {
  const d = NP.d;
  if (NP.live || !d || !d.iframe_uri) { toast(msg); npClose(true); return; }
  toast(msg + ' — открываем плеер сайта'); npClose(true); openEmbed(d, NP.season, NP.episode);
}
/** Запасной вариант: родной плеер сайта в рамке на весь экран (ландшафт), если поток не удалось получить. */
function openEmbed(d, season, episode) {
  const pg = pushPage(); pg.classList.add('embed');
  let url = d.iframe_uri || '';
  try { const u = new URL(url); if (season) { u.searchParams.set('season', season); u.searchParams.set('episode', episode); } url = u.toString(); } catch {}
  pg.innerHTML = `${backBtn()}<iframe allow="autoplay; fullscreen; encrypted-media" allowfullscreen src="${esc(url)}"></iframe>`;
  pg._onClose = () => { try { NATIVE.playerMode(false); } catch {} };
  try { NATIVE.playerMode(true); } catch {}
}
function npClose(silent) {
  if (!NP.on) return;
  try { if (NP.st.d > 120000) storeProgress(NP.key, NP.st.p / 1000, NP.st.d / 1000); } catch {}
  NP.on = false; NP.token++; clearTimeout(NP.uiT); tvClean();
  try { if (window.syncAfterPlay) syncAfterPlay(); } catch {}
  try { NATIVE.npStop(); NATIVE.playerMode(false); } catch {}
  document.body.classList.remove('np'); document.documentElement.classList.remove('np');
  $('#np').classList.add('hidden'); closeMenu();
  if (!silent) refreshAfterPlay(); else if (typeof refreshAfterPlay === 'function') refreshAfterPlay();
}
window.npBack = () => { if (!NP.on) return false; if (NP.menu) { closeMenu(); return true; } npClose(); return true; };
window.npPauseIfPlaying = () => { if (NP.on && NP.st.w) NATIVE.npCmd('pause', 0); };

/* ---------- состояние от плеера ---------- */
window.npState = (s) => {
  if (!NP.on) return;
  NP.st = s;
  const p = s.p / 1000, d = s.d / 1000;
  if (d && !NP.scrub) paintSeek(p, d);
  $('#np .np-load').classList.toggle('hidden', !(s.b && s.p < 1500));
  $('#np .np-buf').classList.toggle('hidden', !(s.b && s.p >= 1500));
  const pb = $('#npToggle'); const html = s.w ? NPI.pause : NPI.play; if (pb.dataset.i !== (s.w ? 'p' : 'q')) { pb.innerHTML = html; pb.dataset.i = s.w ? 'p' : 'q'; }
  npSkipCheck(p);
  if (Date.now() - NP.lastSave > 5000 && d > 120 && s.p > 3000) { NP.lastSave = Date.now(); storeProgress(NP.key, p, d); }
};
window.npEvent = (ev, msg) => {
  if (!NP.on) return;
  if (NP.live) { tvEvent(ev, msg); return; }
  if (ev === 'ready') { $('#np .np-load').classList.add('hidden'); npApplyPrefs(); }
  else if (ev === 'ended') { storeProgress(NP.key, 1e9, 1e9); if (!npNext(1)) npClose(); }
  else if (ev === 'fallback') toast('Видео 1080p не запустилось, включаем обычный поток');
  else if (ev === 'error') npFail('Ошибка воспроизведения' + (msg ? ' (' + msg + ')' : ''));
  else if (ev === 'tracks') { if (NP.menu) renderMenu(); npPaintChips(); }
};
function paintSeek(p, d) {
  const r = Math.min(1, p / d) * 100;
  $('#np .pos').style.width = r + '%'; $('#np .knob').style.left = r + '%';
  $('#np .t0').textContent = npFmt(p); $('#np .t1').textContent = npFmt(d);
}
function npSkipCheck(p) {
  const btn = $('#np .np-skip'); if (!btn) return;
  const sec = NP.secs.find((x) => p >= x.start && p < x.end - 1);
  if (!sec) { btn.classList.add('hidden'); NP.skipSec = null; return; }
  NP.skipSec = sec;
  const next = sec.type === 'titer';
  if (next && !npHasNext()) { btn.classList.add('hidden'); NP.skipSec = null; return; }
  $('span', btn).textContent = next ? 'Следующая серия' : 'Пропустить заставку';
  btn.classList.remove('hidden');
}
function npDoSkip() {
  const s = NP.skipSec; if (!s) return;
  if (s.type === 'titer') { if (!npNext(1)) return; } else NATIVE.npCmd('seekTo', s.end * 1000);
  $('#np .np-skip').classList.add('hidden'); NP.skipSec = null;
}

/* ---------- серии ---------- */
const npList = () => { const out = []; for (const s of NP.seasons) for (const e of s.episodes) out.push([s.season, e]); return out; };
function npHasNext() { if (!NP.season) return false; const l = npList(); const i = l.findIndex(([s, e]) => String(s) === String(NP.season) && String(e) === String(NP.episode)); return i >= 0 && i < l.length - 1; }
function npNext(dir) {
  if (!NP.season) return false;
  const l = npList(); const i = l.findIndex(([s, e]) => String(s) === String(NP.season) && String(e) === String(NP.episode));
  const n = l[i + dir]; if (!n) return false;
  try { if (NP.st.d > 120000) storeProgress(NP.key, NP.st.p / 1000, NP.st.d / 1000); } catch {}
  playItem(NP.d, NP.seasons, n[0], n[1]); return true;
}

/* ---------- запомненные озвучка и субтитры ---------- */
function npAudioName(a) {
  const m = String(a.name || '').match(/(\d+)\s*$/); const idx = m ? Number(m[1]) : (/^\d+$/.test(String(a.name || '')) || a.name ? -1 : a.i);
  const nm = NP.audioNames[idx >= 0 ? idx : a.i];
  const lang = { ru: 'Русский', uk: 'Украинский', en: 'English' }[String(a.lang || '').slice(0, 2)] || '';
  return nm ? `${nm}` + (lang ? ` · ${lang}` : '') : (a.name || lang || 'Дорожка ' + (a.i + 1));
}
function npApplyPrefs() {
  let tr; try { tr = JSON.parse(NATIVE.npTracks()); } catch { return; }
  const pf = npPrefs();
  if (pf.audio) { const a = (tr.audio || []).find((x) => npAudioName(x) === pf.audio && !x.sel); if (a) NATIVE.npSelect('audio', a.g, a.t); }
  if (pf.sub && NP.subApplied !== NP.key) { const t = (tr.text || []).find((x) => x.name === pf.sub); if (t) NATIVE.npSelect('text', t.g, t.t); }
  NP.subApplied = NP.key; npPaintChips();
}
/* значения на кнопках: что сейчас выбрано */
function npPaintChips() {
  let tr = {}; try { tr = JSON.parse(NATIVE.npTracks()); } catch { return; }
  const set = (m, label, val) => { const b = $(`.np-chips [data-m=${m}]`); if (b) b.innerHTML = esc(label) + (val ? ` <em>${esc(val)}</em>` : ''); };
  const aud = (tr.audio || []).find((x) => x.sel), txt = (tr.text || []).find((x) => x.sel);
  set('audio', 'Звук', aud ? npAudioName(aud) : '');
  set('subs', 'Субтитры', tr.textOff || !txt ? 'выкл' : String(txt.name || '').replace(/\s*-\s*\d+$/, ''));
  set('quality', 'Качество', tr.autoVideo ? 'авто' + (NP.st.vh ? ' · ' + NP.st.vh + 'p' : '') : (NP.st.vh ? NP.st.vh + 'p' : ''));
  set('speed', 'Скорость', Math.abs((tr.speed || 1) - 1) < 0.01 ? '' : (tr.speed || 1) + '×');
}

/* ---------- субтитры: рисуем сами ---------- */
const NP_SUB_SIZES = [['s', 'Мелкие'], ['m', 'Обычные'], ['l', 'Крупные']];
let npSubLast = null;
function npApplySubSize() { $('#np').dataset.sub = npPrefs().subSize || 'm'; }
window.npCue = (t) => {
  if (t === npSubLast) return; npSubLast = t;
  const el = $('#np .np-sub'); if (!el) return;
  const h = esc(t || '').replace(/\r?\n/g, '<br>');
  el.innerHTML = h ? `<span>${h}</span>` : ''; el.classList.toggle('on', !!h);
};

/* ---------- панель: показать и спрятать ---------- */
function npUi(ms = 3500) {
  const el = $('#np'); el.classList.add('ui'); NP.ui = true; clearTimeout(NP.uiT);
  if (ms) NP.uiT = setTimeout(() => { if (!NP.menu && !NP.scrub) { el.classList.remove('ui'); NP.ui = false; } }, ms);
  npPaintChips();
}
function npUiHide() { clearTimeout(NP.uiT); $('#np').classList.remove('ui'); NP.ui = false; }

/* ---------- жесты ---------- */
function bindTouch() {
  const t = $('#npTouch');
  let g = null, lastTap = 0, tapT = 0;
  const hint = (kind, v) => {
    const h = $('#np .np-hint'); h.classList.remove('hidden');
    h.innerHTML = `${kind === 'b' ? NPI.sun : NPI.vol}<div><i style="width:${Math.round(v * 100)}%"></i></div>`;
    clearTimeout(hint.t); hint.t = setTimeout(() => h.classList.add('hidden'), 900);
  };
  const feedback = (side, text) => { const f = $('#np .np-fb.' + side); f.innerHTML = (side === 'l' ? NPI.rew : NPI.fwd) + `<span>${text}</span>`; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };
  t.addEventListener('pointerdown', (e) => {
    if (NP.menu) { closeMenu(); return; }
    try { t.setPointerCapture(e.pointerId); } catch {}
    g = { x: e.clientX, y: e.clientY, t0: Date.now(), mode: '', p0: NP.st.p / 1000, b0: -1, v0: -1, left: e.clientX < innerWidth / 2 };
  });
  t.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      g.mode = Math.abs(dx) > Math.abs(dy) ? 'seek' : (g.left ? 'bright' : 'vol');
      if (g.mode === 'bright') g.b0 = NATIVE.getBrightness(); if (g.mode === 'vol') g.v0 = NATIVE.getVolume();
      if (g.mode === 'seek') { NP.scrub = { t: g.p0 }; npUi(0); }
    }
    if (g.mode === 'seek') {
      const dur = NP.st.d / 1000; if (!dur) return;
      NP.scrub.t = Math.max(0, Math.min(dur - 2, g.p0 + (dx / innerWidth) * Math.min(dur, 240)));
      paintSeek(NP.scrub.t, dur); showThumb(NP.scrub.t, NP.scrub.t / dur);
    } else if (g.mode === 'bright') { const v = Math.max(0.02, Math.min(1, g.b0 - dy / (innerHeight * 0.8))); NATIVE.brightness(v); hint('b', v); }
    else if (g.mode === 'vol') { const v = Math.max(0, Math.min(1, g.v0 - dy / (innerHeight * 0.8))); NATIVE.volume(v); hint('v', v); }
  });
  const end = (e) => {
    if (!g) return; const cur = g; g = null;
    if (cur.mode === 'seek' && NP.scrub) { const tt = NP.scrub.t; NP.scrub = null; hideThumb(); NATIVE.npCmd('seekTo', Math.floor(tt * 1000)); npUi(2500); return; }
    if (cur.mode) return;
    if (Date.now() - cur.t0 > 350) return;
    const now = Date.now(), x = e.clientX / innerWidth;
    if (now - lastTap < 320) {
      clearTimeout(tapT); lastTap = 0;
      if (x < 0.33) { NATIVE.npCmd('seekBy', -10000); feedback('l', '−10 с'); }
      else if (x > 0.67) { NATIVE.npCmd('seekBy', 10000); feedback('r', '+10 с'); }
      else { NATIVE.npCmd('toggle', 0); npUi(3500); }
      return;
    }
    lastTap = now;
    tapT = setTimeout(() => { if (NP.ui) npUiHide(); else npUi(3500); }, 320);
  };
  t.addEventListener('pointerup', end);
  t.addEventListener('pointercancel', () => { g = null; if (NP.scrub) { NP.scrub = null; hideThumb(); } });
}
/* полоса перемотки */
function bindSeek() {
  const sk = $('#npSeek');
  let on = false;
  const ratio = (e) => { const r = $('.rail', sk).getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  sk.addEventListener('pointerdown', (e) => { const dur = NP.st.d / 1000; if (!dur) return; on = true; sk.setPointerCapture(e.pointerId); NP.scrub = { t: ratio(e) * dur }; npUi(0); paintSeek(NP.scrub.t, dur); showThumb(NP.scrub.t, ratio(e)); });
  sk.addEventListener('pointermove', (e) => { if (!on) return; const dur = NP.st.d / 1000, r = ratio(e); NP.scrub.t = r * dur; paintSeek(NP.scrub.t, dur); showThumb(NP.scrub.t, r); });
  const end = () => { if (!on) return; on = false; const tt = NP.scrub && NP.scrub.t; NP.scrub = null; hideThumb(); if (tt != null) NATIVE.npCmd('seekTo', Math.floor(tt * 1000)); npUi(2500); };
  sk.addEventListener('pointerup', end); sk.addEventListener('pointercancel', end);
}
function showThumb(t, r) {
  const box = $('#np .np-thumb'), P = NP.prev;
  box.classList.remove('hidden');
  const w = $('#np .rail').clientWidth, half = P ? 88 : 36;
  box.style.left = Math.max(half, Math.min(w - half, r * w)) + 'px';
  $('span', box).textContent = npFmt(t);
  const img = $('.img', box);
  if (!P) { img.style.display = 'none'; return; }
  img.style.display = '';
  const idx = Math.max(0, Math.floor(t / P.interval)), sprite = Math.floor(idx / P.size), k = idx % P.size;
  const url = P.src.replace('${spriteNum}', P.first + sprite);
  if (img.dataset.u !== url) { img.dataset.u = url; img.style.backgroundImage = `url("${url}")`; }
  img.style.backgroundSize = `${P.row * P.w}px ${(P.size / P.row) * P.h}px`;
  img.style.backgroundPosition = `${-(k % P.row) * P.w}px ${-Math.floor(k / P.row) * P.h}px`;
  img.style.width = P.w + 'px'; img.style.height = P.h + 'px';
}
const hideThumb = () => $('#np .np-thumb')?.classList.add('hidden');

/* ---------- меню ---------- */
const NP_SPEEDS = [0.75, 1, 1.1, 1.25, 1.5, 1.75, 2];
function openMenu(kind) { NP.menu = kind; clearTimeout(NP.uiT); $('#npMenu').classList.remove('hidden'); renderMenu(); }
function closeMenu() { NP.menu = ''; const m = $('#npMenu'); if (m) { m.classList.add('hidden'); m.innerHTML = ''; } if (NP.on) npUi(3000); }
function renderMenu() {
  const box = $('#npMenu'); if (!box || !NP.menu) return;
  if (NP.live && (NP.menu === 'prog' || NP.menu === 'list')) { const m = tvMenu(NP.menu); box.innerHTML = `<h3>${esc(m.title)}</h3><div class="ml">${m.html}</div>`; const cur = $('.mr.on', box); if (cur) cur.scrollIntoView({ block: 'center' }); return; }
  let tr = {}; try { tr = JSON.parse(NATIVE.npTracks()); } catch {}
  const row = (label, sel, attrs, sub) => `<button class="mr ${sel ? 'on' : ''}" ${attrs}><i>${sel ? NPI.check : ''}</i><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  let html = '', title = '';
  if (NP.menu === 'audio') {
    title = 'Звук';
    const list = (tr.audio || []).slice().sort((a, b) => a.i - b.i);
    html = list.length ? list.map((a) => row(npAudioName(a), a.sel, `data-nsel="audio" data-g="${a.g}" data-t="${a.t}" data-pref="${esc(npAudioName(a))}"`, a.ch > 2 ? '5.1' : '')).join('') : '<div class="me">Дорожек нет</div>';
  } else if (NP.menu === 'subs') {
    title = 'Субтитры';
    const list = tr.text || [];
    html = row('Выключены', tr.textOff || !list.some((x) => x.sel), 'data-nsel="text" data-g="-1" data-t="0" data-pref=""') + list.map((s) => row(s.name || 'Субтитры ' + (s.i + 1), s.sel && !tr.textOff, `data-nsel="text" data-g="${s.g}" data-t="${s.t}" data-pref="${esc(s.name || '')}"`)).join('');
    if (!list.length) html += '<div class="me">Для этого видео субтитров нет</div>';
    html += '<h4>Размер</h4>' + NP_SUB_SIZES.map(([k, l]) => row(l, (npPrefs().subSize || 'm') === k, `data-nsize="${k}"`)).join('');
  } else if (NP.menu === 'quality') {
    title = 'Качество' + (NP.st.vh ? ' · сейчас ' + NP.st.vh + 'p' : '');
    const seenH = new Set(), list = (tr.video || []).slice().sort((a, b) => b.h - a.h || Number(b.sel) - Number(a.sel)).filter((v) => { if (seenH.has(v.h)) return false; seenH.add(v.h); v.sel = (tr.video || []).some((x) => x.h === v.h && x.sel); return true; });
    html = row('Авто', tr.autoVideo, 'data-nsel="video" data-g="-1" data-t="0"') + list.map((v) => row(v.h + 'p', v.sel && !tr.autoVideo, `data-nsel="video" data-g="${v.g}" data-t="${v.t}"`, v.br ? (v.br / 1e6).toFixed(1) + ' Мбит/с' : '')).join('');
  } else if (NP.menu === 'speed') {
    title = 'Скорость';
    html = NP_SPEEDS.map((x) => row(x === 1 ? 'Обычная' : x + '×', Math.abs((tr.speed || 1) - x) < 0.01, `data-nspeed="${x}"`)).join('');
  } else if (NP.menu === 'eps') {
    title = 'Серии';
    const cur = NP.npSeason || NP.season, sObj = NP.seasons.find((s) => String(s.season) === String(cur)) || NP.seasons[0];
    html = `<div class="mch">${NP.seasons.map((s) => `<button class="${s.season == sObj.season ? 'on' : ''}" data-nseason="${s.season}">Сезон ${s.season}</button>`).join('')}</div><div class="meps">${sObj.episodes.map((e) => `<button class="${String(e) === String(NP.episode) && String(sObj.season) === String(NP.season) ? 'cur' : ''} ${isDone(NP.d.id, sObj.season, e) ? 'done' : ''}" data-nep="${e}" data-nsn="${sObj.season}">${e}</button>`).join('')}</div>`;
  }
  box.innerHTML = `<h3>${esc(title)}</h3><div class="ml">${html}</div>`;
}
function onMenuClick(e) {
  const el = e.target.closest('button'); if (!el) return;
  if (el.dataset.tvplay) { const c = tvChan(el.dataset.tvplay); closeMenu(); if (c) tvPlay(c); return; }
  if (el.dataset.nsize) { npPrefs().subSize = el.dataset.nsize; save(); npApplySubSize(); renderMenu(); return; }
  if (el.dataset.nsel) {
    NATIVE.npSelect(el.dataset.nsel, +el.dataset.g, +el.dataset.t);
    if (el.dataset.nsel === 'audio') npPrefs().audio = el.dataset.pref;
    if (el.dataset.nsel === 'text') npPrefs().sub = el.dataset.pref;
    save(); setTimeout(() => { closeMenu(); npPaintChips(); }, 150); return;
  }
  if (el.dataset.nspeed) { NATIVE.npCmd('speed', +el.dataset.nspeed); setTimeout(() => { closeMenu(); npPaintChips(); }, 150); return; }
  if (el.dataset.nseason) { NP.npSeason = el.dataset.nseason; renderMenu(); return; }
  if (el.dataset.nep) { const sn = el.dataset.nsn, ep = el.dataset.nep; NP.npSeason = null; closeMenu(); try { if (NP.st.d > 120000) storeProgress(NP.key, NP.st.p / 1000, NP.st.d / 1000); } catch {} playItem(NP.d, NP.seasons, sn, ep); }
}

/* ---------- трейлер с Rutube: тот же нативный плеер, без серий ---------- */
async function playTrailer(t) {
  if (!NATIVE || !NATIVE.npStart) { toast('Плеер недоступен'); return; }
  const token = ++NP.token;
  Object.assign(NP, { on: true, d: { id: -1, name: t.title }, seasons: [], season: null, episode: null, key: '', tr: null, secs: [], menu: '', st: { p: 0, d: 0, pl: false, b: true, w: true }, lastSave: 0, subApplied: '1', audioNames: [], scrub: null, skipSec: null });
  npDom(); tvClean(); $('#np').classList.remove('live');
  $('#np').classList.remove('hidden'); document.body.classList.add('np'); document.documentElement.classList.add('np');
  npApplySubSize(); npSubLast = null; window.npCue('');
  try { NATIVE.playerMode(true); } catch {}
  $('#np .np-load').classList.remove('hidden');
  $('#np .np-title b').textContent = t.title; $('#np .np-title span').textContent = 'Трейлер';
  $('#npPrev').classList.add('hidden'); $('#npNext').classList.add('hidden'); $('.np-chips [data-m=eps]').classList.add('hidden');
  closeMenu(); npUi(5000);
  try {
    const r = await fetch(tvPx(`https://rutube.ru/api/play/options/${t.id}/?no_404=true&referer=${encodeURIComponent('https://rutube.ru')}`, NP_UA, 'https://rutube.ru/', true));
    const o = await r.json(); const m3u8 = o.video_balancer && (o.video_balancer.m3u8 || o.video_balancer.default);
    if (token !== NP.token) return;
    if (!m3u8) throw new Error('NO_STREAM');
    NATIVE.npStart(JSON.stringify({ url: m3u8, ua: NP_UA, referer: 'https://rutube.ru/', startMs: 0, subs: [] }));
  } catch { if (token !== NP.token) return; npClose(true); toast('Трейлер не открылся'); }
}
