'use strict';
/* Праздничные подборки для главного баннера (Luma TV). Даты и списки общие с ПК-версией (tools/make_holidays_tv.py).
   Для проверки: localStorage['luma.holi.date'] = '2026-10-30'. */
(function () {
  const lb = (url) => ({ lb: url });
  const CROSS = 'https://letterboxd.com/crew/list/';

  // m/d: дата праздника; before/after: за сколько дней до и после показывать; rgb: цвет подсветки фона
  const HOLIDAYS = [
    { id: 'halloween', name: 'Хэллоуин', m: 10, d: 31, before: 3, after: 1, rgb: '255,122,26', tagline: 'Страшно, смешно и немного волшебно',
      lists: [lb('https://letterboxd.com/horrorville/list/55-best-halloween-movies-ever/'), lb(CROSS + 'dating-the-movies-halloween/')] },
    { id: 'newyear', name: 'Новый год', m: 12, d: 31, before: 4, after: 3, rgb: '90,200,255', tagline: 'Фильмы к новогоднему столу',
      lists: [lb(CROSS + 'dating-the-movies-new-years-eve/')],
      films: [['Ирония судьбы, или С лёгким паром!', 1975], ['Карнавальная ночь', 1956], ['Чародеи', 1982], ['Морозко', 1964], ['Джентльмены удачи', 1971],
        ['Один дома', 1990], ['Один дома 2: Потерянный в Нью-Йорке', 1992], ['Гринч — похититель Рождества', 2000], ['Эльф', 2003], ['Реальная любовь', 2003],
        ['Холодное сердце', 2013], ['Полярный экспресс', 2004], ['Ёлки', 2010], ['Ёлки 2', 2011], ['Гарри Поттер и философский камень', 2001],
        ['Двенадцать месяцев', 1972], ['Щелкунчик и четыре королевства', 2018], ['Снежная королева', 1957], ['Тот самый Мюнхгаузен', 1979],
        ['Здравствуйте, я ваша тётя!', 1975], ['Приключения Электроника', 1979], ['Каникулы в Простоквашино', 1980], ['Ночь в музее', 2006]] },
    { id: 'christmas', name: 'Рождество', m: 12, d: 25, before: 3, after: 1, rgb: '224,69,58', tagline: 'Уютные и добрые рождественские истории',
      lists: [lb('https://letterboxd.com/chriscabin/list/the-55-best-christmas-movies-of-all-time/')] },
    { id: 'christmas-orth', name: 'Рождество', m: 1, d: 7, before: 2, after: 1, rgb: '224,69,58', tagline: 'Уютные и добрые рождественские истории',
      lists: [lb('https://letterboxd.com/chriscabin/list/the-55-best-christmas-movies-of-all-time/')] },
    { id: 'valentine', name: 'День святого Валентина', m: 2, d: 14, before: 3, after: 1, rgb: '255,77,121', tagline: 'Фильмы о любви на двоих',
      lists: [lb(CROSS + 'dating-the-movies-valentines-day/'), lb('https://letterboxd.com/sundance/list/valentines-day-watchlist/')] },
    { id: 'feb23', name: 'День защитника Отечества', m: 2, d: 23, before: 3, after: 1, rgb: '110,160,110', tagline: 'Военные фильмы и крепкое мужское кино',
      films: [['Они сражались за Родину', 1975], ['Горячий снег', 1972], ['В бой идут одни «старики»', 1974], ['А зори здесь тихие', 1972], ['Офицеры', 1971],
        ['Белое солнце пустыни', 1970], ['Брат', 1997], ['Брат 2', 2000], ['Девятая рота', 2005], ['Сталинград', 2013], ['Спасти рядового Райана', 1998],
        ['Храброе сердце', 1995], ['Гладиатор', 2000], ['Крепкий орешек', 1988], ['Рэмбо: Первая кровь', 1982], ['Терминатор 2: Судный день', 1991],
        ['Т-34', 2018], ['Движение вверх', 2017], ['Начало', 2010], ['Миссия невыполнима', 1996], ['Адреналин', 2006], ['Джон Уик', 2014]] },
    { id: 'mar8', name: 'Международный женский день', m: 3, d: 8, before: 3, after: 1, rgb: '255,140,190', tagline: 'Кино о любви, дружбе и сильных героинях',
      films: [['Москва слезам не верит', 1980], ['Служебный роман', 1977], ['Красотка', 1990], ['Дьявол носит Prada', 2006], ['Реальная любовь', 2003], ['Амели', 2001],
        ['Гордость и предубеждение', 2005], ['Дневник Бриджит Джонс', 2001], ['Мамма миа!', 2008], ['Блондинка в законе', 2001], ['Маленькие женщины', 2019],
        ['Барби', 2023], ['Дневник памяти', 2004], ['Мулен Руж!', 2001], ['Любовь и голуби', 1984], ['Девчата', 1961], ['Самая обаятельная и привлекательная', 1985],
        ['Влюблён по собственному желанию', 1982], ['Шоколад', 2000], ['Чего хотят женщины', 2000]] },
    { id: 'space', name: 'День космонавтики', m: 4, d: 12, before: 3, after: 1, rgb: '120,150,255', tagline: 'Фильмы о космосе и о тех, кто к нему летал',
      films: [['Интерстеллар', 2014], ['Гравитация', 2013], ['Марсианин', 2015], ['2001 год: Космическая одиссея', 1968], ['Аполлон 13', 1995], ['Солярис', 1972],
        ['Салют-7', 2017], ['Время первых', 2017], ['Гагарин. Первый в космосе', 2013], ['Чужой', 1979], ['Прибытие', 2016], ['К звёздам', 2019], ['Человек на Луне', 2018],
        ['Скрытые фигуры', 2016], ['Луна 2112', 2009], ['Дюна', 2021], ['Кин-дза-дза!', 1986], ['Тайна третьей планеты', 1981], ['Через тернии к звёздам', 1981],
        ['Вызов', 2023], ['Притяжение', 2017], ['Звёздный путь', 2009], ['Армагеддон', 1998], ['Контакт', 1997]] },
    { id: 'starwars', name: 'День «Звёздных войн»', m: 5, d: 4, before: 2, after: 1, rgb: '255,210,60', tagline: 'May the Fourth be with you',
      films: [['Звёздные войны: Эпизод 1 — Скрытая угроза', 1999], ['Звёздные войны: Эпизод 2 — Атака клонов', 2002], ['Звёздные войны: Эпизод 3 — Месть ситхов', 2005],
        ['Звёздные войны: Эпизод 4 — Новая надежда', 1977], ['Звёздные войны: Эпизод 5 — Империя наносит ответный удар', 1980], ['Звёздные войны: Эпизод 6 — Возвращение джедая', 1983],
        ['Звёздные войны: Пробуждение силы', 2015], ['Звёздные войны: Последние джедаи', 2017], ['Звёздные войны: Скайуокер. Восход', 2019],
        ['Изгой-один. Звёздные войны: Истории', 2016], ['Хан Соло. Звёздные войны: Истории', 2018], ['Мандалорец', 2019, 'tv'], ['Андор', 2022, 'tv'], ['Оби-Ван Кеноби', 2022, 'tv']] },
    { id: 'victory', name: 'День Победы', m: 5, d: 9, before: 3, after: 1, rgb: '255,170,60', tagline: 'Фильмы о войне и о Победе',
      films: [['Летят журавли', 1957], ['Баллада о солдате', 1959], ['Иди и смотри', 1985], ['Они сражались за Родину', 1975], ['В бой идут одни «старики»', 1974],
        ['А зори здесь тихие', 1972], ['Освобождение', 1970], ['Щит и меч', 1968], ['Семнадцать мгновений весны', 1973, 'tv'], ['Судьба человека', 1959],
        ['Двадцать дней без войны', 1976], ['Брестская крепость', 2010], ['Сталинград', 2013], ['Т-34', 2018], ['Битва за Севастополь', 2015], ['Спасти рядового Райана', 1998],
        ['Список Шиндлера', 1993], ['Пианист', 2002], ['Бесславные ублюдки', 2009], ['Дюнкерк', 2017], ['1917', 2019], ['В августе 44-го…', 2001], ['Горячий снег', 1972], ['Офицеры', 1971]] },
    { id: 'fri13', name: 'Пятница, 13-е', rule: 'fri13', before: 1, after: 0, rgb: '200,40,60', tagline: 'Для тех, кто не верит в приметы',
      films: [['Пятница, 13-е', 1980], ['Кошмар на улице Вязов', 1984], ['Хэллоуин', 1978], ['Крик', 1996], ['Техасская резня бензопилой', 1974], ['Звонок', 2002], ['Оно', 2017],
        ['Пила', 2004], ['Заклятие', 2013], ['Реинкарнация', 2018], ['Сияние', 1980], ['Изгоняющий дьявола', 1973], ['Нечто', 1982], ['Пункт назначения', 2000],
        ['Ведьма из Блэр: Курсовая с того света', 1999], ['Паранормальное явление', 2007], ['Мы', 2019], ['Прочь', 2017], ['Тихое место', 2018], ['Детские игры', 1988]] },
    { id: 'school', name: 'День знаний', m: 9, d: 1, before: 3, after: 1, rgb: '110,200,140', tagline: 'Школьные годы чудесные',
      films: [['Доживём до понедельника', 1968], ['Республика ШКИД', 1966], ['Чучело', 1983], ['Клуб «Завтрак»', 1985], ['Общество мёртвых поэтов', 1989],
        ['Дрянные девчонки', 2004], ['Школа рока', 2003], ['Хористы', 2004], ['Умница Уилл Хантинг', 1997], ['Феррис Бюллер берёт выходной', 1986],
        ['Гарри Поттер и философский камень', 2001], ['Класс', 2008], ['Простоквашино', 1978], ['Выживут только влюблённые', 2013], ['Крутой Уилл', 2007]] },
    { id: 'bttf', name: 'День «Назад в будущее»', m: 10, d: 21, before: 1, after: 0, rgb: '90,170,255', tagline: 'Путешествия во времени',
      films: [['Назад в будущее', 1985], ['Назад в будущее 2', 1989], ['Назад в будущее 3', 1990], ['Эффект бабочки', 2004], ['Донни Дарко', 2001], ['Начало', 2010], ['Довод', 2020],
        ['Терминатор', 1984], ['Петля времени', 2012], ['Грань будущего', 2014], ['Иван Васильевич меняет профессию', 1973], ['Двенадцать обезьян', 1995],
        ['Помни', 2000], ['Я — легенда', 2007], ['Один дома', 1990], ['Гостья из будущего', 1985, 'tv']] }
  ];

  const DAY = 864e5;
  const utc = (y, m, d) => Date.UTC(y, m, d);
  const today = () => {
    try { const f = localStorage.getItem('luma.holi.date'); if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); } } catch {}
    return new Date();
  };

  // подходящий праздник: ближайший к сегодняшней дате среди тех, чьё окно сейчас открыто
  function pick(now) {
    const t = utc(now.getFullYear(), now.getMonth(), now.getDate());
    let best = null;
    for (const h of HOLIDAYS) {
      const dates = [];
      if (h.rule === 'fri13') {
        for (let k = -1; k <= 1; k++) { const dt = new Date(now.getFullYear(), now.getMonth() + k, 13); if (dt.getDay() === 5) dates.push(utc(dt.getFullYear(), dt.getMonth(), 13)); }
      } else for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) dates.push(utc(y, h.m - 1, h.d));
      for (const dt of dates) {
        const diff = Math.round((t - dt) / DAY);   // < 0: до праздника, > 0: после
        if (diff >= -h.before && diff <= h.after && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { h, diff, key: h.id + ':' + new Date(dt).getUTCFullYear() };
      }
    }
    return best;
  }

  const plural = (n, a, b, c) => { const k = n % 100, j = n % 10; return k > 10 && k < 20 ? c : j === 1 ? a : j > 1 && j < 5 ? b : c; };
  const when = (diff) => diff === 0 ? 'Сегодня' : diff === -1 ? 'Завтра' : diff < 0 ? `Через ${-diff} ${plural(-diff, 'день', 'дня', 'дней')}` : diff === 1 ? 'Вчера был праздник' : 'Праздник недавно прошёл';

  const enabled = () => { try { return localStorage.getItem('luma.m.holi') !== '0'; } catch { return true; } };
  const tint = () => {};

  // названия из всех источников, чередуя их, чтобы набор не состоял из одного списка
  async function gather(h) {
    const parts = [];
    for (const s of h.lists || []) {
      try { const L = await getList(s.lb); if (L && L.films) parts.push({ url: s.lb, films: L.films }); } catch {}
    }
    if (h.films) parts.push({ films: h.films.map(([title, year, kind]) => ({ title, year, kind: kind || 'movie', key: 'holi:' + title + ':' + year })) });
    const seen = new Set(), out = [];
    for (let i = 0; out.length < 100; i++) {
      let any = false;
      for (const p of parts) { const f = p.films[i]; if (!f) continue; any = true; const k = f.key || f.title; if (!seen.has(k)) { seen.add(k); out.push(f); } }
      if (!any) break;
    }
    return out;
  }

  const CACHE = 12 * 3600e3, WANT = 24;
  // набор слайдов для главного баннера: фильмы из каталога с кадрами TMDB (если есть ключ). Баннер появляется, когда набралось 5 фильмов,
  // и дальше пополняется (массив общий). Готовый набор запоминается на 12 часов
  async function load(t, cb) {
    tint('');
    if (!enabled()) return;
    const cur = pick(today());
    if (!cur) return;
    const { h, diff } = cur, ck = 'luma.m.holi.set.' + cur.key;
    tint(h.rgb);
    const tag = `${h.name} · ${when(diff).toLowerCase()}`;
    const meta = (items) => ({ key: cur.key, id: h.id, name: h.name, rgb: h.rgb, diff, items });
    try { const c = JSON.parse(localStorage.getItem(ck) || 'null'); if (c && Date.now() - c.t < CACHE && c.items.length >= 5) { if (alive(t)) cb(meta(c.items)); return; } } catch {}
    const films = await gather(h);
    const out = []; let called = false;
    const enrich = async (x) => {   // кадр, описание и жанры из TMDB
      if (!tmHas()) return;
      const kind = L_TV.includes(x.it.type) ? 'tv' : 'movie';
      try {
        const p = { query: x.it.origin_name || x.it.name }; if (x.it.year) p[kind === 'tv' ? 'first_air_date_year' : 'year'] = x.it.year;
        const r = ((await tmdb('/search/' + kind, p)).results || []).find((q) => q.backdrop_path) || null;
        if (r) { x.bd = r.backdrop_path; x.overview = r.overview || ''; x.genres = (r.genre_ids || []).map((g) => TM_GENRES[g]).filter(Boolean); }
      } catch {}
    };
    for (let i = 0; i < films.length && out.length < WANT && alive(t); i += 8) {
      const got = await Promise.all(films.slice(i, i + 8).map(matchFilm));
      const add = [];
      for (const it of got) if (it && it.poster && !out.some((y) => y.it.id === it.id) && out.length + add.length < WANT) add.push({ it, bd: '', overview: '', genres: [], tag });
      await Promise.all(add.map(enrich));
      if (!alive(t)) return;
      out.push(...add);
      if (!called && out.length >= 5) { called = true; cb(meta(out)); }
    }
    if (!alive(t)) return;
    if (!called && out.length >= 5) { called = true; cb(meta(out)); }
    if (out.length >= 5) { try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), items: out })); } catch {} }
  }

  window.lumaHoliday = { load, pick, HOLIDAYS, when };
  if (window.__holiPending) { const f = window.__holiPending; window.__holiPending = null; f(); }
})();
