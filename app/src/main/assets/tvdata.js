/* Каналы: плейлисты IPTV, каталог мира (iptv-org), телепрограмма. Копия данных из Luma TV (tv.js); позже уйдёт в общий модуль. */
'use strict';
// Источники встроенных плейлистов: сначала своё зеркало (снимок с ПК, gist dmitrykirsh),
// затем оригинал (вдруг вернётся) и зеркала-форки; пробуем по очереди
const TV_RAWS = [
  'https://gist.githubusercontent.com/dmitrykirsh/997edd2c85ffed1bf9d12ba7e24f4fca/raw/',
  'https://raw.githubusercontent.com/smolnp/IPTVru/gh-pages/',
  'https://raw.githubusercontent.com/AlbertAnimates/IPTVru/gh-pages/',
  'https://raw.githubusercontent.com/timinside/IPTVru/gh-pages/',
];
const TV_LISTS = [['main', 'IPTVru.m3u'], ['stable', 'IPTVstable.m3u8']];
const TV_EPG_URL = 'https://iptvx.one/epg/epg_lite.xml.gz';
const TV_ADULT = /(xxx|эротик|для взрослых|взрослые|adult|18\+)/i;
const TV_TTL = 6 * 3600e3;

const tvNrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
const tvSlug = (x) => tvNrm(x) || String(x).length + ':' + String(x).slice(0, 12);

const TVD = { channels: [], list: [], cat: 'Все', cur: null, srcIdx: 0, hls: null, epg: { programmes: {}, alias: {}, at: 0 }, epgBusy: false, shown: 0, osdT: 0, stuckT: 0, timers: {}, loading: null };
const tvX = () => (S.extra = S.extra || {});
const tvFavs = () => (tvX().tvFav = tvX().tvFav || []);
const tvIsFav = (id) => tvFavs().includes(id);
function tvToggleFav(id) { const f = tvFavs(), i = f.indexOf(id), meta = (tvX().tvFavMeta ||= Object.create(null)), old = meta[id]; if (i >= 0) f.splice(i, 1); else f.unshift(id); meta[id] = {on:i < 0, ts:Math.max(Date.now(), Number(old?.ts || 0) + 1)}; save(); return i < 0; }
const tvStats = () => (tvX().tvStats = tvX().tvStats || {});

/* ---------- плейлисты ---------- */
function tvParseM3u(text, dropAdult) {
  const out = []; let meta = null, opts = {}, grp = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const m = line.match(/^#EXTINF:\s*-?[\d.]+\s*((?:[\w.-]+="[^"]*"\s*)*)(?:[\w.-]+=\S+\s*)*,(.*)$/);
      const attrs = {};
      if (m) for (const a of m[1].matchAll(/([\w.-]+)="([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
      meta = { attrs, name: ((m && m[2]) || line.split(',').pop() || '').trim() }; opts = {};
    } else if (/^#EXTVLCOPT:/i.test(line)) {
      const m = line.match(/^#EXTVLCOPT:http-(user-agent|referrer|referer|origin)\s*=\s*"?(.*?)"?$/i);
      if (m) opts[/user-agent/i.test(m[1]) ? 'ua' : /origin/i.test(m[1]) ? 'origin' : 'ref'] = m[2];
    } else if (/^#EXTGRP:/i.test(line)) grp = line.slice(8).trim();
    else if (line.startsWith('#')) continue;
    else if (meta && /^https?:\/\//i.test(line)) {
      let url = line, ua = opts.ua, ref = opts.ref;
      const bar = url.indexOf('|');
      if (bar > 0) { for (const kv of url.slice(bar + 1).split('&')) { const [k, ...v] = kv.split('='); const val = decodeURIComponent(v.join('=')); if (/^user-agent$/i.test(k)) ua = val; else if (/^referr?er$/i.test(k)) ref = val; } url = url.slice(0, bar); }
      const group = meta.attrs['group-title'] || grp || 'Без категории';
      if (!(dropAdult && (TV_ADULT.test(group) || TV_ADULT.test(meta.name)))) out.push({ name: meta.name || 'Без названия', group, logo: meta.attrs['tvg-logo'] || '', tvg: (meta.attrs['tvg-id'] || '').toLowerCase(), url, ua, ref });
      meta = null;
    }
  }
  return out;
}
function tvToChannels(items, prefix) {
  const by = new Map();
  for (const c of items) {
    const id = prefix + (c.tvg || tvSlug(c.name));
    let ch = by.get(id);
    if (!ch) { ch = { id, name: c.name, group: c.group, logo: c.logo, tvg: c.tvg, sources: [] }; by.set(id, ch); }
    if (!ch.logo && c.logo) ch.logo = c.logo;
    if (!ch.sources.some((s) => s.url === c.url)) ch.sources.push({ url: c.url, ua: c.ua || '', ref: c.ref || '' });
  }
  return [...by.values()];
}
async function tvFetchList(url, builtin) {
  // встроенные списки — имя файла, пробуем все источники; свои списки — полный URL, один запрос
  const tries = /^https?:\/\//i.test(url) ? [url] : TV_RAWS.map((b) => b + url);
  let lastErr = null;
  for (const u of tries) {
    try {
      const r = await fetch(tvPx(u, '', '', true), { signal: AbortSignal.timeout(12000) });   // плейлист каналов отдаём как есть, без переписывания адресов
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const channels = tvToChannels(tvParseM3u(await r.text(), builtin), '');
      if (!channels.length) throw new Error('NO_CHANNELS');
      return channels;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('NO_CHANNELS');
}
async function tvLoad(force) {
  if (TVD.loading) return TVD.loading;
  if (TVD.channels.length && !force) return;
  TVD.loading = (async () => {
    // быстрый старт: каналы из прошлого запуска
    if (!force) { try { const c = JSON.parse(localStorage.getItem('luma.m.ch2') || 'null'); if (c && Date.now() - c.at < TV_TTL && c.list.length) { TVD.channels = c.list; tvAfterLoad(); return; } } catch {} }
    const res = await Promise.allSettled(TV_LISTS.map(([, u]) => tvFetchList(u, true)));
    const [main, stable] = res.map((x) => (x.status === 'fulfilled' ? x.value : []));
    const stableById = new Map(stable.map((c) => [c.id, c]));
    let list = main.map((c) => { const s = stableById.get(c.id); return s ? { ...c, stable: true, sources: [...s.sources, ...c.sources.filter((x) => !s.sources.some((y) => y.url === x.url))] } : c; });
    for (const s of stable) if (!list.some((c) => c.id === s.id)) list.push({ ...s, stable: true });
    for (const e of (tvX().tvCustom || []).filter((x) => x && (x.url || x.file) && x.enabled !== false)) {
      try {
        const chs = await tvFetchList(e.url, false);
        list.push(...chs.map((c) => ({ ...c, id: 'c' + e.id + ':' + c.id, list: e.name })));
      } catch {}
    }
    if (!list.length) throw new Error('NO_CHANNELS');
    TVD.channels = list;
    try { localStorage.setItem('luma.m.ch2', JSON.stringify({ at: Date.now(), list })); } catch {}
    tvAfterLoad();
  })();
  try { await TVD.loading; } finally { TVD.loading = null; }
}
function tvAfterLoad() { try { const c = JSON.parse(localStorage.getItem('luma.m.epg') || 'null'); if (c) TVD.epg = c; } catch {} if (Date.now() - (TVD.epg.at || 0) > TV_TTL) tvEpgRefresh(); }

/* ---------- телепрограмма (читается в фоне, в памяти остаются только нужные каналы) ---------- */
function tvEpgWorker() {
  self.onmessage = async (e) => {
    const { url, ids, names } = e.data;
    const nrm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(hd|fhd|uhd|4k|sd|orig)\b/g, ' ').replace(/[^a-zа-я0-9]+/g, '');
    const dec = (x) => String(x || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
    const ptime = (x) => {
      const m = String(x).match(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/); if (!m) return 0;
      const off = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000;
    };
    const wantedIds = new Set(ids), wantedNames = new Map(names), nameToEpg = new Map();
    const now = Date.now(), from = now - 4 * 3600e3, to = now + 48 * 3600e3;
    const programmes = {}; let total = 0;
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const rd = r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
      let buf = '', phaseProg = false;
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += value; let pos = 0;
        for (;;) {
          const c = phaseProg ? -1 : buf.indexOf('<channel ', pos), p = buf.indexOf('<programme ', pos);
          let i, kind;
          if (c >= 0 && (p < 0 || c < p)) { i = c; kind = 'c'; } else if (p >= 0) { i = p; kind = 'p'; phaseProg = true; } else { pos = Math.max(pos, buf.length - 12); break; }
          const end = buf.indexOf(kind === 'c' ? '</channel>' : '</programme>', i);
          if (end < 0) { pos = i; break; }
          const block = buf.substring(i, end);
          if (kind === 'c') {
            const id = (block.match(/^<channel\s+id="([^"]*)"/) || [])[1];
            if (id) for (const n of block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)) { const k = nrm(dec(n[1])); if (k && wantedNames.has(k) && !nameToEpg.has(k)) { nameToEpg.set(k, id); wantedIds.add(id); } }
            pos = end + 10;
          } else {
            const m = block.match(/^<programme\s+([^>]*)>/);
            if (m) {
              const a = m[1], ch = (a.match(/channel="([^"]*)"/) || [])[1];
              if (ch && wantedIds.has(ch)) {
                const s = ptime((a.match(/start="([^"]*)"/) || [])[1]), e2 = ptime((a.match(/stop="([^"]*)"/) || [])[1]);
                if (s && e2 && e2 >= from && s <= to) { const title = dec((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]); if (title) { (programmes[ch] = programmes[ch] || []).push([s, e2, title]); total++; } }
              }
            }
            pos = end + 12;
          }
        }
        buf = buf.slice(pos);
      }
      for (const id of Object.keys(programmes)) programmes[id].sort((x, y) => x[0] - y[0]);
      const alias = {};
      for (const [k, cids] of wantedNames) { const e3 = nameToEpg.get(k); if (e3 && programmes[e3]) for (const id of cids) alias[id] = e3; }
      postMessage({ ok: true, programmes, alias, total });
    } catch (err) { postMessage({ error: String(err && err.message || err) }); }
  };
}
function tvEpgRefresh() {
  if (TVD.epgBusy || !TVD.channels.length || typeof Worker === 'undefined') return;
  TVD.epgBusy = true;
  const ids = [], by = new Map();
  for (const c of TVD.channels) { if (c.tvg) ids.push(c.tvg); else { const k = tvNrm(c.name); if (k) { if (!by.has(k)) by.set(k, []); by.get(k).push(c.id); } } }
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob(['(' + tvEpgWorker.toString() + ')()'], { type: 'text/javascript' }))); } catch { TVD.epgBusy = false; return; }
  const done = () => { TVD.epgBusy = false; try { w.terminate(); } catch {} };
  w.onmessage = (e) => {
    done();
    if (!e.data.ok) return;
    TVD.epg = { programmes: e.data.programmes, alias: e.data.alias, at: Date.now() };
    try { localStorage.setItem('luma.m.epg', JSON.stringify(TVD.epg)); } catch {}
    if (typeof tvPaintNow === 'function') tvPaintNow();
  };
  w.onerror = done;
  w.postMessage({ url: tvPx(TV_EPG_URL, '', '', true), ids: [...new Set(ids)], names: [...by] });
}
function tvSchedule(ch){
  if(!ch)return [];const link=S.extra?.syncForeign?.tvEpgLinks?.[ch.id];
  if(link?.id){const linked=(link.tvg&&TVD.epg.programmes[link.tvg])||TVD.epg.programmes[TVD.epg.alias[link.id]]||TVW.epg[link.id]||[];if(linked.length)return linked;}
  const id=(ch.tvg&&TVD.epg.programmes[ch.tvg])?ch.tvg:TVD.epg.alias[ch.id],primary=(id&&TVD.epg.programmes[id])||[],world=TVW.epg[ch.id]||[],now=Date.now();
  return primary.some(p=>p[0]<=now&&p[1]>now)?primary:world.some(p=>p[0]<=now&&p[1]>now)?world:primary.some(p=>p[1]>now)?primary:world.length?world:primary;
}
function tvNowNext(ch) {const list=tvSchedule(ch),now=Date.now();for(let i=0;i<list.length;i++)if(list[i][0]<=now&&now<list[i][1])return {now:list[i][2],next:list[i+1]?.[2],pct:Math.round(100*(now-list[i][0])/(list[i][1]-list[i][0])),end:list[i][1]};return {};}

const TVW = { all: null, at: 0, loading: null, byId: new Map(), cc: '', q: '', epg:{}, epgAt:{}, epgPending:{}, epgQueue:null };
const TVW_URL = 'https://iptv-org.github.io/iptv/index.m3u';
const TVW_GROUPS = { General: 'Общие', Movies: 'Фильмы', Series: 'Сериалы', Entertainment: 'Развлекательные', Music: 'Музыка', Sports: 'Спорт', News: 'Новости', Kids: 'Детские', Documentary: 'Документальные', Religious: 'Религия', Culture: 'Культура', Outdoor: 'Природа и путешествия', Lifestyle: 'Стиль жизни', Undefined: 'Без категории', Education: 'Образование', Animation: 'Мультфильмы', Business: 'Бизнес', Comedy: 'Комедии', Cooking: 'Кулинария', Family: 'Семейные', Legislative: 'Парламент', Public: 'Общественные', Relax: 'Релакс', Science: 'Наука', Shop: 'Магазины', Travel: 'Путешествия', Weather: 'Погода', Auto: 'Авто', Classic: 'Классика', Interactive: 'Интерактивные', Local: 'Местные' };
async function tvWideLoad() {
  if (TVW.all && Date.now() - TVW.at < TV_TTL) return TVW.all;
  if (TVW.loading) return TVW.loading;
  TVW.loading = (async () => {
    const r = await fetch(tvPx(TVW_URL, '', '', true), { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const items = tvParseM3u(await r.text(), true)
      .filter((c) => !/\[(?:Not 24\/7|Geo-blocked)\]/i.test(c.name))   // каналы «не круглосуточно» и «только из своей страны» не показываем
      .map((c) => ({ ...c, name: c.name.replace(/\s*\(\d{3,4}p\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').trim(), group: String(c.group || '').split(';').map((g) => TVW_GROUPS[g.trim()] || g.trim()).filter(Boolean)[0] || 'Без категории' }));
    const list = tvToChannels(items, 'x:').map((c) => ({ ...c, cc: ((c.tvg || '').match(/\.([a-z]{2,3})(?:@|$)/) || [])[1] || 'int' }));
    if (!list.length) throw new Error('NO_CHANNELS');
    TVW.all = list; TVW.at = Date.now(); TVW.byId = new Map(list.map((c) => [c.id, c]));
    return list;
  })();
  try { return await TVW.loading; } finally { TVW.loading = null; }
}
function tvWideEpgWorker(){self.onmessage=async e=>{const {url,names}=e.data,wanted=new Map(names),candidates=new Map(),need=new Set(),map=new Map(),programme={};const norm=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е').replace(/\b(?:hd|fhd|uhd|4k|sd)\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,'');const dec=x=>String(x||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();const tm=x=>{const m=String(x||'').match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)\s*([+-])?(\d\d)?(\d\d)?/);if(!m)return 0;const off=m[7]?(m[7]==='-'?-1:1)*(+(m[8]||0)*60+ +(m[9]||0)):0;return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])-off*60000;};try{const r=await fetch(url);if(!r.ok)throw Error('HTTP');const rd=r.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();let buf='',phase=false;for(;;){const {value,done}=await rd.read();if(done)break;buf+=value;let pos=0;for(;;){const c=phase?-1:buf.indexOf('<channel ',pos),p=buf.indexOf('<programme ',pos);let i,k;if(c>=0&&(p<0||c<p)){i=c;k='c';}else if(p>=0){i=p;k='p';if(!phase){phase=true;const choices=new Map();for(const [n,ids] of candidates)for(const cid of wanted.get(n)||[]){if(!choices.has(cid))choices.set(cid,{i:new Set(),n:new Set()});for(const id of ids)choices.get(cid)[n[0]].add(id);}for(const [cid,choice] of choices){const ids=choice.i.size?choice.i:choice.n;if(ids.size===1){const id=[...ids][0];need.add(id);map.set(cid,{id});}}}}else{pos=Math.max(pos,buf.length-16);break;}const end=buf.indexOf(k==='c'?'</channel>':'</programme>',i);if(end<0){pos=i;break;}const block=buf.slice(i,end);pos=end+(k==='c'?10:12);if(k==='c'){const id=block.match(/^<channel\s+id="([^"]+)"/)?.[1];if(!id)continue;const identity='i:'+norm(id);if(wanted.has(identity)){if(!candidates.has(identity))candidates.set(identity,new Set());candidates.get(identity).add(id);}for(const m of block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)){const key='n:'+norm(dec(m[1]));if(wanted.has(key)){if(!candidates.has(key))candidates.set(key,new Set());candidates.get(key).add(id);}}}else{const a=block.match(/^<programme\s+([^>]*)>/)?.[1]||'',id=a.match(/channel="([^"]+)"/)?.[1];if(!need.has(id))continue;const start=tm(a.match(/start="([^"]+)"/)?.[1]),stop=tm(a.match(/stop="([^"]+)"/)?.[1]),now=Date.now();if(!start||!stop||stop<now-4*3600000||start>now+48*3600000)continue;const title=dec(block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]);if(title)(programme[id]||=[]).push([start,stop,title]);}}buf=buf.slice(pos);if(buf.length>2000000)throw Error('BAD_XML');}const out={};for(const [cid,match] of map){const rows=programme[match.id];if(rows?.length)out[cid]=rows.slice().sort((a,b)=>a[0]-b[0]);}postMessage({ok:true,programmes:out});}catch{postMessage({error:true});}};}
const tvWideEpgKey=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е').replace(/\b(?:hd|fhd|uhd|4k|sd)\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,'');
async function tvWideEpgLoad(country){let cc=String(country||'').toLowerCase();if(cc==='uk')cc='gb';const files={us:'US2',gb:'UK1',ca:'CA2',au:'AU1',br:'BR1',de:'DE1',es:'ES1',fr:'FR1',it:'IT1',nl:'NL1',pl:'PL1',pt:'PT1',rs:'RS1',tr:'TR1',ua:'UA1'};if(!files[cc])return;if(TVW.epgAt[cc]&&Date.now()-TVW.epgAt[cc]<6*3600000)return;if(TVW.epgPending[cc])return TVW.epgPending[cc];const run=(TVW.epgQueue||Promise.resolve()).catch(()=>{}).then(async()=>{const channels=await tvWideLoad(),names=new Map();for(const c of channels){const code=String(c.cc||'').toLowerCase();if(code!==cc&&!(cc==='gb'&&code==='uk'))continue;if(String(c.tvg||'').includes('@')&&!/@(?:sd|hd|fhd|uhd|4k)$/i.test(c.tvg))continue;for(const [kind,value] of [['n',c.name],['i',String(c.tvg||'').replace(/@(?:sd|hd|fhd|uhd|4k)$/i,'')]]){const k=tvWideEpgKey(value);if(k){const key=kind+':'+k;if(!names.has(key))names.set(key,[]);names.get(key).push(c.id);}}}return new Promise(resolve=>{const blob=URL.createObjectURL(new Blob(['('+tvWideEpgWorker.toString()+')()'],{type:'text/javascript'})),w=new Worker(blob),timeout=setTimeout(()=>done(),90000);function done(){clearTimeout(timeout);w.terminate();URL.revokeObjectURL(blob);resolve();}w.onmessage=e=>{if(e.data?.ok){Object.assign(TVW.epg,e.data.programmes);TVW.epgAt[cc]=Date.now();if(typeof tvPaintNow==='function')tvPaintNow();if(typeof tvWorldPaintNow==='function')tvWorldPaintNow();if(typeof tvPaintHead==='function')tvPaintHead();if(typeof NP!=='undefined'&&NP.on&&NP.live&&NP.menu==='prog'&&typeof renderMenu==='function')renderMenu();}done();};w.onerror=done;w.postMessage({url:tvPx('https://epgshare01.online/epgshare01/epg_ripper_'+files[cc]+'.xml.gz','','',true),names:[...names]});});});TVW.epgQueue=run.catch(()=>{});TVW.epgPending[cc]=run;try{await run}finally{delete TVW.epgPending[cc]}}

const tvRegion = (() => { let dn = null; try { dn = new Intl.DisplayNames(['ru'], { type: 'region' }); } catch {} return (cc) => { const u = String(cc || '').toUpperCase(); if (!u || u === 'INT') return 'Международные'; try { return (dn && dn.of(u === 'UK' ? 'GB' : u)) || u; } catch { return u; } }; })();
const tvChan = (id) => TVD.channels.find((c) => c.id === id) || TVW.byId.get(id);
