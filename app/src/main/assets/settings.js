'use strict';
/* Настройки (вкладка «Моё»): ключи сервисов, синхронизация с компьютером и ТВ, обновления, очистка. */
const UPD_REPO = 'dmitrykirsh/luma-mobile';
const UPD = { state: 'idle', cur: '', version: '', notes: '', url: '', pct: 0, err: '', at: 0 };
const semParts = (v) => String(v || '').replace(/^v/i, '').split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
const semNewer = (a, b) => { const x = semParts(a), y = semParts(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const lastSyncText = () => (S.synced ? new Date(S.synced).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не было');

/* ---------- нижняя шторка ---------- */
let sheetEl = null;
function openSheet(html) {
  closeSheet();
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet';
  sheetEl.innerHTML = `<div class="sh-back"></div><div class="sh-box">${html}</div>`;
  document.body.appendChild(sheetEl);
  $('.sh-back', sheetEl).onclick = closeSheet;
  return sheetEl;
}
function closeSheet() { if (!sheetEl) return false; const s = sheetEl; sheetEl = null; s.classList.add('out'); setTimeout(() => s.remove(), 220); return true; }
window.sheetBack = () => closeSheet();

/* ---------- ключи сервисов ---------- */
function keyDlg(name) {
  const K = KEYS[name];
  const s = openSheet(`<h3>Ключ ${esc(K.name)}</h3><p class="sub">${esc(K.use)}</p><div class="help">${K.help}</div>
    <input id="kin" type="text" placeholder="Вставьте или введите ключ" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc((S.secrets && S.secrets[name]) || '')}"><div class="derr" id="kerr"></div>
    <div class="dbtns"><button class="btn primary" id="kok">Проверить и сохранить</button>${(S.secrets && S.secrets[name]) ? '<button class="btn" id="kdel">Удалить</button>' : ''}</div>`);
  $('#kok', s).onclick = async () => {
    const key = $('#kin', s).value.trim(), err = $('#kerr', s);
    if (!K.re.test(key)) { err.textContent = 'Это не похоже на ключ ' + K.name + '. Проверьте длину и символы.'; return; }
    const b = $('#kok', s); b.disabled = true; b.style.opacity = .6; err.textContent = '';
    let bad = null; try { bad = await K.check(key); } catch { bad = 'NET'; }
    b.disabled = false; b.style.opacity = 1;
    if (bad && bad !== 'LIMIT') { err.textContent = KEY_ERR[bad] || 'Не получилось проверить ключ.'; return; }
    S.secrets = S.secrets || {}; S.secrets[name] = key; save();
    tmFindCache.clear(); tmRows = {}; try { localStorage.removeItem('luma.m.rows'); } catch {}
    toast('Ключ ' + K.name + ' сохранён'); closeSheet(); renderTab();
  };
  $('#kdel', s)?.addEventListener('click', () => { delete S.secrets[name]; save(); tmFindCache.clear(); tmRows = {}; toast('Ключ удалён'); closeSheet(); renderTab(); });
  setTimeout(() => $('#kin', s).focus(), 300);
}

/* ---------- обновления ---------- */
async function updCheck(silent) {
  if (['checking', 'downloading', 'installing'].includes(UPD.state)) return;
  UPD.cur = NATIVE ? NATIVE.version() : 'dev'; UPD.state = 'checking'; updPaint();
  try {
    const r = await fetch(tvPx(`https://api.github.com/repos/${UPD_REPO}/releases/latest`, 'Luma-Mobile', '', true, { Accept: 'application/vnd.github+json' }));
    if (r.status === 404) { UPD.state = 'none'; UPD.at = Date.now(); updPaint(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
    UPD.at = Date.now();
    if (apk && semNewer(j.tag_name, UPD.cur)) {
      UPD.state = 'available'; UPD.version = String(j.tag_name).replace(/^v/i, ''); UPD.notes = String(j.body || '').replace(/[#*`>]/g, '').trim().slice(0, 500); UPD.url = apk.browser_download_url;
      if (silent) toast('Доступно обновление Luma ' + UPD.version + ': Моё → Настройки');
    } else UPD.state = 'none';
  } catch { UPD.state = silent ? 'idle' : 'error'; UPD.err = 'Не получилось проверить обновления. Проверьте интернет.'; }
  updPaint();
}
function updInstall() {
  if (UPD.state !== 'available' && UPD.state !== 'needperm' && UPD.state !== 'error') return;
  if (!NATIVE || !NATIVE.installUpdate) { toast('Установка недоступна в этой сборке'); return; }
  UPD.state = 'downloading'; UPD.pct = 0; updPaint(); NATIVE.installUpdate(UPD.url);
}
window.lumaUpdateState = (s) => {
  UPD.state = s.state; if (s.pct != null) UPD.pct = s.pct; if (s.msg) UPD.err = 'Не получилось скачать обновление: ' + s.msg;
  if (s.state === 'needperm') toast('Разрешите установку из этого приложения и нажмите «Обновить» ещё раз');
  updPaint();
};
function updText() {
  const s = UPD.state, cur = UPD.cur || (NATIVE ? NATIVE.version() : 'dev');
  if (s === 'checking') return ['Проверяем обновления…', ''];
  if (s === 'available') return [`Доступна версия ${UPD.version}`, UPD.notes || 'Нажмите, чтобы скачать и установить'];
  if (s === 'downloading') return [`Скачиваем версию ${UPD.version}… ${UPD.pct}%`, 'После скачивания откроется установщик Android'];
  if (s === 'needperm') return ['Нужно разрешение на установку', 'Включите установку из этого приложения и нажмите ещё раз'];
  if (s === 'installing') return ['Открываем установщик…', 'Подтвердите установку на экране'];
  if (s === 'error') return ['Не получилось', UPD.err || 'Попробуйте ещё раз'];
  if (s === 'none') return ['У вас последняя версия', `Luma ${cur} · проверено в ${new Date(UPD.at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`];
  return ['Обновления', `Luma ${cur} · нажмите, чтобы проверить`];
}
function updPaint() { const el = $('#updRow'); if (!el) return; const [h, sub] = updText(); $('div', el).innerHTML = `${esc(h)}<small>${esc(sub)}</small>`; el.dataset.act = UPD.state === 'available' || UPD.state === 'needperm' || (UPD.state === 'error' && UPD.url) ? 'updinstall' : 'updcheck'; }

/* ---------- синхронизация с компьютером и ТВ ---------- */
const SY = { code: '', found: [], scanning: false, busy: '' };
function exportJson() {
  const x = tvX();
  return JSON.stringify({ app: 'Luma', format: 1, exportedAt: new Date().toISOString(), version: NATIVE ? NATIVE.version() : '',
    data: { favs: S.favs, history: S.history, seen: S.seen, progress: S.progress, lists: x.lists || [], tvFav: x.tvFav || [], tvStats: x.tvStats || {}, tvCustom: (x.tvCustom || []).filter((e) => e.url), tvLast: x.tvLast || '' }, secrets: S.secrets || {} });
}
function openSync() {
  const pg = pushPage();
  SY.code = String(1000 + Math.floor(Math.random() * 9000)); SY.found = []; SY.scanning = false; SY.busy = '';
  let info = {}; try { info = JSON.parse(NATIVE.syncStart(SY.code, exportJson())); } catch {}
  const ok = !info.error;
  pg._onClose = () => { try { NATIVE.syncStop(); } catch {} };
  pg.innerHTML = `${backBtn()}<div class="top" style="padding-top:calc(var(--sat) + 62px)"><h1>Синхронизация</h1></div>
    <div class="sy"><small>Код сопряжения</small><b>${SY.code.split('').join(' ')}</b><p>Введите этот код на компьютере: Luma → Настройки → Телевизор. Данные обменяются в обе стороны и объединятся.</p>
      <div class="sy-st" id="syStatus">${ok ? 'Телефон виден компьютерам в сети' : 'Не удалось запустить приём. Проверьте подключение к Wi-Fi.'}</div></div>
    <div class="list" style="margin-top:6px"><button class="li" id="syScan">${ico('refresh')}<div>Найти компьютер<small>Если Luma запущена на ПК в этой же сети</small></div></button></div><div id="syList" class="list" style="margin-top:10px"></div>
    <p class="about">Последняя синхронизация: ${esc(lastSyncText())}</p>`;
  $('#syScan', pg).onclick = () => { if (SY.scanning) return; SY.scanning = true; $('#syList', pg).innerHTML = '<div class="spin"></div>'; NATIVE.syncScan(); };
}
const syStatus = (txt, cls) => { const e = $('#syStatus'); if (e) { e.textContent = txt; e.className = 'sy-st ' + (cls || ''); } };
window.lumaSyncFound = (json) => {
  SY.scanning = false; let list = []; try { list = JSON.parse(json); } catch {}
  SY.found = list; const box = $('#syList'); if (!box) return;
  box.innerHTML = list.length ? list.map((p, i) => `<button class="li" data-sypc="${i}">${ico('tv')}<div>${esc(p.name || 'Компьютер')}<small>${esc(p.ip)}</small></div></button>`).join('')
    : '<div class="empty"><h3>Компьютеры не нашлись</h3><p>Запустите Luma на ПК (он должен быть в той же сети) или откройте на ПК Настройки → Телевизор и найдите этот телефон.</p></div>';
  $$('[data-sypc]', box).forEach((b) => (b.onclick = () => sendTo(+b.dataset.sypc)));
};
function sendTo(i) {
  const p = SY.found[i]; if (!p || SY.busy) return;
  SY.busy = p.ip; syStatus(`Ждём подтверждения на компьютере «${p.name}»: введите там код ${SY.code}`, 'wait');
  NATIVE.syncSend(p.ip, p.port, SY.code, exportJson());
}
window.lumaSyncDone = (json) => {
  SY.busy = ''; let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.ok) applyIncoming(r.data, r.name);
  else syStatus({ BAD_CODE: 'Код не подошёл. Введите на компьютере код с экрана телефона.', TIMEOUT: 'Компьютер не ответил вовремя.', NETWORK: 'Не получилось связаться с компьютером.' }[r.error] || 'Не получилось синхронизироваться.', 'bad');
};
window.lumaSyncIn = (plain) => { try { applyIncoming(plain, 'компьютера'); } catch {} };
function applyIncoming(plain, from) {
  let obj; try { obj = JSON.parse(plain); } catch { syStatus('Получены повреждённые данные', 'bad'); return; }
  const r = mergeBackup(obj); S.synced = Date.now(); save();
  syStatus(`Готово: данные получены от ${from || 'компьютера'}. Избранное ${S.favs.length}, история ${S.history.length}${r.keys.length ? ', ключей ' + r.keys.length : ''}.`, 'ok');
  toast('Синхронизация завершена');
  try { NATIVE.syncUpdate(exportJson()); } catch {}
  tmFindCache.clear();
}

/* ---------- экран настроек ---------- */
function settingsHtml() {
  const sec = S.secrets || {};
  const keyRow = (k) => `<button class="li" data-key="${k}">${ico('key')}<div>${esc(KEYS[k].name)}<small>${sec[k] ? 'Ключ задан' : k === 'tmdb' ? 'Общий ключ Luma (можно ввести свой)' : 'Не задан'} · ${esc(KEYS[k].use)}</small></div></button>`;
  const [uh, us] = updText();
  return `<h3 class="ph3" style="padding-left:0">Сервисы</h3><div class="list" style="padding:0">${['tmdb', 'omdb', 'mdblist', 'trakt'].map(keyRow).join('')}</div>
    <h3 class="ph3" style="padding-left:0;margin-top:14px">Данные</h3><div class="list" style="padding:0">
      <button class="li" id="syncRow">${ico('sync')}<div>Синхронизация<small>С компьютером и ТВ · последняя: ${esc(lastSyncText())}</small></div></button>
      <button class="li" id="clr">${ico('trash')}<div>Очистить историю<small>Список «Продолжить просмотр» и отметки серий</small></div></button></div>
    <h3 class="ph3" style="padding-left:0;margin-top:14px">Приложение</h3><div class="list" style="padding:0">
      <button class="li" id="updRow" data-act="updcheck">${ico('info')}<div>${esc(uh)}<small>${esc(us)}</small></div></button></div>
    <p class="about" style="padding-left:0">Luma для телефона ${esc(NATIVE ? NATIVE.version() : '')} · github.com/dmitrykirsh/luma-mobile</p>`;
}
function bindSettings(root) {
  $$('[data-key]', root).forEach((b) => (b.onclick = () => keyDlg(b.dataset.key)));
  $('#syncRow', root).onclick = openSync;
  $('#clr', root).onclick = () => { S.history = []; S.progress = {}; S.seen = {}; S.done = {}; save(); toast('История очищена'); };
  $('#updRow', root).onclick = (e) => { const a = e.currentTarget.dataset.act; if (a === 'updinstall') updInstall(); else updCheck(false); };
}
setTimeout(() => { updCheck(true); setInterval(() => updCheck(true), 6 * 3600e3); }, 15000);
