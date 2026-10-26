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

/* ---------- синхронизация между устройствами ----------
   Первый раз устройства подключаются друг к другу по коду (и заодно получают общий ключ группы). Дальше все устройства группы
   сами находят друг друга в сети и обмениваются данными без кодов: при запуске, при возвращении в приложение, после просмотра,
   каждые несколько минут, по кнопке и (на телефоне) в фоне раз в 15 минут. */
const SY = { code: '', found: [], scanning: false, busy: '', auto: false, again: false, last: 0, peers: [], status: '' };
const rnd = (n, abc) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');
const HEX = '0123456789abcdef', B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
if (!S.did) { S.did = rnd(12, HEX); save(); }
function ensureGroup() { if (!S.group) { S.group = { id: rnd(8, HEX), key: rnd(28, B62) }; save(); } return S.group; }
function exportJson() {
  const x = tvX();
  return JSON.stringify({ app: 'Luma', format: 1, exportedAt: new Date().toISOString(), version: NATIVE ? NATIVE.version() : '',
    data: { favs: S.favs, history: S.history, seen: S.seen, done: S.done, gone: S.gone || {}, progress: S.progress, lists: x.lists || [], tvFav: x.tvFav || [], tvStats: x.tvStats || {}, tvCustom: (x.tvCustom || []).filter((e) => e.url), tvLast: x.tvLast || '' },
    secrets: syncSecrets(), sync: S.group ? { gid: S.group.id, gkey: S.group.key } : undefined });
}
/** Ключи сервисов + вход Google (вход едет только между устройствами по сети, в файл на Диске он не попадает). */
function syncSecrets(withGoogle = true) {
  const sec = { ...(S.secrets || {}) }; delete sec.google;
  if (withGoogle) { try { const g = NATIVE.driveSecret(); if (g) sec.google = g; } catch {} }
  return sec;
}
/** Вход Google пришёл от другого устройства: принимаем, если сами ещё не вошли. */
function adoptGoogle(obj) {
  const g = obj && obj.secrets && obj.secrets.google;
  if (obj && obj.secrets) delete obj.secrets.google;
  if (!g) return;
  try { if (NATIVE.driveAdopt(g)) { renderDriveBox(); setTimeout(() => driveSyncNow(), 1500); } } catch {}
}
const syState = () => JSON.stringify([S.history.length, S.favs.length, Object.keys(S.progress).length, Object.values(S.done || {}).reduce((n, a) => n + a.length, 0), Math.max(0, ...S.history.map((h) => h.ts || 0)), Math.max(0, ...Object.values(S.progress).map((p) => p.ts || 0))]);
/** Приём данных в нашем сервере и сеть: сервер всегда включён, чтобы другие устройства могли нас найти. */
function syServe() {
  if (!NATIVE || !NATIVE.syncServe) return;
  try { NATIVE.syncServe(S.group ? S.group.id : '', S.group ? S.group.key : '', S.did, exportJson()); } catch {}
}
function adoptGroup(sy) {
  if (!sy || !sy.gid || !sy.gkey) return;
  if (!S.group || sy.gid < S.group.id) { S.group = { id: sy.gid, key: sy.gkey }; save(); syServe(); }
}
function applyIncoming(plain, from, quiet) {
  let obj; try { obj = JSON.parse(plain); } catch { syStatus('Получены повреждённые данные', 'bad'); return false; }
  const before = syState();
  adoptGroup(obj.sync); adoptGoogle(obj);
  const r = mergeBackup(obj); S.synced = Date.now(); save();
  mergeDone(obj);
  try { NATIVE.syncUpdate(exportJson()); } catch {}
  tmFindCache.clear();
  const changed = syState() !== before;
  if (!quiet) syStatus(`Готово: данные получены от ${from || 'устройства'}. Избранное ${S.favs.length}, история ${S.history.length}${r.keys.length ? ', ключей ' + r.keys.length : ''}.`, 'ok');
  return changed;
}
/** «Досмотрено» едет вместе с резервной копией: объединяем списки серий. */
function mergeDone(obj) {
  const d = obj.data && obj.data.done; if (!d) return;
  S.done = S.done || {};
  for (const [k, arr] of Object.entries(d)) S.done[k] = [...new Set([...(S.done[k] || []), ...arr])];
  save();
}
function syStatus(txt, cls) { SY.status = txt; const e = $('#syStatus'); if (e) { e.textContent = txt; e.className = 'sy-st ' + (cls || ''); } }

/* ---------- автоматический обмен ---------- */
function autoSync(manual) {
  if (!NATIVE || !NATIVE.syncAuto) return;
  if (!S.group) { if (manual) toast('Сначала подключите устройство: «Подключить новое устройство»'); return; }
  if (SY.auto) return;
  if (!manual && Date.now() - SY.last < 25000) return;
  SY.auto = true; SY.last = Date.now();
  if (manual) syStatus('Ищем устройства в сети…', 'wait');
  syServe();
  NATIVE.syncAuto(S.group.key, exportJson());
}
window.lumaSyncAuto = (json) => {
  SY.auto = false; let r = []; try { r = JSON.parse(json); } catch {}
  let ok = 0, changed = false; const names = [];
  for (const p of r) {
    if (p.ok) { ok++; names.push(p.name); if (applyIncoming(p.data, p.name, true)) changed = true; SY.peers = [...SY.peers.filter((x) => x.did !== p.did), { did: p.did, name: p.name, at: Date.now() }]; }
  }
  if (ok) syStatus(`Синхронизировано: ${names.join(', ')} · ${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
  else syStatus(r.length ? 'Устройства найдены, но обменяться не удалось' : 'Других устройств группы в сети нет', r.length ? 'bad' : '');
  if (changed) { refreshUi(); if (ok > 1 && !SY.again) { SY.again = true; setTimeout(() => { SY.again = false; SY.last = 0; autoSync(false); }, 600); } }
};
function refreshUi() { if (typeof NP !== 'undefined' && NP.on) return; if (typeof refreshAfterPlay === 'function') refreshAfterPlay(); }
window.lumaSyncIn = (plain) => { try { if (applyIncoming(plain, 'устройства', true)) { syStatus('Получены данные от другого устройства', 'ok'); refreshUi(); } } catch {} };
function takePending() {
  try { const l = JSON.parse(NATIVE.takeSyncIn()); let ch = false; for (const plain of l) if (applyIncoming(plain, 'устройства', true)) ch = true; if (ch) refreshUi(); } catch {}
}
setTimeout(() => { syServe(); takePending(); autoSync(false); }, 2500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { takePending(); autoSync(false); } });
setInterval(() => { if (document.visibilityState === 'visible') autoSync(false); }, 5 * 60 * 1000);
window.syncAfterPlay = () => { setTimeout(() => autoSync(false), 2500); setTimeout(() => driveAutoSync(), 3000); };

/* ---------- подключение нового устройства (по коду, один раз) ---------- */
function openSync() {
  const pg = pushPage();
  SY.code = String(1000 + Math.floor(Math.random() * 9000)); SY.found = []; SY.scanning = false; SY.busy = '';
  syServe();
  try { NATIVE.syncCode(SY.code); } catch {}
  pg._onClose = () => { try { NATIVE.syncCode(''); } catch {} };
  const hasG = !!S.group;
  pg.innerHTML = `${backBtn()}<div class="top" style="padding-top:calc(var(--sat) + 62px)"><h1>Синхронизация</h1></div>
    <h3 class="ph3">Google-аккаунт</h3><div id="syDrive">${driveBoxHtml()}</div>
    <h3 class="ph3">Или в этой Wi-Fi сети</h3>
    <div class="list" style="margin-bottom:6px"><button class="li" id="syNow">${ico('sync')}<div>Синхронизировать сейчас<small>${hasG ? 'С устройствами вашей группы в этой сети' : 'Сначала подключите хотя бы одно устройство'}</small></div></button></div>
    <div class="sy-st" id="syStatus" style="text-align:center;margin:10px 16px 14px">${esc(SY.status || (hasG ? 'Устройства группы обмениваются сами: при запуске, после просмотра и по кнопке' : ''))}</div>
    <h3 class="ph3">Подключить новое устройство</h3>
    <div class="sy"><small>Код этого устройства</small><b>${SY.code.split('').join(' ')}</b><p>Введите его на компьютере (Luma → Настройки → Телевизор) или на другом устройстве. Подключить нужно один раз: дальше они будут синхронизироваться сами.</p></div>
    <div class="list" style="margin-top:6px"><button class="li" id="syScan">${ico('refresh')}<div>Найти устройство<small>Если Luma запущена на ПК, ТВ или другом телефоне в этой сети</small></div></button></div><div id="syList" class="list" style="margin-top:10px"></div>
    <p class="about">Последняя синхронизация: ${esc(lastSyncText())}${S.group ? ' · группа ' + esc(S.group.id) : ''}</p>`;
  $('#syNow', pg).onclick = () => autoSync(true);
  $('#syScan', pg).onclick = () => { if (SY.scanning) return; SY.scanning = true; $('#syList', pg).innerHTML = '<div class="spin"></div>'; NATIVE.syncScan(); };
  wireDriveBox(pg);
}
window.lumaSyncFound = (json) => {
  SY.scanning = false; let list = []; try { list = JSON.parse(json); } catch {}
  SY.found = list; const box = $('#syList'); if (!box) return;
  box.innerHTML = list.length ? list.map((p, i) => `<button class="li" data-sypc="${i}">${ico('tv')}<div>${esc(p.name || 'Устройство')}<small>${esc(p.ip)}</small></div></button>`).join('')
    : '<div class="empty"><h3>Устройства не нашлись</h3><p>Запустите Luma на втором устройстве (оно должно быть в той же сети).</p></div>';
  $$('[data-sypc]', box).forEach((b) => (b.onclick = () => sendTo(+b.dataset.sypc)));
};
function sendTo(i) {
  const p = SY.found[i]; if (!p || SY.busy) return;
  const go = (code) => {
    ensureGroup(); syServe();
    SY.busy = p.ip;
    syStatus(p.app === 'luma-tv' ? `Подключаемся к «${p.name}»…` : `Ждём подтверждения на устройстве «${p.name}»: введите там код ${SY.code}`, 'wait');
    NATIVE.syncSend(p.ip, p.port, code, exportJson());
  };
  // компьютер сам спросит наш код; телефон или ТВ код не спрашивают, поэтому его вводим здесь (он показан на экране того устройства)
  if (p.app !== 'luma-tv') { go(SY.code); return; }
  const sh = openSheet(`<h3>Код устройства «${esc(p.name)}»</h3><p class="sub">Введите 4 цифры с экрана этого устройства (раздел «Синхронизация»).</p><input id="scode" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off"><div class="dbtns"><button class="btn primary" id="sgo">Подключить</button></div>`);
  $('#sgo', sh).onclick = () => { const c = $('#scode', sh).value.trim(); if (!/^\d{4}$/.test(c)) { $('#scode', sh).focus(); return; } closeSheet(); go(c); };
  setTimeout(() => $('#scode', sh).focus(), 300);
}
window.lumaSyncDone = (json) => {
  SY.busy = ''; let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.ok) { applyIncoming(r.data, r.name); toast('Устройство подключено'); setTimeout(() => autoSync(true), 800); }
  else syStatus({ BAD_CODE: 'Код не подошёл. Введите код с экрана этого устройства.', TIMEOUT: 'Устройство не ответило вовремя.', NETWORK: 'Не получилось связаться с устройством.' }[r.error] || 'Не получилось подключиться.', 'bad');
};

/* ---------- Google Drive: основной способ, работает из любой сети ----------
   Телефон — само устройство с браузером: обычный вход Google (выбрали аккаунт, нажали «Разрешить»), без кода.
   Вход потом сам передаётся ТВ и ПК по сети (см. syncSecrets/adoptGoogle). */
const DR = { connecting: false, busy: false, wipe: false, msg: '' };
function driveBoxHtml() {
  let st = { connected: false, last: 0 };
  try { st = JSON.parse(NATIVE.driveState()); } catch {}
  if (DR.connecting) {
    return `<div class="sy"><small>Google-аккаунт</small><p>В браузере открылась страница входа Google: выберите аккаунт и нажмите «Разрешить». Потом вернитесь в Luma.</p></div>
      <div class="list" style="margin-top:6px"><button class="li" id="drOpenAgain">${ico('globe')}<div>Открыть ещё раз<small>Начать вход заново</small></div></button><button class="li" id="drCancel">${ico('back')}<div>Отменить</div></button></div>`;
  }
  if (!st.connected) {
    return `<div class="sy"><small>Google-аккаунт · основной способ</small><p>История, избранное, прогресс серий и ключи сервисов хранятся в вашем Google Диске и синхронизируются сами — при запуске, после просмотра и по кнопке, из любой сети.</p></div>
      <div class="list" style="margin-top:6px"><button class="li" id="drConnect">${ico('sync')}<div>Войти через Google</div></button></div>`;
  }
  const when = st.last ? new Date(st.last).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'ещё не было';
  const av = `<span class="av"><i>${esc((st.name || 'G').trim().charAt(0).toUpperCase())}</i>${st.photo ? `<img src="${esc(st.photo)}" onerror="this.remove()">` : ''}</span>`;
  return `<div class="sy who">${av}<div class="wh"><b>${esc(st.name || 'Google-аккаунт')}</b><span>${esc(st.email || 'Подключено')}</span></div><p>Последняя синхронизация: ${esc(when)}. Данные хранятся в вашем Google Диске.</p><p class="sy-st" id="drStatus">${esc(DR.msg)}</p></div>
    <div class="list" style="margin-top:6px"><button class="li" id="drNow">${ico('sync')}<div>Синхронизировать сейчас</div></button><button class="li" id="drOffer">${ico('tv')}<div>Передать вход на ТВ<small>Телевизор в этой сети спросит подтверждение на экране</small></div></button><button class="li" id="drOff">${ico('back')}<div>Отключить</div></button><button class="li" id="drWipe">${ico('trash')}<div>${DR.wipe ? 'Нажмите ещё раз: удалить с Диска и отключить' : 'Удалить данные с Диска'}<small>Файл синхронизации будет удалён из вашего Google Диска</small></div></button></div>`;
}
function wireDriveBox(pg) {
  $('#drConnect', pg) && ($('#drConnect', pg).onclick = driveConnect);
  $('#drOpenAgain', pg) && ($('#drOpenAgain', pg).onclick = () => { try { NATIVE.driveConnectCancel(); NATIVE.driveConnectBrowser(); } catch {} });
  $('#drCancel', pg) && ($('#drCancel', pg).onclick = () => { try { NATIVE.driveConnectCancel(); } catch {} DR.connecting = false; renderDriveBox(); });
  $('#drNow', pg) && ($('#drNow', pg).onclick = () => driveSyncNow());
  $('#drOffer', pg) && ($('#drOffer', pg).onclick = () => driveOffer(true));
  $('#drOff', pg) && ($('#drOff', pg).onclick = () => { try { NATIVE.driveDisconnect(); } catch {} DR.msg = ''; DR.wipe = false; renderDriveBox(); });
  $('#drWipe', pg) && ($('#drWipe', pg).onclick = () => { if (!DR.wipe) { DR.wipe = true; renderDriveBox(); return; } DR.wipe = false; DR.msg = 'Удаляем файл с Диска…'; renderDriveBox(); try { NATIVE.driveDeleteRemote(); } catch {} });
}
function renderDriveBox() { const el = $('#syDrive'); if (!el) return; el.innerHTML = driveBoxHtml(); wireDriveBox(el.closest('.page') || document); }
function driveConnect() { DR.connecting = true; DR.msg = ''; renderDriveBox(); try { NATIVE.driveConnectBrowser(); } catch {} }
function driveOffer(manual) { if (manual) { DR.msg = 'Ищем ТВ в сети…'; const e = $('#drStatus'); if (e) e.textContent = DR.msg; } DR.manualOffer = !!manual; try { NATIVE.driveOffer(); } catch {} }
window.lumaDriveOffered = (json) => {
  let r = []; try { r = JSON.parse(json); } catch {}
  const ok = r.filter((x) => x.ok).map((x) => x.name);
  if (ok.length) DR.msg = 'Предложили вход: ' + ok.join(', ') + '. Подтвердите на экране ТВ.';
  else if (DR.manualOffer) DR.msg = r.length ? 'Устройства найдены, но вход принять не смогли (возможно, уже вошли).' : 'ТВ в этой сети не найден. Включите Luma на ТВ.';
  else return;
  renderDriveBox();
};
window.lumaDriveConnected = (json) => {
  DR.connecting = false; let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.error) { DR.msg = { NO_CREDS: 'Не настроены ключи Google в этой сборке.', DEVICE: 'Не получилось начать вход, попробуйте ещё раз.', NETWORK: 'Нет связи с Google.' }[r.error] || 'Вход не удался.'; renderDriveBox(); return; }
  toast('Google-аккаунт подключён'); driveSyncNow(); setTimeout(() => driveOffer(false), 2500);
};
function driveSyncNow() {
  if (DR.busy) return; DR.busy = true;
  const el = $('#drStatus'); if (el) el.textContent = 'Синхронизируем…';
  try { NATIVE.driveFetchRemote(); } catch { DR.busy = false; }
}
window.lumaDriveRemote = (json) => {
  let r = {}; try { r = JSON.parse(json); } catch {}
  if (r.error) { driveFinish(r.error); return; }
  if (r.data) { try { const obj = JSON.parse(r.data); if (obj.secrets) delete obj.secrets.google; mergeBackup(obj); mergeDone(obj); } catch {} }
  try { const o = JSON.parse(exportJson()); o.secrets = syncSecrets(false); delete o.sync; NATIVE.driveUpload(JSON.stringify(o)); } catch { driveFinish('NETWORK'); }
};
window.lumaDriveUploaded = (json) => { let r = {}; try { r = JSON.parse(json); } catch {} driveFinish(r.error); };
function driveFinish(err) {
  DR.busy = false;
  DR.msg = err ? ({ NO_AUTH: 'Сессия истекла, войдите заново.', NETWORK: 'Нет связи с Google.' }[err] || 'Не получилось синхронизировать.') : 'Готово · ' + new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  renderDriveBox();
  if (!err) { refreshUi(); toast('Синхронизация завершена'); }
}
let driveLastAuto = 0;
function driveAutoSync() {
  if (DR.connecting || DR.busy) return;
  let st = {}; try { st = JSON.parse(NATIVE.driveState()); } catch {}
  if (!st.connected) return;
  if (Date.now() - driveLastAuto < 25000) return;
  driveLastAuto = Date.now();
  driveSyncNow();
}
setTimeout(() => driveAutoSync(), 6000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') driveAutoSync(); });
setInterval(() => { if (document.visibilityState === 'visible') driveAutoSync(); }, 5 * 60 * 1000);

/* ---------- экран настроек ---------- */
function settingsHtml() {
  const sec = S.secrets || {};
  const keyRow = (k) => `<button class="li" data-key="${k}">${ico('key')}<div>${esc(KEYS[k].name)}<small>${sec[k] ? 'Ключ задан' : k === 'tmdb' ? 'Общий ключ Luma (можно ввести свой)' : 'Не задан'} · ${esc(KEYS[k].use)}</small></div></button>`;
  const [uh, us] = updText();
  return `<h3 class="ph3" style="padding-left:0">Сервисы</h3><div class="list" style="padding:0">${['tmdb', 'omdb', 'mdblist', 'trakt'].map(keyRow).join('')}</div>
    <h3 class="ph3" style="padding-left:0;margin-top:14px">Данные</h3><div class="list" style="padding:0">
      <button class="li" id="syncRow">${ico('sync')}<div>Синхронизация<small>${S.group ? 'Группа устройств подключена' : 'Не подключено'} · последняя: ${esc(lastSyncText())}</small></div></button>
      <button class="li" id="clr">${ico('trash')}<div>Очистить историю<small>Список «Продолжить просмотр» и отметки серий</small></div></button></div>
    <h3 class="ph3" style="padding-left:0;margin-top:14px">Приложение</h3><div class="list" style="padding:0">
      <button class="li" id="updRow" data-act="updcheck">${ico('info')}<div>${esc(uh)}<small>${esc(us)}</small></div></button></div>
    <p class="about" style="padding-left:0">Luma для телефона ${esc(NATIVE ? NATIVE.version() : '')} · github.com/dmitrykirsh/luma-mobile</p>`;
}
function bindSettings(root) {
  $$('[data-key]', root).forEach((b) => (b.onclick = () => keyDlg(b.dataset.key)));
  $('#syncRow', root).onclick = openSync;
  $('#clr', root).onclick = () => { S.history.forEach((h) => goneMark('h', h.id)); S.history = []; S.progress = {}; S.seen = {}; S.done = {}; save(); toast('История очищена'); };
  $('#updRow', root).onclick = (e) => { const a = e.currentTarget.dataset.act; if (a === 'updinstall') updInstall(); else updCheck(false); };
}
setTimeout(() => { updCheck(true); setInterval(() => updCheck(true), 6 * 3600e3); }, 15000);

window.lumaDriveDeleted = (json) => {
  let r = {}; try { r = JSON.parse(json); } catch {}
  DR.msg = r.error ? 'Не получилось удалить файл с Диска. Проверьте сеть.' : '';
  renderDriveBox(); if (!r.error) toast('Файл удалён с Google Диска, вход отключён');
};
