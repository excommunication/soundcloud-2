'use strict';
// Страница истории прослушиваний: обзор периода и журнал дня. Данные отдаёт main из индекса журнала сигналов
(function () {
    const api = window.historyAPI;
    const view = document.getElementById('view');
    const tip = document.getElementById('tip');
    const ARTISTS_SHORT = 8;
    // Прослушивание засчитывается с 30 секунд звука, как в индексе истории (COUNTED_MS)
    const COUNTED_MS = 30000;

    const TEXTS = {
        ru: {
            title: 'История',
            close: 'Закрыть, Esc',
            closeLabel: 'Закрыть историю',
            search: 'Поиск по истории',
            searchLabel: 'Поиск по названию и артисту',
            periodGroup: 'Период',
            periods: { 7: '7 дней', 30: '30 дней', 365: 'Год', all: 'Всё время' },
            periodText: (p) => (p === 'all' ? 'за всё время' : p === 365 ? 'за год' : 'за ' + p + ' ' + plural(p, ['день', 'дня', 'дней'])),
            music: (p) => 'музыки ' + TEXTS.ru.periodText(p),
            h: 'ч',
            min: 'мин',
            sec: 'с',
            counted: ['прослушивание', 'прослушивания', 'прослушиваний'],
            artists: ['артист', 'артиста', 'артистов'],
            fresh: ['новый артист', 'новых артиста', 'новых артистов'],
            artistsTitle: (p) => 'Артисты ' + TEXTS.ru.periodText(p),
            more: 'Ещё',
            less: 'Свернуть',
            tracks: 'Треки',
            genres: 'Жанры',
            when: 'Когда ты слушаешь',
            emptyTop: 'Здесь появится музыка, которую ты слушаешь',
            nothing: 'Пока пусто',
            times: ['раз', 'раза', 'раз'],
            heatLabel: 'Минуты музыки по часам и дням недели',
            week: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
            lessHeat: 'Меньше',
            moreHeat: 'больше',
            silence: 'тишина',
            today: 'Сегодня',
            yesterday: 'Вчера',
            todayLower: 'сегодня',
            prevDay: 'Предыдущий день с музыкой',
            nextDay: 'Следующий день с музыкой',
            dayEmpty: 'В этот день музыки не было',
            fromWave: 'Из волны',
            fromRadar: 'Из радара релизов',
            fromLibrary: 'Из «Моей музыки»',
            fromMix: 'Из подборки',
            fromArtist: 'Из всех треков артиста',
            away: 'Играло, пока тебя не было у компьютера',
            like: 'Лайк',
            skipped: (t) => 'пропущен на ' + t,
            done: (t) => 'дослушан, ' + t,
            of: (a, b) => a + ' из ' + b,
            loading: 'Название загружается',
            unavailable: 'Трек недоступен',
            waveLabel: (p) => 'Длительность прослушивания ' + TEXTS.ru.periodText(p),
            from: (d) => 'С ' + d,
            results: 'Результаты поиска',
            plays: ['прослушивание', 'прослушивания', 'прослушиваний'],
            latest: (n) => 'последние ' + n,
            searchEmpty: 'Ничего не нашлось',
            signedOut: 'Войди в аккаунт SoundCloud, и здесь появится история прослушиваний',
            emptyAll: 'Здесь будут треки, которые ты слушаешь в клиенте',
            failed: 'Историю не удалось загрузить',
            retry: 'Повторить',
            artistTip: (plays, time) => plays + ', ' + time + '. Открыть страницу артиста',
            tasteArtists: 'Артисты, которых волна ставит чаще',
            tasteTags: 'Теги, на которые опирается волна',
            tasteEmpty: 'Волне пока не на что опереться',
            drop: 'Убрать из вкуса',
            removed: 'Убрано из вкуса:',
            restore: 'Вернуть во вкус волны',
            recap: 'Итоги',
            recapTip: 'Твоя музыка карточками для сторис',
            // Итоги по периодам (2.12.0): неделя, календарный месяц, календарный год
            recapOpen: { week: 'Итоги недели', month: 'Итоги месяца', year: 'Итоги года' },
            recapPeriods: { week: 'Неделя', month: 'Месяц', year: 'Год' },
            recapPeriodGroup: 'Период итогов',
            recapWeeks: { last: 'Прошлая неделя', this: 'Эта неделя' },
            recapSpanGroup: 'Прошлый или нынешний',
            monthNames: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
            monthIn: ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'],
            monthLetters: ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'],
            recapNone: (p, span, month, year) =>
                (p === 'week' ? (span === 'this' ? 'На этой неделе' : 'На прошлой неделе') : p === 'month' ? 'В ' + TEXTS.ru.monthIn[month] : 'В ' + year + ' году') +
                ' музыки ' + (span === 'this' ? 'пока не было' : 'не было'),
            recapQuiet: 'Здесь пока тихо',
            recapThinTitle: 'Пока маловато музыки',
            recapThin: (days, need) => 'Музыка была ' + days + ' ' + plural(days, ['день', 'дня', 'дней']) + ', итоги собираются от ' + need + ' дней с музыкой',
            recapThinHint: { last: 'Загляни в другой период', this: 'Загляни позже, итоги соберутся сами' },
            recapBestDay: (day, time) => 'Лучший день: ' + day + ' · ' + time,
            recapBestMonth: (month, time) => 'Лучший месяц: ' + month + ' · ' + time,
            recapWeek: (n, range) => 'Неделя ' + n + ', ' + range,
            // 21-27 сентября 2026, 28 сентября - 4 октября 2026, 28 декабря 2026 - 3 января 2027
            recapRange: (a, b) => {
                const [x, y] = [new Date(a), new Date(b)];
                if (x.getFullYear() !== y.getFullYear()) return fmtDayMonth.format(a) + ' ' + x.getFullYear() + ' - ' + fmtDayMonth.format(b) + ' ' + y.getFullYear();
                return (x.getMonth() === y.getMonth() ? x.getDate() + '-' : fmtDayMonth.format(a) + ' - ') + fmtDayMonth.format(b) + ' ' + y.getFullYear();
            },
            recapMusic: 'музыки',
            recapTracks: 'Треки недели',
            recapArtists: 'Артисты недели',
            recapGenres: 'Любимые жанры',
            dayParts: ['Утро', 'День', 'Вечер', 'Ночь'],
            recapPeak: (day, hour) => 'Пик: ' + day + ', ' + hour,
            recapLoading: 'Собираю итоги',
            recapFailed: 'Итоги не собрались',
            recapColors: 'Цвет карточки',
            recapPresets: ['Полночь', 'Фиолет', 'Бордо', 'Океан', 'Закат', 'Мята', 'Персик', 'Иней'],
            recapLabel: (title, time, plays) => title + ': ' + time + ' музыки, ' + plays,
            copy: 'Скопировать',
            copied: 'Скопировано',
            copyFailed: 'Не удалось скопировать',
            save: 'Сохранить',
            saved: 'Сохранено',
            saveFailed: 'Не удалось сохранить',
            recapClose: 'Закрыть',
            // Карточки сводки (2.11.0): четыре истории в духе итогов года
            recapAuto: 'Цвет обложки',
            personaTip: 'Твой музыкальный характер за этот период',
            recapCards: { week: 'Неделя', artist: 'Артист', track: 'Трек', vibe: 'Характер' },
            recapCardOf: (name, n, total) => name + ', карточка ' + n + ' из ' + total,
            // name: месяц в именительном («ноябрь») или год
            recapKicker: (p, span, name) => (p === 'week' ? 'Твоя неделя' : 'Твой ' + name) + (span === 'this' ? ' пока' : ''),
            recapPerDay: (time) => 'в среднем ' + time + ' в день',
            recapStreak: ['день подряд', 'дня подряд', 'дней подряд'],
            recapDaysWith: ['день с музыкой', 'дня с музыкой', 'дней с музыкой'],
            recapTopArtist: { week: 'Артист недели', month: 'Артист месяца', year: 'Артист года' },
            recapTopTrack: { week: 'Трек недели', month: 'Трек месяца', year: 'Трек года' },
            recapShareOf: (share, p) => share + '% ' + { week: 'твоей недели', month: 'твоего месяца', year: 'твоего года' }[p],
            recapCharacter: { week: 'Твой характер недели', month: 'Твой характер месяца', year: 'Твой характер года' },
            recapPeakAt: (hour) => 'Пик в ' + hour,
            recapHourLabel: 'Музыка по часам суток',
            archetypes: {
                starter: 'Разгон', nightOwl: 'Ночная сова', loyal: 'Верный фанат', repeat: 'На репите', explorer: 'Исследователь',
                earlyBird: 'Ранняя пташка', marathon: 'Марафонец', eclectic: 'Меломан без границ', steady: 'Свой ритм',
            },
            archetypeLines: {
                starter: (i, m) => ({ week: 'Неделя', month: 'Месяц', year: 'Год' })[m.period] + ' только разгоняется, дальше больше',
                nightOwl: (i) => i.nightShare + '% музыки с полуночи до пяти утра',
                loyal: (i, m) => i.topShare + '% времени с ' + m.topArtist,
                repeat: (i, m) => '«' + m.topTrack + '»: ' + m.topPlays + ' ' + plural(m.topPlays, ['раз', 'раза', 'раз']),
                explorer: (i, m) => m.fresh + ' ' + plural(m.fresh, TEXTS.ru.fresh) + ' за ' + { week: 'неделю', month: 'месяц', year: 'год' }[m.period],
                earlyBird: (i) => i.morningShare + '% музыки до десяти утра',
                marathon: (i, m) => 'В среднем ' + m.perDay + ' музыки в день',
                eclectic: (i, m) => m.genreCount + ' ' + plural(m.genreCount, ['жанр', 'жанра', 'жанров']) + ', и ни один не главный',
                steady: (i, m) => 'Музыка ' + i.days + ' ' + plural(i.days, ['день', 'дня', 'дней']) + ' из ' + m.spanDays + ', в своём темпе',
            },
            waveTitle: 'Как попадает волна',
            waveCount: (n, p) => n + ' ' + plural(n, ['трек', 'трека', 'треков']) + ' волны ' + TEXTS.ru.periodText(p),
            waveLoading: 'Считаю',
            waveFailed: 'Замер не загрузился',
            waveNone: 'Волна в этот период не играла',
            waveEarly: 'пропущено до 0:30',
            waveDone: 'дослушано',
            waveShareTip: (part, whole) => part + ' из ' + whole,
            waveOwn: (share) => 'своя музыка ' + share + '%',
            wavePrev: (share, p) => (p === 365 ? 'прошлый год ' : 'прошлые ' + p + ' ' + plural(p, ['день', 'дня', 'дней']) + ' ') + share + '%',
            likes: ['лайк', 'лайка', 'лайков'],
            waveMore: (n) => '«Больше такого» ' + n,
            refusals: ['отказ', 'отказа', 'отказов'],
            waveAgainstTip: '«Не нравится», «Не сейчас» или скрытый аккаунт',
            waveRepeats: (n) => n + ' ' + plural(n, ['повтор', 'повтора', 'повторов']) + ' недавнего',
            waveRepeatsTip: 'Трек волны уже звучал за 3 дня до этого',
            waveNewTip: 'Впервые прослушаны дольше 30 секунд, и именно в волне',
            waveDays: 'Пропуски до 0:30 по дням',
            waveDaysLabel: 'Доля ранних пропусков в волне по дням',
            waveDay: (day, share, early, total) => day + ': ' + share + '%, ' + early + ' из ' + total,
            waveDayIdle: (day) => day + ': волна не играла',
            waveWeeks: 'Пропуски до 0:30 по неделям',
            waveWeeksLabel: 'Доля ранних пропусков в волне по неделям',
            waveWeek: (d, share, early, total) => 'С ' + d + ': ' + share + '%, ' + early + ' из ' + total,
            waveWeekIdle: (d) => 'С ' + d + ': волна не играла',
            waveCols: { tracks: 'Треков', early: 'До 0:30', done: 'Дослушано', likes: 'Лайки' },
            waveSource: 'Подборка',
            waveReason: 'Причина',
            waveOrigin: 'Откуда взят',
            waveSlot: 'Место в выдаче',
            slots: { first: 'Первые три', later: 'С четвёртого' },
            wavePreset: 'Настроение',
            presets: { happy: 'Весёлое', sad: 'Грустное', aggressive: 'Агрессивное', calm: 'Спокойное', energetic: 'Энергичное' },
            sources: {
                similar: 'Моя волна: похожее', fresh: 'Моя волна: новое', track: 'Волна по треку', artist: 'Волна по артисту', playlist: 'Волна по плейлисту', daily: 'Разведка',
                forgotten: 'Давно не слушал', group: 'Твой вкус', tracks: 'Волна по набору', vibe: 'Волна по описанию', radar: 'Радар релизов', library: 'В «Моей музыке»',
                artistAll: 'Все треки артиста', liked: 'Лайкнули твои артисты',
            },
            reasons: {
                similar: 'Похоже на трек', fresh: 'Новое, похоже на трек', newArtist: 'Новый артист', genreFresh: 'Свежее в жанре', genrePopular: 'Популярное в жанре',
                genreSimilar: 'Жанр и похожее', artistTrack: 'Треки артиста', mood: 'В духе трека', tasteArtist: 'Любимый артист', tasteTag: 'Любимый тег',
                daily: 'Разведка', forgotten: 'Давно не звучал', group: 'Твой вкус', vibe: 'По запросу', version: 'Другая версия', radar: 'Радар релизов', restored: 'Сохранённая очередь',
                moodTag: 'Метка настроения', seedTrack: 'Начало волны', relatedArtist: 'Похожий артист', scMix: 'Подборка SoundCloud',
                neighbors: 'Слушатели с похожим вкусом', likedBy: 'Лайк артиста', library: 'Моя музыка', station: 'Станция трека',
                '': 'Не записана',
            },
        },
        en: {
            title: 'History',
            close: 'Close, Esc',
            closeLabel: 'Close history',
            search: 'Search history',
            searchLabel: 'Search by title and artist',
            periodGroup: 'Period',
            periods: { 7: '7 days', 30: '30 days', 365: 'Year', all: 'All time' },
            periodText: (p) => (p === 'all' ? 'of all time' : p === 365 ? 'in the last year' : 'in the last ' + p + ' days'),
            music: (p) => 'of music ' + (p === 'all' ? 'in total' : TEXTS.en.periodText(p)),
            h: 'h',
            min: 'min',
            sec: 's',
            counted: ['play', 'plays'],
            artists: ['artist', 'artists'],
            fresh: ['new artist', 'new artists'],
            artistsTitle: (p) => 'Artists ' + TEXTS.en.periodText(p),
            more: 'More',
            less: 'Show less',
            tracks: 'Tracks',
            genres: 'Genres',
            when: 'When you listen',
            emptyTop: 'Music you listen to will appear here',
            nothing: 'Nothing yet',
            times: ['play', 'plays'],
            heatLabel: 'Minutes of music by hour and weekday',
            week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            lessHeat: 'Less',
            moreHeat: 'more',
            silence: 'silence',
            today: 'Today',
            yesterday: 'Yesterday',
            todayLower: 'today',
            prevDay: 'Previous day with music',
            nextDay: 'Next day with music',
            dayEmpty: 'No music on this day',
            fromWave: 'From the wave',
            fromRadar: 'From Release Radar',
            fromLibrary: 'From My music',
            fromMix: 'From a mix',
            fromArtist: 'From all tracks by an artist',
            away: 'Played while you were away',
            like: 'Liked',
            skipped: (t) => 'skipped at ' + t,
            done: (t) => 'finished, ' + t,
            of: (a, b) => a + ' of ' + b,
            loading: 'Loading title',
            unavailable: 'Track unavailable',
            waveLabel: (p) => (p === 'all' ? 'Total listening time' : 'Listening time ' + TEXTS.en.periodText(p)),
            from: (d) => 'From ' + d,
            results: 'Search results',
            plays: ['play', 'plays'],
            latest: (n) => 'latest ' + n,
            searchEmpty: 'Nothing found',
            signedOut: 'Sign in to SoundCloud to see your listening history here',
            emptyAll: 'Tracks you play in the app will show up here',
            failed: 'Could not load history',
            retry: 'Retry',
            artistTip: (plays, time) => plays + ', ' + time + '. Open artist page',
            tasteArtists: 'Artists the wave plays more often',
            tasteTags: 'Tags the wave leans on',
            tasteEmpty: 'Nothing for the wave to go on yet',
            drop: 'Remove from taste',
            removed: 'Removed from taste:',
            restore: 'Put back into the wave’s taste',
            recap: 'Recap',
            recapTip: 'Your music as story cards',
            // Period recaps (2.12.0): week, calendar month, calendar year
            recapOpen: { week: 'Weekly recap', month: 'Monthly recap', year: 'Yearly recap' },
            recapPeriods: { week: 'Week', month: 'Month', year: 'Year' },
            recapPeriodGroup: 'Recap period',
            recapWeeks: { last: 'Last week', this: 'This week' },
            recapSpanGroup: 'Previous or current',
            monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            monthIn: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            monthLetters: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
            recapNone: (p, span, month, year) =>
                'No music ' + (p === 'week' ? (span === 'this' ? 'this week' : 'last week') : 'in ' + (p === 'month' ? TEXTS.en.monthIn[month] : year)) + (span === 'this' ? ' yet' : ''),
            recapQuiet: 'All quiet here',
            recapThinTitle: 'Not enough music yet',
            recapThin: (days, need) => 'Music on ' + days + ' ' + plural(days, ['day', 'days']) + ' so far, a recap needs ' + need + ' days with music',
            recapThinHint: { last: 'Try another period', this: 'Check back later, it will fill up' },
            recapBestDay: (day, time) => 'Best day: ' + day + ' · ' + time,
            recapBestMonth: (month, time) => 'Top month: ' + month + ' · ' + time,
            recapWeek: (n, range) => 'Week ' + n + ', ' + range,
            // September 21-27, 2026, September 28 - October 4, 2026, December 28, 2026 - January 3, 2027
            recapRange: (a, b) => {
                const [x, y] = [new Date(a), new Date(b)];
                if (x.getFullYear() !== y.getFullYear()) return fmtDayMonth.format(a) + ', ' + x.getFullYear() + ' - ' + fmtDayMonth.format(b) + ', ' + y.getFullYear();
                return fmtDayMonth.format(a) + (x.getMonth() === y.getMonth() ? '-' + y.getDate() : ' - ' + fmtDayMonth.format(b)) + ', ' + y.getFullYear();
            },
            recapMusic: 'of music',
            recapTracks: 'Tracks of the week',
            recapArtists: 'Artists of the week',
            recapGenres: 'Favourite genres',
            dayParts: ['Morning', 'Afternoon', 'Evening', 'Night'],
            recapPeak: (day, hour) => 'Peak: ' + day + ', ' + hour,
            recapLoading: 'Putting your recap together',
            recapFailed: 'Could not build the recap',
            recapColors: 'Card colour',
            recapPresets: ['Midnight', 'Violet', 'Burgundy', 'Ocean', 'Sunset', 'Mint', 'Peach', 'Frost'],
            recapLabel: (title, time, plays) => title + ': ' + time + ' of music, ' + plays,
            copy: 'Copy',
            copied: 'Copied',
            copyFailed: 'Could not copy',
            save: 'Save',
            saved: 'Saved',
            saveFailed: 'Could not save',
            recapClose: 'Close',
            // Recap cards (2.11.0): four stories in the spirit of a year-end wrap-up
            recapAuto: 'Cover colour',
            personaTip: 'Your listening personality for this period',
            recapCards: { week: 'Week', artist: 'Artist', track: 'Track', vibe: 'Personality' },
            recapCardOf: (name, n, total) => name + ', card ' + n + ' of ' + total,
            // name: month (November) or year
            recapKicker: (p, span, name) => 'Your ' + (p === 'week' ? 'week' : name) + (span === 'this' ? ' so far' : ''),
            recapPerDay: (time) => 'about ' + time + ' a day',
            recapStreak: ['day in a row', 'days in a row'],
            recapDaysWith: ['day with music', 'days with music'],
            recapTopArtist: { week: 'Artist of the week', month: 'Artist of the month', year: 'Artist of the year' },
            recapTopTrack: { week: 'Track of the week', month: 'Track of the month', year: 'Track of the year' },
            recapShareOf: (share, p) => share + '% of your ' + p,
            recapCharacter: { week: 'Your listening personality', month: 'Your listening personality', year: 'Your listening personality' },
            recapPeakAt: (hour) => 'Peak at ' + hour,
            recapHourLabel: 'Music by hour of day',
            archetypes: {
                starter: 'Warming up', nightOwl: 'Night owl', loyal: 'Loyal fan', repeat: 'On repeat', explorer: 'Explorer',
                earlyBird: 'Early bird', marathon: 'Marathoner', eclectic: 'Genre-hopper', steady: 'Own groove',
            },
            archetypeLines: {
                starter: (i, m) => 'The ' + m.period + ' is just getting going',
                nightOwl: (i) => i.nightShare + '% of your music between midnight and 5 am',
                loyal: (i, m) => i.topShare + '% of your time with ' + m.topArtist,
                repeat: (i, m) => '“' + m.topTrack + '”: ' + m.topPlays + ' ' + plural(m.topPlays, ['play', 'plays']),
                explorer: (i, m) => m.fresh + ' ' + plural(m.fresh, TEXTS.en.fresh) + ' in a ' + m.period,
                earlyBird: (i) => i.morningShare + '% of your music before 10 am',
                marathon: (i, m) => 'About ' + m.perDay + ' of music a day',
                eclectic: (i, m) => m.genreCount + ' ' + plural(m.genreCount, ['genre', 'genres']) + ', none of them on top',
                steady: (i, m) => 'Music on ' + i.days + ' ' + plural(i.days, ['day', 'days']) + ' of ' + m.spanDays + ', at your own pace',
            },
            waveTitle: 'How well the wave fits',
            waveCount: (n, p) => n + ' wave ' + plural(n, ['track', 'tracks']) + ' ' + (p === 'all' ? 'in total' : TEXTS.en.periodText(p)),
            waveLoading: 'Counting',
            waveFailed: 'Could not load the stats',
            waveNone: 'The wave didn’t play in this period',
            waveEarly: 'skipped before 0:30',
            waveDone: 'played to the end',
            waveShareTip: (part, whole) => part + ' of ' + whole,
            waveOwn: (share) => 'your music ' + share + '%',
            wavePrev: (share, p) => (p === 365 ? 'previous year ' : 'previous ' + p + ' days ') + share + '%',
            likes: ['like', 'likes'],
            waveMore: (n) => 'More like this ' + n,
            refusals: ['refusal', 'refusals'],
            waveAgainstTip: 'Don’t like, Not now or a hidden account',
            waveRepeats: (n) => n + ' recent ' + plural(n, ['repeat', 'repeats']),
            waveRepeatsTip: 'The wave track had already played in the 3 days before',
            waveNewTip: 'First played for over 30 seconds, and in the wave',
            waveDays: 'Skips before 0:30 by day',
            waveDaysLabel: 'Share of early skips in the wave by day',
            waveDay: (day, share, early, total) => day + ': ' + share + '%, ' + early + ' of ' + total,
            waveDayIdle: (day) => day + ': the wave didn’t play',
            waveWeeks: 'Skips before 0:30 by week',
            waveWeeksLabel: 'Share of early skips in the wave by week',
            waveWeek: (d, share, early, total) => 'From ' + d + ': ' + share + '%, ' + early + ' of ' + total,
            waveWeekIdle: (d) => 'From ' + d + ': the wave didn’t play',
            waveCols: { tracks: 'Tracks', early: 'Before 0:30', done: 'To the end', likes: 'Likes' },
            waveSource: 'Mix',
            waveReason: 'Reason',
            waveOrigin: 'Found via',
            waveSlot: 'Place in the batch',
            slots: { first: 'First three', later: 'Fourth on' },
            wavePreset: 'Mood',
            presets: { happy: 'Happy', sad: 'Sad', aggressive: 'Aggressive', calm: 'Calm', energetic: 'Energetic' },
            sources: {
                similar: 'My Wave: Similar', fresh: 'My Wave: New', track: 'Wave from track', artist: 'Wave from artist', playlist: 'Wave from playlist', daily: 'Scout',
                forgotten: 'Not played in a while', group: 'Your taste', tracks: 'Wave from picks', vibe: 'Described wave', radar: 'Release Radar', library: 'In My music',
                artistAll: 'All tracks by artist', liked: 'Liked by your artists',
            },
            reasons: {
                similar: 'Similar to a track', fresh: 'New, similar to a track', newArtist: 'New artist', genreFresh: 'Fresh in genre', genrePopular: 'Popular in genre',
                genreSimilar: 'Genre and similar', artistTrack: 'Artist’s tracks', mood: 'In the spirit of a track', tasteArtist: 'Favourite artist', tasteTag: 'Favourite tag',
                daily: 'Scout', forgotten: 'Not played in a while', group: 'Your taste', vibe: 'From your request', version: 'Another version', radar: 'Release Radar', restored: 'Saved queue',
                moodTag: 'Mood tag', seedTrack: 'Wave start', relatedArtist: 'Similar artist', scMix: 'SoundCloud mix',
                neighbors: 'Listeners with your taste', likedBy: 'Liked by an artist', library: 'My music', station: 'Track station',
                '': 'Not recorded',
            },
        },
    };

    const state = {
        lang: 'ru',
        signedIn: true,
        failed: false,
        loaded: false,
        period: 30,
        query: '',
        overview: null,
        selected: 0,
        day: null,
        results: null,
        allArtists: false,
        // Трек, который сейчас в плеере сайта: отмечается самая свежая его строка
        nowId: 0,
        // Вкус глазами волны: не зависит от периода, считается по всей истории с забыванием
        taste: null,
        // Замер волны за период: грузится, только пока блок раскрыт
        waveOpen: false,
        wave: null,
        waveFailed: false,
    };
    const WEEK = 7 * 86400000;
    let T = TEXTS.ru;
    let fmtLong, fmtShort, fmtWd, fmtDayMonth, fmtWeekday;

    // Форматирование
    function plural(n, forms) {
        if (forms.length === 2) return forms[n === 1 ? 0 : 1];
        return forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
    }
    const pad = (n) => String(n).padStart(2, '0');
    const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const clock = (ms) => {
        const s = Math.round(ms / 1000);
        return Math.floor(s / 60) + ':' + pad(s % 60);
    };
    const span = (ms) => {
        const m = Math.round(ms / 60000);
        if (m < 1) return Math.round(ms / 1000) + ' ' + T.sec;
        const h = Math.floor(m / 60);
        return h ? h + ' ' + T.h + (m % 60 ? ' ' + (m % 60) + ' ' + T.min : '') : m + ' ' + T.min;
    };
    const minutesLabel = (m) => (m >= 60 ? (m % 60 ? Math.floor(m / 60) + ' ' + T.h + ' ' + (m % 60) + ' ' + T.min : m / 60 + ' ' + T.h) : m + ' ' + T.min);
    const timeOf = (at) => {
        const d = new Date(at);
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    };
    const dayStart = (at) => {
        const d = new Date(at);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };
    const addDays = (start, n) => {
        const d = new Date(start);
        d.setDate(d.getDate() + n);
        return d.getTime();
    };
    const today = () => dayStart(Date.now());
    const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
    const dayTitle = (start) => (start === today() ? T.today : start === addDays(today(), -1) ? T.yesterday : cap(fmtLong.format(start)));
    // Обложки журнала: -large это 100 на 100, для крупных кругов берётся 300 на 300
    const bigArt = (url) => url.replace(/-large\.(jpg|png)$/, '-t300x300.$1');
    const artistPath = (path) => (path ? '/' + path.split('/')[1] : '');

    function setLanguage(lang) {
        state.lang = lang === 'en' ? 'en' : 'ru';
        T = TEXTS[state.lang];
        document.documentElement.lang = state.lang;
        fmtLong = new Intl.DateTimeFormat(state.lang, { weekday: 'long', day: 'numeric', month: 'long' });
        fmtShort = new Intl.DateTimeFormat(state.lang, { day: 'numeric', month: 'short' });
        fmtWd = new Intl.DateTimeFormat(state.lang, { weekday: 'short', day: 'numeric', month: 'long' });
        fmtDayMonth = new Intl.DateTimeFormat(state.lang, { day: 'numeric', month: 'long' });
        fmtWeekday = new Intl.DateTimeFormat(state.lang, { weekday: 'long' });
        document.title = T.title;
    }
    const ICON = {
        wave: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1 7c1.5-3.5 3-3.5 4 0s2.5 3.5 4 0 2.5-3.5 4 0"/></svg>',
        like: '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 12.3 5.9 11.3C2.8 8.5 1 6.8 1 4.7 1 3 2.3 1.7 4 1.7c.9 0 1.9.4 2.5 1.1h1c.6-.7 1.6-1.1 2.5-1.1 1.7 0 3 1.3 3 3 0 2.1-1.8 3.8-4.9 6.6z"/></svg>',
        away: '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.6 1.3a5.8 5.8 0 1 0 4.1 8.8A5 5 0 0 1 8.6 1.3z"/></svg>',
        back: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8H3M7 4 3 8l4 4"/></svg>',
        search: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="4.5"/><path d="m9.5 9.5 3.5 3.5" stroke-linecap="round"/></svg>',
        prev: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2.5 4.5 7 9 11.5"/></svg>',
        next: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5 9.5 7 5 11.5"/></svg>',
        undo: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2 1.5 4.5 4 7"/><path d="M1.5 4.5H7a3.25 3.25 0 0 1 0 6.5H5"/></svg>',
        recap: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5"/><circle cx="5" cy="6.5" r="1.6"/><path d="M8 5.5h3M8 8h2.5" stroke-linecap="round"/></svg>',
        fold: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5 9.5 7 5 11.5"/></svg>',
    };

    // Куски страницы
    const periodSeg = () =>
        '<div class="seg" role="group" aria-label="' + esc(T.periodGroup) + '">' +
        [7, 30, 365, 'all'].map((value) => '<button data-period="' + value + '" aria-pressed="' + (state.period === value) + '">' + esc(T.periods[value]) + '</button>').join('') +
        '</div>';
    const head = (extra) =>
        '<div class="ph"><button class="back" data-act="close" aria-label="' + esc(T.closeLabel) + '" data-tip="' + esc(T.close) + '">' + ICON.back + '</button><h1>' + esc(T.title) + '</h1>' + extra +
        '<label class="search"><input type="search" id="q" placeholder="' + esc(T.search) + '" value="' + esc(state.query) + '" aria-label="' + esc(T.searchLabel) + '" spellcheck="false" autocomplete="off">' + ICON.search + '</label></div>';
    // Период страницы подсказывает период итогов: 7 дней — неделя, 30 дней — месяц, год — год, всё время — неделя
    const recapKindOf = (period) => (period === 30 ? 'month' : period === 365 ? 'year' : 'week');
    const recapButton = () => '<button class="rc-open" data-act="recap" data-tip="' + esc(T.recapTip) + '">' + ICON.recap + esc(T.recapOpen[recapKindOf(state.period)]) + '</button>';
    const art = (url, cls) => (url ? '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy">' : '<span class="' + cls + '" aria-hidden="true"></span>');
    const keyOf = (r) => r.at + ':' + r.id;
    // Откуда играло: радар, «Моя музыка» и подборки называются своими именами, остальное волна
    function sourceLabel(source) {
        const kind = source.slice(5);
        if (kind === 'radar') return T.fromRadar;
        if (kind === 'library') return T.fromLibrary;
        if (kind === 'artistAll') return T.fromArtist;
        return ['daily', 'forgotten', 'liked', 'group', 'tracks', 'vibe'].includes(kind) ? T.fromMix : T.fromWave;
    }
    // Играющий трек отмечается одной строкой: самой свежей в списке (строки идут от новых к старым)
    const playingKey = (rows) => {
        const found = state.nowId ? rows.find((r) => r.id === state.nowId) : null;
        return found ? keyOf(found) : '';
    };

    function row(r, withDate, playing) {
        // Смену трека сайтом (endedBy auto) человек не делал, это не пропуск. Серым идёт только пропуск раньше 30 секунд,
        // подпись пропуска показывает место остановки; у записей без него остаётся, сколько играло
        const skipped = r.end === 'skip' && r.endedBy !== 'auto';
        const stop = skipped && r.pos !== null && r.pos !== undefined ? r.pos : r.heard;
        const early = skipped && r.heard < COUNTED_MS;
        const frac = r.dur ? Math.min(1, (skipped ? stop : r.heard) / r.dur) : 1;
        const label = r.source.startsWith('wave') ? sourceLabel(r.source) : '';
        const icons =
            // role="img": у простого span aria-label читалки не озвучивают
            (label ? '<span role="img" data-tip="' + esc(label) + '" aria-label="' + esc(label) + '">' + ICON.wave + '</span>' : '') +
            (r.away ? '<span role="img" data-tip="' + esc(T.away) + '" aria-label="' + esc(T.away) + '">' + ICON.away + '</span>' : '') +
            (r.liked ? '<span class="like" role="img" data-tip="' + esc(T.like) + '" aria-label="' + esc(T.like) + '">' + ICON.like + '</span>' : '');
        const heard = !r.dur ? clock(r.heard) : skipped ? T.skipped(clock(stop)) : r.end === 'done' ? T.done(clock(r.dur)) : T.of(clock(r.heard), clock(r.dur));
        // Название ещё добирается: пустой скелетон вместо подписи, пока данные не готовы
        const title = r.title ? '<b>' + esc(r.title) + '</b>' : r.resolved === 2 ? '<b class="none">' + esc(T.unavailable) + '</b>' : '<b class="none sk" role="status" aria-label="' + esc(T.loading) + '"></b>';
        const when = withDate ? cap(fmtShort.format(r.at)) + ', ' + timeOf(r.at) : timeOf(r.at);
        const play = r.path ? ' play" role="button" tabindex="0" data-path="' + esc(r.path) + '" data-id="' + r.id : '';
        return (
            '<div class="row' + (early ? ' skip' : '') + (playing ? ' playing' : '') + play + '">' +
            '<span class="tm num">' + esc(when) + '</span>' + art(r.artwork, 'art') +
            '<span class="ti">' + title + '<span>' + esc(r.artistName) + '</span></span>' +
            '<span class="hd"><span class="bar"><i style="width:' + (frac * 100).toFixed(1) + '%"></i></span><span class="hn num">' + esc(heard) + '</span></span>' +
            '<span class="ic">' + icons + '</span></div>'
        );
    }

    function topList(kind, entries, limit) {
        if (!entries.length) return '<p class="sub">' + esc(kind === 'genre' ? T.nothing : T.emptyTop) + '</p>';
        const max = entries[0].plays || 1;
        return (
            '<ol class="tl">' +
            entries.slice(0, limit).map((e, i) => {
                const name = kind === 'genre' ? cap(e.name) : e.name || '';
                const cover = kind === 'genre' ? '' : art(e.artwork, 'art');
                const tipText = e.plays + ' ' + plural(e.plays, T.times) + ', ' + span(e.ms);
                const play = kind === 'track' && e.path ? ' play" role="button" tabindex="0" data-path="' + esc(e.path) : '';
                return (
                    '<li class="' + (cover ? '' : 'noart') + play + '" data-tip="' + esc(tipText) + '"><span class="rk num">' + (i + 1) + '</span>' + cover +
                    '<span class="nm"><span class="nm-top">' + (name ? '<b>' + esc(name) + '</b>' : '<b class="none sk" role="status" aria-label="' + esc(T.loading) + '"></b>') + '<span class="num">' + e.plays + '</span></span>' +
                    (kind === 'track' ? '<span class="nm-by">' + esc(e.artistName) + '</span>' : '') +
                    '<span class="bar"><i style="width:' + ((e.plays / max) * 100).toFixed(1) + '%"></i></span></span></li>'
                );
            }).join('') +
            '</ol>'
        );
    }

    function heatmap(heat) {
        const max = Math.max(1, ...heat);
        let html = '<div class="hm" role="img" aria-label="' + esc(T.heatLabel) + '"><span></span>' + [0, 6, 12, 18].map((h) => '<span class="hh num">' + h + ':00</span>').join('');
        for (let day = 0; day < 7; day++) {
            html += '<span>' + esc(T.week[day]) + '</span>';
            for (let hour = 0; hour < 24; hour++) {
                const minutes = heat[day * 24 + hour] || 0;
                const level = minutes ? 1 + Math.min(4, Math.floor((minutes / max) * 5)) : 0;
                html += '<i class="l' + level + '" data-tip="' + esc(T.week[day] + ', ' + hour + ':00-' + (hour + 1) + ':00: ' + (minutes ? minutesLabel(minutes) : T.silence)) + '"></i>';
            }
        }
        return (
            html + '</div><div class="lg"><span>' + esc(T.lessHeat) + '</span>' + [1, 2, 3, 4, 5].map((n) => '<i style="background:var(--h' + n + ')"></i>').join('') + '<span>' + esc(T.moreHeat) + '</span></div>'
        );
    }

    // Волна периода: высота столбца это минуты звука, выбранный день оранжевый, под осью отражение
    function periodWave(wave) {
        const bins = wave.bins;
        const peak = Math.max(1, ...bins);
        const step = peak > 60 ? 60 : 10;
        const max = Math.ceil(peak / step) * step;
        const binMs = wave.binHours * 3600000;
        const rects = bins.map((minutes, i) => {
            const at = wave.from + i * binMs;
            const on = wave.binHours < 24 ? dayStart(at) === state.selected : state.selected >= at && state.selected < at + binMs;
            const h = minutes ? Math.max(2, (minutes / max) * 88) : 1;
            const cls = on ? 'on' : minutes ? '' : 'idle';
            return (
                '<rect class="' + cls + '" x="' + i * 3 + '" y="' + (90 - h).toFixed(1) + '" width="2" height="' + h.toFixed(1) + '"/>' +
                (minutes ? '<rect class="' + cls + ' echo" x="' + i * 3 + '" y="93" width="2" height="' + (h * 0.3).toFixed(1) + '"/>' : '')
            );
        }).join('');
        const dates = [...new Set([0, .25, .5, .75, 1].map((fraction) => dayStart(wave.from + Math.floor((bins.length - 1) * fraction) * binMs)))];
        const grid = [2, 46, 90].map((y) => '<line x1="0" x2="' + bins.length * 3 + '" y1="' + y + '" y2="' + y + '" class="pwave-grid"/>').join('');
        return (
            '<div class="pwave"><div class="pwave-axis" aria-hidden="true"><span>' + esc(minutesLabel(max)) + '</span><span>' + esc(minutesLabel(max / 2)) + '</span><span>0</span></div>' +
            '<svg viewBox="0 0 ' + bins.length * 3 + ' 124" preserveAspectRatio="none" data-wave="period" role="img" aria-label="' + esc(T.waveLabel(state.period)) + '">' + grid + rects + '</svg>' +
            '<div class="pwave-x">' + dates.map((at) => '<button data-day="' + at + '" aria-label="' + esc(fmtLong.format(at)) + '" aria-pressed="' + (at === state.selected) + '">' + esc(fmtShort.format(at)) + '</button>').join('') + '</div></div>'
        );
    }

    function artistsBlock(list) {
        if (!list.length) return '<p class="sub">' + esc(T.emptyTop) + '</p>';
        const shown = state.allArtists ? list : list.slice(0, ARTISTS_SHORT);
        return (
            '<div class="artists">' +
            shown.map((a) => {
                const path = artistPath(a.path);
                const cover = a.artwork ? '<img src="' + esc(bigArt(a.artwork)) + '" alt="" loading="lazy">' : '';
                const body = '<span class="av">' + cover + '</span><b>' + esc(a.name || T.loading) + '</b><span class="num">' + esc(span(a.ms)) + '</span>';
                const tipText = T.artistTip(a.plays + ' ' + plural(a.plays, T.times), span(a.ms));
                return path ? '<button data-artist="' + esc(path) + '" data-tip="' + esc(tipText) + '">' + body + '</button>' : '<div>' + body + '</div>';
            }).join('') +
            '</div>'
        );
    }

    // Вкус глазами волны: полоска это вес в модели относительно самого любимого
    function tasteList(kind, entries) {
        if (!entries.length) return '<p class="sub">' + esc(kind === 'artist' ? T.tasteEmpty : T.nothing) + '</p>';
        const shown = entries.slice(0, 6);
        const max = shown[0].weight || 1;
        return (
            '<ol class="tl">' +
            shown.map((e, i) => {
                const cover = kind === 'artist' ? art(e.artwork ? bigArt(e.artwork) : '', 'art round') : '';
                const name = kind === 'artist' ? e.name : cap(e.label);
                const key = kind === 'artist' ? e.id : e.key;
                return (
                    '<li class="taste' + (cover ? '' : ' noart') + '"><span class="rk num">' + (i + 1) + '</span>' + cover +
                    '<span class="nm"><span class="nm-top">' + (name ? '<b>' + esc(name) + '</b>' : '<b class="none sk" role="status" aria-label="' + esc(T.loading) + '"></b>') + '</span><span class="bar"><i style="width:' + ((e.weight / max) * 100).toFixed(1) + '%"></i></span></span>' +
                    '<button class="drop" data-drop="' + kind + '" data-key="' + esc(key) + '">' + esc(T.drop) + '</button></li>'
                );
            }).join('') +
            '</ol>'
        );
    }
    function tasteBlock() {
        const t = state.taste;
        if (!t) return '';
        const removed = [
            ...t.removed.artists.map((a) => ['artist', a.id, a.name]),
            ...t.removed.tags.map((g) => ['tag', g.key, cap(g.label)]),
        ];
        const restoreLine = removed.length
            ? '<div class="removed"><span class="sub">' + esc(T.removed) + '</span>' +
              removed.map(([kind, key, name]) => '<button class="chip" data-restore="' + kind + '" data-key="' + esc(key) + '" data-tip="' + esc(T.restore) + '">' + esc(name) + ICON.undo + '</button>').join('') +
              '</div>'
            : '';
        return (
            '<div class="grid2 sec"><div><div class="sec-h"><h2>' + esc(T.tasteArtists) + '</h2></div>' + tasteList('artist', t.artists) + '</div>' +
            '<div><div class="sec-h"><h2>' + esc(T.tasteTags) + '</h2></div>' + tasteList('tag', t.tags) + '</div></div>' +
            restoreLine
        );
    }

    // Как попадает волна: доли считаются от треков волны, которые человек оценил сам (дослушал или переключил)
    const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
    function waveFigures(q) {
        const w = q.wave;
        const compare = (key) => {
            const parts = [];
            if (q.own.plays) parts.push(T.waveOwn(pct(q.own[key], q.own.plays)));
            if (q.previous && q.previous.plays) parts.push(T.wavePrev(pct(q.previous[key], q.previous.plays), state.period));
            return parts.join(', ');
        };
        const figs = [
            { value: pct(w.early, w.plays) + '%', label: T.waveEarly, note: compare('early'), tip: T.waveShareTip(w.early, w.plays) },
            { value: pct(w.done, w.plays) + '%', label: T.waveDone, note: compare('done'), tip: T.waveShareTip(w.done, w.plays) },
            { value: w.likes, label: plural(w.likes, T.likes), note: w.more ? T.waveMore(w.more) : '' },
            { value: w.against, label: plural(w.against, T.refusals), tip: T.waveAgainstTip },
            { value: q.newArtists, label: plural(q.newArtists, T.fresh), tip: T.waveNewTip, note: q.repeats ? T.waveRepeats(q.repeats) : '', noteTip: T.waveRepeatsTip },
        ];
        return (
            '<div class="figs wq-figs">' +
            figs.map((f) =>
                '<div class="fig"' + (f.tip ? ' tabindex="0" data-tip="' + esc(f.tip) + '"' : '') + '><b class="num">' + esc(f.value) + '</b><span>' + esc(f.label) + '</span>' +
                (f.note ? '<em' + (f.noteTip ? ' data-tip="' + esc(f.noteTip) + '"' : '') + '>' + esc(f.note) + '</em>' : '') + '</div>',
            ).join('') +
            '</div>'
        );
    }
    // Сутки периода до месяца; день без волны пустое место, день без ранних пропусков черта у оси
    function waveDays(q) {
        const days = q.days;
        if (days.filter((d) => d.plays).length < 2) return '';
        const cols = 'grid-template-columns:repeat(' + days.length + ',minmax(0,1fr))';
        const lines = [0, 25, 50, 75, 100].map((v) => '<div style="bottom:' + v + '%"><span class="num">' + v + '%</span></div>').join('');
        const last = days.length - 1;
        const every = days.length > 7 ? 7 : 1;
        const bars = days.map((d) => {
            const share = pct(d.early, d.plays);
            const day = cap(fmtWd.format(d.from));
            const tipText = d.plays ? T.waveDay(day, share, d.early, d.plays) : T.waveDayIdle(day);
            const height = d.plays ? Math.max(2, share) : 0;
            return '<div class="cc-slot' + (d.plays && d.plays < 5 ? ' low' : '') + '" tabindex="0" data-tip="' + esc(tipText) + '" aria-label="' + esc(tipText) + '"><i style="height:' + height + '%"></i></div>';
        }).join('');
        const labels = days.map((d, i) => '<span>' + ((last - i) % every === 0 ? esc(d.from === today() ? T.todayLower : fmtShort.format(d.from)) : '') + '</span>').join('');
        return (
            '<div class="wq-part"><h3>' + esc(T.waveDays) + '</h3>' +
            '<div class="cc" role="group" aria-label="' + esc(T.waveDaysLabel) + '"><div class="cc-plot"><div class="cc-grid">' + lines + '</div><div class="cc-bars" style="' + cols + '">' + bars + '</div></div>' +
            '<div class="cc-x" style="' + cols + '">' + labels + '</div></div></div>'
        );
    }
    // Недели идут от конца периода; пустая неделя остаётся пустым местом, чтобы шаг оси не врал
    function waveWeeks(q) {
        const count = Math.min(12, Math.ceil((q.to - q.from) / WEEK));
        if (count < 3) return '';
        const byFrom = new Map(q.weeks.map((w) => [w.from, w]));
        const weeks = [];
        for (let i = count - 1; i >= 0; i--) {
            const from = q.to - (i + 1) * WEEK;
            weeks.push(byFrom.get(from) || { from, plays: 0, early: 0 });
        }
        if (weeks.filter((w) => w.plays).length < 2) return '';
        const cols = 'grid-template-columns:repeat(' + weeks.length + ',minmax(0,1fr))';
        const lines = [0, 25, 50, 75, 100].map((v) => '<div style="bottom:' + v + '%"><span class="num">' + v + '%</span></div>').join('');
        const last = weeks.length - 1;
        const every = weeks.length > 6 ? 2 : 1;
        const label = (w) => fmtShort.format(Math.max(w.from, q.from));
        const bars = weeks.map((w) => {
            const share = pct(w.early, w.plays);
            const tipText = w.plays ? T.waveWeek(label(w), share, w.early, w.plays) : T.waveWeekIdle(label(w));
            const height = w.plays ? Math.max(2, share) : 0;
            return '<div class="cc-slot' + (w.plays && w.plays < 5 ? ' low' : '') + '" tabindex="0" data-tip="' + esc(tipText) + '" aria-label="' + esc(tipText) + '"><i style="height:' + height + '%"></i></div>';
        }).join('');
        const labels = weeks.map((w, i) => '<span>' + ((last - i) % every === 0 ? esc(label(w)) : '') + '</span>').join('');
        return (
            '<div class="wq-part"><h3>' + esc(T.waveWeeks) + '</h3>' +
            '<div class="cc" role="group" aria-label="' + esc(T.waveWeeksLabel) + '"><div class="cc-plot"><div class="cc-grid">' + lines + '</div><div class="cc-bars" style="' + cols + '">' + bars + '</div></div>' +
            '<div class="cc-x" style="' + cols + '">' + labels + '</div></div></div>'
        );
    }
    // Разрез таблицей: полоса это доля ранних пропусков; строки меньше чем из 5 треков приглушены
    function waveTable(head, slices, name) {
        const rows = slices.filter((s) => s.plays);
        if (!rows.length) return '';
        const c = T.waveCols;
        return (
            '<table class="wt"><thead><tr><th scope="col">' + esc(head) + '</th><th scope="col">' + esc(c.tracks) + '</th><th scope="col">' + esc(c.early) + '</th>' +
            '<th scope="col">' + esc(c.done) + '</th><th scope="col">' + esc(c.likes) + '</th></tr></thead><tbody>' +
            rows.map((s) => {
                const early = pct(s.early, s.plays);
                return (
                    '<tr' + (s.plays < 5 ? ' class="low"' : '') + '><th scope="row">' + esc(name(s.key)) + '</th><td class="num">' + s.plays + '</td>' +
                    '<td><span class="wt-share"><span class="bar"><i style="width:' + early + '%"></i></span><span class="num">' + early + '%</span></span></td>' +
                    '<td class="num">' + pct(s.done, s.plays) + '%</td><td class="num">' + s.likes + '</td></tr>'
                );
            }).join('') +
            '</tbody></table>'
        );
    }
    function waveBlock() {
        const q = state.wave;
        const open = state.waveOpen;
        const count = open && q && q.wave.plays ? '<span class="sub num">' + esc(T.waveCount(q.wave.plays, state.period)) + '</span>' : '';
        const head =
            '<div class="sec-h"><h2><button class="fold" data-act="wave" aria-expanded="' + open + '" aria-controls="wave-quality">' + esc(T.waveTitle) + ICON.fold + '</button></h2>' + count + '</div>';
        if (!open) return '<div class="sec wq">' + head + '</div>';
        let body;
        if (state.waveFailed) body = '<p class="sub">' + esc(T.waveFailed) + '</p><button class="link" data-act="wave-retry">' + esc(T.retry) + '</button>';
        else if (!q) body = '<p class="sub">' + esc(T.waveLoading) + '</p>';
        else if (!q.wave.plays) body = '<p class="sub">' + esc(T.waveNone) + '</p>';
        else {
            // Места сравнивают первые три трека выдачи с остальными: одна строка без пары ничего не говорит
            const slots = q.slots.first.plays && q.slots.later.plays ? [{ key: 'first', ...q.slots.first }, { key: 'later', ...q.slots.later }] : [];
            // Период до месяца по дням, длиннее по неделям
            body =
                waveFigures(q) + (q.days.length ? waveDays(q) : waveWeeks(q)) +
                '<div class="grid2 wq-part"><div>' + waveTable(T.waveSource, q.sources, (key) => T.sources[key] || key) +
                waveTable(T.waveSlot, slots, (key) => T.slots[key]) +
                (q.presets ? waveTable(T.wavePreset, q.presets, (key) => T.presets[key] || key) : '') + '</div>' +
                '<div>' + waveTable(T.waveReason, q.reasons, (key) => T.reasons[key] || key) +
                // Откуда взят трек до подмены причиной по вкусу: «Любимый артист» и «Любимый тег» ставятся лучшим по оценке
                (q.origins && q.origins.some((s) => s.key && s.plays) ? waveTable(T.waveOrigin, q.origins, (key) => T.reasons[key] || key) : '') + '</div></div>';
        }
        return '<div class="sec wq">' + head + '<div id="wave-quality">' + body + '</div></div>';
    }

    function journal() {
        const data = state.day;
        const rows = data ? data.rows : [];
        const total = rows.reduce((sum, r) => sum + r.heard, 0);
        // Прослушивания считаются как в обзоре периода: с 30 секунд звука
        const counted = rows.filter((r) => r.heard >= COUNTED_MS).length;
        const playing = playingKey(rows);
        const before = data && data.before !== null ? dayStart(data.before) : '';
        const after = data && data.after !== null ? dayStart(data.after) : '';
        return (
            '<div class="sec" id="journal"><div class="jn"><h2>' + esc(dayTitle(state.selected)) + '</h2><span class="sub num">' +
            esc(rows.length ? span(total) + ', ' + counted + ' ' + plural(counted, T.counted) : T.silence) + '</span>' +
            '<button class="icon-btn" data-day="' + before + '"' + (before === '' ? ' disabled' : '') + ' aria-label="' + esc(T.prevDay) + '" data-tip="' + esc(T.prevDay) + '">' + ICON.prev + '</button>' +
            '<button class="icon-btn" data-day="' + after + '"' + (after === '' ? ' disabled' : '') + ' aria-label="' + esc(T.nextDay) + '" data-tip="' + esc(T.nextDay) + '">' + ICON.next + '</button></div>' +
            '<div class="jn-list">' + (rows.length ? rows.map((r) => row(r, false, keyOf(r) === playing)).join('') : '<p class="empty">' + esc(T.dayEmpty) + '</p>') + '</div></div>'
        );
    }

    function renderOverview() {
        const s = state.overview;
        if (!s.total) return '<p class="empty wide">' + esc(T.emptyAll) + '</p>';
        const minutes = Math.round(s.heard / 60000);
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        const figs = [
            [s.counted, plural(s.counted, T.counted)],
            [s.artistCount, plural(s.artistCount, T.artists)],
        ];
        // Период начался не позже первой записи истории (всё время или месяц, когда история моложе месяца):
        // каждый артист тут появился впервые, «новых» столько же, сколько всех, и число ничего не говорит
        if (s.firstAt !== null && s.from > s.firstAt) figs.push([s.fresh, plural(s.fresh, T.fresh)]);
        // Серия дней подряд (2.11.0): только когда полосы волны не длиннее суток, иначе дни не различить
        const i = s.insights;
        if (i && i.streak >= 2 && s.wave.binHours <= 24) figs.push([i.streak, plural(i.streak, T.recapStreak)]);
        // Характер периода плашкой в цвет главного артиста
        const persona = i && s.counted >= 5
            ? '<div class="persona" tabindex="0" data-tip="' + esc(T.personaTip) + '" style="--pa:' + esc(i.palette.a) + ';--pb:' + esc(i.palette.b) + '">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="' + PERSONA_ICONS[i.archetype] + '"/></svg><b>' + esc(T.archetypes[i.archetype]) + '</b></div>'
            : '';
        const moreButton = s.artists.length > ARTISTS_SHORT ? '<button class="link" data-act="artists">' + esc(state.allArtists ? T.less : T.more) + '</button>' : '';
        return (
            '<div class="hero"><div><div class="big num">' + (h ? h + '<small>' + esc(T.h) + '</small>' : '') + m + '<small>' + esc(T.min) + '</small></div><div class="big-cap">' + esc(T.music(state.period)) + '</div></div>' +
            '<div class="figs">' + figs.map(([v, l]) => '<div class="fig"><b class="num">' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>' + persona + '</div>' +
            periodWave(s.wave) +
            '<div class="sec"><div class="sec-h"><h2>' + esc(T.artistsTitle(state.period)) + '</h2>' + moreButton + '</div>' + artistsBlock(s.artists) + '</div>' +
            '<div class="grid2 sec"><div><div class="sec-h"><h2>' + esc(T.tracks) + '</h2></div>' + topList('track', s.tracks, 8) + '</div>' +
            '<div><div class="sec-h"><h2>' + esc(T.genres) + '</h2></div>' + topList('genre', s.genres, 5) +
            '<div class="sec-h" style="margin-top:28px"><h2>' + esc(T.when) + '</h2></div>' + heatmap(s.heat) + '</div></div>' +
            tasteBlock() +
            waveBlock() +
            journal()
        );
    }

    function renderResults() {
        const list = state.results || [];
        if (!list.length) return '<p class="empty">' + esc(T.searchEmpty) + '</p>';
        const count = list.length + ' ' + plural(list.length, T.plays);
        const playing = playingKey(list);
        return (
            '<div class="sec"><div class="sec-h"><h2>' + esc(T.results) + '</h2><span class="sub num">' + esc(list.length >= 200 ? T.latest(200) : count) + '</span></div>' +
            '<div class="search-rows">' + list.map((r) => row(r, true, keyOf(r) === playing)).join('') + '</div></div>'
        );
    }

    function render(keepScroll) {
        const scroll = view.scrollTop;
        const active = document.activeElement;
        const focusKey = active?.tagName === 'BUTTON' ? ['period', 'day', 'act', 'artist'].find((key) => active.dataset[key]) : null;
        const focusValue = focusKey ? active.dataset[focusKey] : null;
        const focusSearch = active && active.id === 'q';
        const caret = focusSearch ? active.selectionStart : 0;
        let body;
        if (!state.signedIn) body = '<p class="empty wide">' + esc(T.signedOut) + '</p>';
        else if (state.failed) body = '<div class="empty wide"><p>' + esc(T.failed) + '</p><button class="link" data-act="retry" style="margin-top:12px">' + esc(T.retry) + '</button></div>';
        else if (!state.loaded) body = '';
        else if (state.query) body = renderResults();
        else body = renderOverview();
        const tools = state.signedIn && !state.query ? periodSeg() + (state.loaded && !state.failed ? recapButton() : '') : '';
        view.innerHTML = '<div class="wrap">' + head(tools) + body + '</div>';
        if (keepScroll) view.scrollTop = scroll;
        if (focusSearch) {
            const q = document.getElementById('q');
            q.focus();
            q.setSelectionRange(caret, caret);
        } else if (focusKey) {
            [...view.querySelectorAll('button')].find((button) => button.dataset[focusKey] === focusValue)?.focus({ preventScroll: true });
        }
    }

    // Загрузка
    const periodFrom = () => (state.period === 'all' ? null : addDays(today(), -(state.period - 1)));
    async function loadOverview() {
        state.overview = await api.invoke('history:overview', periodFrom(), addDays(today(), 1));
        if (!state.overview) throw new Error('Пустой ответ обзора');
    }
    // Замер волны не загрузился: остальная страница живёт без него
    async function loadWave() {
        try {
            const data = await api.invoke('history:wave', periodFrom(), addDays(today(), 1));
            if (!data) throw new Error('Пустой ответ замера волны');
            state.wave = data;
            state.waveFailed = false;
        } catch (error) {
            console.error('Замер волны не загружен:', error);
            state.wave = null;
            state.waveFailed = true;
        }
    }
    async function loadDay(start) {
        const data = await api.invoke('history:day', start, addDays(start, 1));
        if (!data) throw new Error('Пустой ответ журнала дня');
        state.selected = start;
        state.day = data;
    }
    // Вкус не загрузился: страница живёт без него
    async function loadTaste() {
        try {
            state.taste = await api.invoke('history:taste');
        } catch (error) {
            console.error('Вкус волны не загружен:', error);
            state.taste = null;
        }
    }
    let searchToken = 0;
    async function loadResults() {
        const token = ++searchToken;
        const rows = await api.invoke('history:search', state.query);
        if (token === searchToken) state.results = Array.isArray(rows) ? rows : [];
    }
    async function reload(first) {
        try {
            // Свёрнутый замер не грузится; прежний период при раскрытии не мелькает
            if (!state.waveOpen) state.wave = null;
            await Promise.all([loadOverview(), first ? loadTaste() : Promise.resolve(), state.waveOpen ? loadWave() : Promise.resolve()]);
            // Выбранный день вне нового периода: журнал идёт на сегодня, как при первом открытии
            const inside = !!state.selected && state.selected >= state.overview.from;
            await loadDay(inside ? state.selected : today());
            // Сегодня без музыки: журнал последнего дня, когда она была, но не раньше начала периода
            if ((first || !inside) && !state.day.rows.length && state.day.before !== null && state.day.before >= state.overview.from) await loadDay(dayStart(state.day.before));
            if (state.query) await loadResults();
            state.failed = false;
        } catch (error) {
            console.error('История не загружена:', error);
            state.failed = true;
        }
        state.loaded = true;
    }

    let playRequest = 0;
    async function play(path, id) {
        const request = ++playRequest;
        try {
            const result = await api.invoke('history:play', path);
            if (request !== playRequest) return;
            if (result === 'played') {
                // main пришлёт смену трека сам; отметка ставится сразу, чтобы не ждать его
                state.nowId = Number(id) || 0;
                render(true);
            } else if (result !== 'superseded') {
                showPlayError();
            }
        } catch (error) {
            console.error('Трек не включён:', error);
            if (request === playRequest) showPlayError();
        }
    }
    function showPlayError() {
        let message = document.getElementById('play-error');
        if (!message) {
            message = document.createElement('p');
            message.id = 'play-error';
            message.className = 'empty';
            message.setAttribute('role', 'alert');
            view.prepend(message);
        }
        message.textContent = state.lang === 'en' ? 'Could not play this track. Check your connection and try again.' : 'Не удалось включить трек. Проверь соединение и попробуй ещё раз.';
    }

    // Сводка недели (2.11.0): четыре карточки-истории 9:16 в духе итогов года — неделя, артист, трек, характер.
    // Каждая рисуется на своём холсте и уходит в main как PNG. Цвет карточки берётся с обложки или аватарки (sndcdn отдаёт
    // картинки с разрешением для чужих страниц, холст остаётся выгружаемым); без картинки — цвет по имени артиста из main
    const RECAP = { width: 540, height: 960, scale: 2, font: "Onest, 'Segoe UI', system-ui, sans-serif" };
    const RECAP_CARDS = ['week', 'artist', 'track', 'vibe'];
    // Восемь ручных цветов вместо цвета обложки, от тёмных к светлым; на трёх светлых текст тёмный
    const RECAP_PRESETS = [
        { a: '#23253f', b: '#0c0c14', panel: 'dark' },
        { a: '#4a2a96', b: '#140f2a', panel: 'dark' },
        { a: '#7a1f35', b: '#1c0a10', panel: 'dark' },
        { a: '#0f6170', b: '#0a1c26', panel: 'dark' },
        { a: '#ff5500', b: '#8a1d52', panel: 'dark' },
        { a: '#8fdcc3', b: '#2e8c86', panel: 'light' },
        { a: '#ffd2b0', b: '#ff7d5c', panel: 'light' },
        { a: '#f1f4f9', b: '#bccbe3', panel: 'light' },
    ];
    const PRESET_KEY = 'scDesktopRecapPreset';
    // -1 — цвет обложки (по умолчанию с 2.11.0), иначе номер ручного цвета
    function readPreset() {
        try {
            const raw = window.localStorage.getItem(PRESET_KEY);
            const value = Number(raw);
            return raw !== null && raw !== 'auto' && Number.isInteger(value) && value >= 0 && value < RECAP_PRESETS.length ? value : -1;
        } catch (error) {
            console.warn('Сводка недели: цвет карточки не прочитан', error);
            return -1;
        }
    }
    function savePreset(value) {
        try {
            window.localStorage.setItem(PRESET_KEY, value < 0 ? 'auto' : String(value));
        } catch (error) {
            console.warn('Сводка недели: цвет карточки не сохранён', error);
        }
    }
    // period: неделя, месяц или год; span: прошлый или нынешний, пусто — выберет main (recapPeriod);
    // fallback: открыто на периоде страницы, и если там пусто, итоги переходят на неделю
    const recap = {
        open: false, period: 'week', span: '', fallback: false, data: null, people: undefined, failed: false, busy: false, canvas: null, cards: [], selected: 0, model: null,
        request: 0, draw: 0, status: '', statusTimer: 0, preset: readPreset(),
    };
    const RECAP_KINDS = ['week', 'month', 'year'];
    // Меньше стольких дней с музыкой итоги не рисуются: месяц из двух дней — это не итоги. Неделе хватает одного
    const RECAP_MIN_DAYS = { week: 1, month: 3, year: 3 };
    const recapEnough = (s) => s.heard > 0 && (s.recap.period === 'week' || (s.insights ? s.insights.days : 0) >= RECAP_MIN_DAYS[s.recap.period]);
    const modal = document.createElement('div');
    modal.className = 'rc';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'rc-title');
    document.body.append(modal);
    const reducedMotion = () => document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Границы итогов считает main (recapPeriod в recap.ts), здесь только подписи
    const mondayOf = (at) => addDays(dayStart(at), -((new Date(at).getDay() + 6) % 7));
    // Кнопки «прошлый / нынешний»: неделя словами, месяц по имени, год числом
    function spanLabel(period, span) {
        const now = new Date();
        if (period === 'week') return T.recapWeeks[span];
        if (period === 'year') return String(now.getFullYear() - (span === 'last' ? 1 : 0));
        const month = new Date(now.getFullYear(), now.getMonth() - (span === 'last' ? 1 : 0), 1);
        return cap(T.monthNames[month.getMonth()]) + (month.getFullYear() !== now.getFullYear() ? ' ' + month.getFullYear() : '');
    }
    // Шапка карточки: неделя с номером, месяц или год; нынешний период — диапазоном до сегодняшнего дня
    function periodRange(r) {
        const range = r.from === r.last ? fmtDayMonth.format(r.from) + ' ' + new Date(r.from).getFullYear() : T.recapRange(r.from, r.last);
        if (r.period === 'week') return T.recapWeek(r.number, range);
        if (r.span === 'this') return range;
        return r.period === 'month' ? cap(T.monthNames[r.number - 1]) + ' ' + r.year : String(r.year);
    }
    // Как назвать период в «Твой ноябрь» и «Твой 2026»
    const periodName = (r) => (r.period === 'month' ? T.monthNames[new Date(r.from).getMonth()] : String(r.year));
    // Дней в календарном месяце периода: нынешний месяц рисуется целиком, будущие дни точками
    const monthDays = (r) => new Date(new Date(r.from).getFullYear(), new Date(r.from).getMonth() + 1, 0).getDate();

    const pictures = new Map();
    function picture(url) {
        if (!url) return Promise.resolve(null);
        if (!pictures.has(url)) {
            pictures.set(
                url,
                new Promise((resolve) => {
                    const img = new window.Image();
                    const timer = window.setTimeout(() => resolve(null), 10000);
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        window.clearTimeout(timer);
                        resolve(img);
                    };
                    img.onerror = () => {
                        window.clearTimeout(timer);
                        console.warn('Сводка недели: картинка не загрузилась', url);
                        resolve(null);
                    };
                    img.src = url;
                }),
            );
        }
        return pictures.get(url);
    }
    // Картинки журнала маленькие (-large это 100 на 100): для карточки берётся крупный размер того же файла
    const sized = (url, size) => (url ? url.replace(/-(large|t\d+x\d+)\.(jpg|png)$/, '-' + size + '.$2') : '');
    let fontsReady = null;
    const recapFonts = () =>
        fontsReady ||
        (fontsReady = Promise.all([400, 500, 600, 700, 800].map((weight) => document.fonts.load(weight + ' 20px Onest', 'Аa'))).catch((error) =>
            console.warn('Сводка недели: шрифт не загрузился, рисую системным', error),
        ));

    // ===== Цвет карточки =====
    function hslHex(h, s, l) {
        const hue = (((h % 360) + 360) % 360) / 360;
        const sat = Math.max(0, Math.min(1, s));
        const light = Math.max(0, Math.min(1, l));
        const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
        const p = 2 * light - q;
        const channel = (t) => {
            const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
            const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
            return Math.round(v * 255).toString(16).padStart(2, '0');
        };
        return '#' + channel(hue + 1 / 3) + channel(hue) + channel(hue - 1 / 3);
    }
    // Три цвета от тона: яркое пятно, сосед по кругу, глубокий фон. Та же формула, что recapPalette в recap.ts
    function paletteOf(hue, saturation) {
        const s = Math.max(0.35, Math.min(0.9, saturation));
        return { a: hslHex(hue, s, 0.56), b: hslHex(hue + 38, s * 0.92, 0.38), c: hslHex(hue - 24, s * 0.8, 0.11) };
    }
    const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
    const rgba = (hex, alpha) => 'rgba(' + rgbOf(hex).join(', ') + ', ' + alpha + ')';
    // Тон и сочность цвета: из них палитра соседней карточки
    function toneOfHex(hex) {
        const [r, g, b] = rgbOf(hex).map((v) => v / 255);
        const max = Math.max(r, g, b);
        const chroma = max - Math.min(r, g, b);
        if (!chroma) return { hue: 0, sat: 0.4 };
        const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
        const l = (max + Math.min(r, g, b)) / 2;
        return { hue: (h * 60 + 360) % 360, sat: chroma / (1 - Math.abs(2 * l - 1) || 1) };
    }
    // Главный тон картинки: гистограмма тонов по 30°, голос пикселя — квадрат его сочности, так серые и почти чёрные
    // почти не голосуют. Почти серая обложка — null, тогда цвет по имени
    function toneOf(img) {
        if (!img) return null;
        try {
            const size = 32;
            const probe = document.createElement('canvas');
            probe.width = probe.height = size;
            const x = probe.getContext('2d', { willReadFrequently: true });
            x.drawImage(img, 0, 0, size, size);
            const px = x.getImageData(0, 0, size, size).data;
            const bins = Array.from({ length: 12 }, () => ({ w: 0, sx: 0, sy: 0, s: 0 }));
            let total = 0;
            for (let i = 0; i < px.length; i += 4) {
                const r = px[i] / 255;
                const g = px[i + 1] / 255;
                const b = px[i + 2] / 255;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const chroma = max - min;
                if (chroma < 0.08) continue;
                const h = ((max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) * 60 + 360) % 360;
                const l = (max + min) / 2;
                const w = chroma * chroma;
                const bin = bins[Math.floor(h / 30) % 12];
                bin.w += w;
                bin.sx += Math.cos((h * Math.PI) / 180) * w;
                bin.sy += Math.sin((h * Math.PI) / 180) * w;
                bin.s += (chroma / (1 - Math.abs(2 * l - 1) || 1)) * w;
                total += w;
            }
            const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
            if (total < size * size * 0.004 || best.w <= 0) return null;
            return { hue: ((Math.atan2(best.sy, best.sx) * 180) / Math.PI + 360) % 360, sat: best.s / best.w };
        } catch (error) {
            console.warn('Сводка недели: цвет картинки не прочитан', error);
            return null;
        }
    }
    function presetPalette(preset) {
        return preset.panel === 'light' ? { a: preset.b, b: preset.a, c: preset.a, light: true } : { a: preset.a, b: preset.a, c: preset.b };
    }
    const paletteFor = (kind, m) => (recap.preset >= 0 ? presetPalette(RECAP_PRESETS[recap.preset]) : m.palettes[kind]);

    // Характер и подписи к нему: то же для страницы и для карточки
    function personaFacts(s) {
        const i = s.insights;
        return {
            topArtist: s.artists[0] ? s.artists[0].name || T.loading : '',
            topTrack: s.tracks[0] ? s.tracks[0].name || T.loading : '',
            topPlays: s.tracks[0] ? s.tracks[0].plays : 0,
            fresh: s.fresh,
            perDay: span(s.heard / Math.max(1, i ? i.days : 1)),
            genreCount: s.genres.length,
        };
    }

    // Период карточек: подписи, дни и месяцы для графика, лучший день месяца или месяц года
    function periodFacts(r, insights) {
        const daily = insights.daily || [];
        const months = insights.months || [];
        let best = '';
        const values = r.period === 'year' ? months : r.period === 'month' ? daily : [];
        const top = values.length ? Math.max(...values) : 0;
        if (top > 0) {
            const at = values.indexOf(top);
            const label = r.period === 'year' ? T.monthNames[(new Date(r.from).getMonth() + at) % 12] : fmtDayMonth.format(addDays(r.from, at));
            best = (r.period === 'year' ? T.recapBestMonth : T.recapBestDay)(label, span(top * 60000));
        }
        return {
            period: r.period,
            span: r.span,
            year: r.year,
            number: r.number,
            spanDays: r.days,
            monthDays: monthDays(r),
            range: periodRange(r),
            kicker: T.recapKicker(r.period, r.span, periodName(r)),
            daily,
            months,
            best,
        };
    }

    // Всё, что нарисовано: смена цвета перерисовывает без новых запросов
    async function recapModel(s, people) {
        const r = s.recap;
        const tracks = s.tracks.slice(0, 5);
        const artists = s.artists.slice(0, 5);
        const me = people && people.me;
        const avatars = (people && people.avatars) || {};
        const [avatar, covers, faces] = await Promise.all([
            picture(me ? sized(me.avatar, 't300x300') : ''),
            Promise.all(tracks.map((t, i) => picture(sized(t.artwork, i ? 't120x120' : 't500x500')))),
            Promise.all(artists.map((a, i) => picture(sized(avatars[artistPath(a.path)] || a.artwork, i ? 't120x120' : 't500x500')))),
        ]);
        // main считает личное по обзору; нет его (старый main) — спокойный характер и цвет полуночи
        const insights = s.insights || { archetype: 'steady', days: 0, streak: 0, peakHour: -1, topShare: 0, nightShare: 0, morningShare: 0, trackShare: 0, freshShare: -1, palette: paletteOf(240, 0.4), daily: [], months: [] };
        const named = insights.palette;
        const tone = (img) => {
            const found = toneOf(img);
            return found ? paletteOf(found.hue, found.sat) : null;
        };
        const trackTone = tone(covers[0]);
        const artistTone = tone(faces[0]);
        const base = toneOf(covers[0]) || toneOf(faces[0]) || toneOfHex(named.a);
        const named2 = toneOfHex(named.a);
        const hours = Array.from({ length: 24 }, (_, hour) => {
            let minutes = 0;
            for (let day = 0; day < 7; day++) minutes += s.heat[day * 24 + hour] || 0;
            return minutes;
        });
        const days = Array.from({ length: 7 }, (_, day) => s.heat.slice(day * 24, day * 24 + 24).reduce((sum, minutes) => sum + minutes, 0));
        const busiest = Math.max(...days);
        return {
            ...periodFacts(r, insights),
            name: me ? me.username : '',
            link: me && me.permalink ? 'soundcloud.com/' + me.permalink : '',
            avatar,
            heard: s.heard,
            counted: s.counted,
            artistCount: s.artistCount,
            insights,
            ...personaFacts(s),
            tracks: tracks.map((t, i) => ({ title: t.name || T.loading, artist: t.artistName, plays: t.plays, cover: covers[i] })),
            artists: artists.map((a, i) => ({ name: a.name || T.loading, time: span(a.ms), share: pct(a.ms, s.heard), face: faces[i] })),
            genres: s.genres.slice(0, 3).map((g) => ({ name: cap(g.name), share: pct(g.plays, s.counted) })),
            hours,
            // Самый музыкальный день недели: теплокарта идёт с понедельника, месяц и год начинаются с любого дня
            peakDay: busiest > 0 ? fmtWeekday.format(addDays(mondayOf(Date.now()), days.indexOf(busiest))) : '',
            // Неделя и артист — цвет лица недели, трек — его обложка, характер — дополнительный тон к обложке
            palettes: {
                week: artistTone || trackTone || named,
                artist: artistTone || named,
                track: trackTone || paletteOf(named2.hue + 50, named2.sat),
                vibe: paletteOf(base.hue + 150, Math.max(0.55, base.sat)),
            },
        };
    }

    // ===== Рисование карточек =====
    // Иконки характера в сетке 24×24
    const PERSONA_ICONS = {
        starter: 'M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z',
        nightOwl: 'M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z',
        loyal: 'M12 21s-7.6-4.6-9.3-9.4C1.5 8.3 3.6 4.7 7.2 4.7c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.7 3.6 4.5 6.9C19.6 16.4 12 21 12 21z',
        repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
        explorer: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm4.2 3.8-2.6 5.8-5.8 2.6 2.6-5.8z',
        earlyBird: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
        marathon: 'M13 2 4 14h6l-1 8 9-12h-6z',
        eclectic: 'M10.6 9.2 5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4-1.4 1.4 3.1 3.1-2 2.1H20v-5.5l-2 2z',
        steady: 'M2 13.5c2.3-6 4.7-6 7 0s4.7 6 7 0 4-5 6-2.5l-1.5 1.2c-1-1.2-2-.6-3 1.8-2.9 7.6-7 7.6-9.9 0-1.6-4.2-2.7-4.2-4.2 0z',
    };
    let grain = null;
    // Зерно плёнки: один шум на все карточки, по пикселю холста
    function grainPattern(ctx) {
        if (!grain) {
            grain = document.createElement('canvas');
            grain.width = grain.height = 180;
            const g = grain.getContext('2d');
            const noise = g.createImageData(180, 180);
            for (let i = 0; i < noise.data.length; i += 4) {
                const v = Math.random() * 255;
                noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
                noise.data[i + 3] = 255;
            }
            g.putImageData(noise, 0, 0);
        }
        const pattern = ctx.createPattern(grain, 'repeat');
        pattern.setTransform(new window.DOMMatrix().scale(1 / RECAP.scale));
        return pattern;
    }
    // Пятна сетки по карточкам: у каждой своё расположение, чтобы четыре истории подряд не были одинаковыми
    const MESH = {
        week: [['a', 0.1, 0.12, 0.95, 0.95], ['b', 1, 0.5, 0.8, 0.85], ['a', 0.2, 1.02, 0.75, 0.55]],
        artist: [['a', 0.5, 0.32, 0.85, 0.9], ['b', 0, 0.85, 0.8, 0.7], ['b', 1, 0.05, 0.6, 0.6]],
        track: [['b', 0.9, 0.15, 0.85, 0.85], ['a', 0.05, 0.45, 0.8, 0.8], ['a', 0.85, 1, 0.7, 0.55]],
        vibe: [['a', 0.5, 0.3, 0.7, 0.95], ['b', 0.05, 0.05, 0.7, 0.75], ['b', 0.95, 0.95, 0.85, 0.8]],
    };

    function painter(ctx, pal) {
        const W = RECAP.width;
        const ink = pal.light
            ? { ink: '#121212', soft: 'rgba(18, 18, 18, 0.66)', glass: 'rgba(255, 255, 255, 0.38)', edge: 'rgba(0, 0, 0, 0.1)', faint: 'rgba(18, 18, 18, 0.3)' }
            : { ink: '#ffffff', soft: 'rgba(255, 255, 255, 0.72)', glass: 'rgba(255, 255, 255, 0.1)', edge: 'rgba(255, 255, 255, 0.16)', faint: 'rgba(255, 255, 255, 0.34)' };
        const font = (size, weight) => {
            ctx.font = weight + ' ' + size + 'px ' + RECAP.font;
        };
        const fit = (value, room) => {
            value = String(value);
            if (ctx.measureText(value).width <= room) return value;
            let cut = value;
            while (cut && ctx.measureText(cut + '…').width > room) cut = cut.slice(0, -1);
            return cut.trimEnd() + '…';
        };
        const wrap = (value, room, lines) => {
            const words = String(value).split(/\s+/).filter(Boolean);
            const out = [];
            let line = '';
            for (const word of words) {
                const next = line ? line + ' ' + word : word;
                if (!line || ctx.measureText(next).width <= room) line = next;
                else {
                    out.push(line);
                    line = word;
                }
            }
            if (line) out.push(line);
            if (out.length > lines) {
                const kept = out.slice(0, lines);
                kept[lines - 1] = fit(out.slice(lines - 1).join(' '), room);
                return kept;
            }
            return out.map((part) => fit(part, room));
        };
        // Крупный заголовок: кегль уменьшается, пока текст не встанет в lines строк без многоточия
        const headline = (value, room, lines, size, min, weight) => {
            let current = size;
            for (; current > min; current -= 2) {
                font(current, weight);
                const words = String(value).split(/\s+/).filter(Boolean);
                let count = 1;
                let line = '';
                let fits = true;
                for (const word of words) {
                    if (ctx.measureText(word).width > room) fits = false;
                    const next = line ? line + ' ' + word : word;
                    if (!line || ctx.measureText(next).width <= room) line = next;
                    else {
                        count++;
                        line = word;
                    }
                }
                if (fits && count <= lines) break;
            }
            font(current, weight);
            return { size: current, lines: wrap(value, room, lines) };
        };
        const text = (value, x, y, color, align) => {
            ctx.fillStyle = color;
            ctx.textAlign = align || 'left';
            ctx.fillText(value, x, y);
        };
        const cover = (img, x, y, w, h) => {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, x, y, w, h);
        };
        const roundRect = (x, y, w, h, r) => {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        };
        // Стеклянная плашка: светлая плёнка и тонкая кромка
        const glass = (x, y, w, h, r) => {
            roundRect(x, y, w, h, r);
            ctx.fillStyle = ink.glass;
            ctx.fill();
            ctx.strokeStyle = ink.edge;
            ctx.lineWidth = 1;
            ctx.stroke();
        };
        const pill = (value, cx, y, size, weight) => {
            font(size, weight);
            const w = ctx.measureText(value).width + size * 1.6;
            const h = size * 2;
            glass(cx - w / 2, y, w, h, h / 2);
            ctx.textBaseline = 'middle';
            text(value, cx, y + h / 2 + 1, ink.ink, 'center');
            ctx.textBaseline = 'alphabetic';
            return w;
        };
        const circle = (img, cx, cy, r, initial) => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.clip();
            if (img) cover(img, cx - r, cy - r, r * 2, r * 2);
            else {
                const fill = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
                fill.addColorStop(0, pal.a);
                fill.addColorStop(1, pal.b);
                ctx.fillStyle = fill;
                ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
                if (initial) {
                    font(Math.round(r * 0.9), 800);
                    ctx.textBaseline = 'middle';
                    text(initial.charAt(0).toUpperCase(), cx, cy + r * 0.04, '#ffffff', 'center');
                    ctx.textBaseline = 'alphabetic';
                }
            }
            ctx.restore();
        };
        return { W, pal, ink, font, fit, wrap, headline, text, cover, roundRect, glass, pill, circle };
    }

    function backdrop(ctx, kind, pal) {
        const W = RECAP.width;
        const H = RECAP.height;
        ctx.fillStyle = pal.c;
        ctx.fillRect(0, 0, W, H);
        for (const [key, x, y, r, alpha] of MESH[kind]) {
            const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W);
            g.addColorStop(0, rgba(pal[key], alpha));
            g.addColorStop(0.55, rgba(pal[key], alpha * 0.35));
            g.addColorStop(1, rgba(pal[key], 0));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
        // Тень сверху и снизу: подписи читаются на любой обложке
        const shade = ctx.createLinearGradient(0, 0, 0, H);
        const tint = pal.light ? '255, 255, 255' : '0, 0, 0';
        shade.addColorStop(0, 'rgba(' + tint + ', 0.22)');
        shade.addColorStop(0.3, 'rgba(' + tint + ', 0)');
        shade.addColorStop(0.62, 'rgba(' + tint + ', 0.05)');
        shade.addColorStop(1, 'rgba(' + tint + ', 0.55)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = grainPattern(ctx);
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    // Шапка и подвал у всех карточек: неделя, знак и кто слушал
    function chrome(ctx, p, m) {
        const { W, ink } = p;
        ctx.textBaseline = 'alphabetic';
        p.font(11, 700);
        ctx.letterSpacing = '1.6px';
        p.text(p.fit(m.range.toUpperCase(), W - 200), 36, 52, ink.soft);
        p.text('SOUNDCLOUD', W - 36, 52, ink.soft, 'right');
        ctx.letterSpacing = '0px';
        if (!m.name) return;
        p.circle(m.avatar, 36 + 17, 906, 17, m.name);
        p.font(15, 700);
        p.text(p.fit(m.name, W - 140), 80, m.link ? 902 : 911, ink.ink);
        if (m.link) {
            p.font(12, 500);
            p.text(p.fit(m.link, W - 140), 80, 920, ink.soft);
        }
    }
    const kicker = (ctx, p, value, y, align) => {
        p.font(24, 600);
        p.text(value, align === 'center' ? p.W / 2 : 36, y, p.ink.soft, align);
    };

    // График периода под плашкой характера: месяц по дням, год по месяцам; ещё не наступившие — точкой
    function periodChart(ctx, p, m, top) {
        const { W, ink } = p;
        const year = m.period === 'year';
        const values = year ? m.months : m.daily;
        if (m.period === 'week' || !values.length) return;
        const total = year ? 12 : m.monthDays;
        const peak = Math.max(...values);
        const max = Math.max(1, peak);
        const room = W - 72;
        const step = room / total;
        const gap = year ? 10 : Math.max(2, step * 0.3);
        const chartH = 60;
        if (m.best) {
            p.font(17, 700);
            p.text(p.fit(m.best, room), 36, top, ink.ink);
        }
        const base = top + 16 + chartH;
        for (let n = 0; n < total; n++) {
            const value = values[n];
            const x = 36 + n * step + gap / 2;
            const w = step - gap;
            if (value === undefined) {
                ctx.beginPath();
                ctx.arc(x + w / 2, base - 2, Math.min(2.5, w / 2), 0, Math.PI * 2);
                ctx.fillStyle = ink.edge;
                ctx.fill();
                continue;
            }
            const h = value ? Math.max(4, (value / max) * chartH) : 2;
            p.roundRect(x, base - h, w, h, Math.min(year ? 6 : 3, w / 2));
            ctx.fillStyle = value && value === peak ? ink.ink : ink.faint;
            ctx.fill();
        }
        p.font(12, 500);
        if (year) T.monthLetters.forEach((letter, n) => p.text(letter, 36 + n * step + step / 2, base + 18, ink.soft, 'center'));
        else [1, 10, 20, total].forEach((day) => p.text(String(day), 36 + (day - 1) * step + step / 2, base + 18, ink.soft, 'center'));
    }

    function paintWeek(ctx, p, m) {
        const { W, ink } = p;
        kicker(ctx, p, m.kicker, 170);
        // Огромное число часов, рядом единица; меньше часа — минуты
        const minutes = Math.round(m.heard / 60000);
        const h = Math.floor(minutes / 60);
        const big = String(h || minutes);
        const unit = h ? T.h : T.min;
        const sub = h && minutes % 60 ? minutes % 60 + ' ' + T.min + ' ' + T.recapMusic : T.recapMusic;
        // У месяца и года под характером график: число чуть скромнее, чтобы всё встало над плитками
        let size = m.period === 'week' ? 250 : 200;
        p.font(size, 800);
        ctx.letterSpacing = '-12px';
        while (size > 120 && ctx.measureText(big).width > W - 170) {
            size -= 10;
            p.font(size, 800);
        }
        const width = ctx.measureText(big).width;
        p.text(big, 30, 200 + size * 0.78, ink.ink);
        ctx.letterSpacing = '0px';
        p.font(64, 700);
        p.text(unit, 30 + width + 14, 200 + size * 0.78, ink.ink);
        const base = 200 + size * 0.78;
        p.font(30, 700);
        p.text(p.fit(sub, W - 72), 36, base + 52, ink.ink);
        p.font(20, 500);
        p.text(T.recapPerDay(m.perDay), 36, base + 86, ink.soft);
        // Характер одной плашкой: затравка последней карточки
        p.font(18, 700);
        const persona = T.archetypes[m.insights.archetype];
        const pw = ctx.measureText(persona).width + 62;
        p.glass(36, base + 116, pw, 40, 20);
        ctx.save();
        ctx.translate(50, base + 125);
        ctx.scale(22 / 24, 22 / 24);
        ctx.fillStyle = ink.ink;
        ctx.fill(new window.Path2D(PERSONA_ICONS[m.insights.archetype]), 'evenodd');
        ctx.restore();
        ctx.textBaseline = 'middle';
        p.text(persona, 82, base + 137, ink.ink);
        ctx.textBaseline = 'alphabetic';
        periodChart(ctx, p, m, base + 196);
        // Три плитки: прослушивания, артисты, серия дней
        const i = m.insights;
        const tiles = [
            [m.counted, plural(m.counted, T.counted)],
            [m.artistCount, plural(m.artistCount, T.artists)],
            i.streak >= 2 ? [i.streak, plural(i.streak, T.recapStreak)] : [i.days, plural(i.days, T.recapDaysWith)],
        ];
        const gap = 12;
        const tw = (W - 72 - gap * 2) / 3;
        tiles.forEach(([value, label], n) => {
            const x = 36 + n * (tw + gap);
            p.glass(x, 690, tw, 150, 22);
            // За год прослушиваний бывают тысячи: число мельчит кегль, а не режется
            ctx.letterSpacing = '-1.5px';
            let digits = 48;
            p.font(digits, 800);
            while (digits > 26 && ctx.measureText(String(value)).width > tw - 32) p.font((digits -= 2), 800);
            p.text(p.fit(String(value), tw - 32), x + 16, 752, ink.ink);
            ctx.letterSpacing = '0px';
            // Длинное слово подписи («прослушиваний») мельчит кегль, а не режется многоточием
            const fitted = p.headline(label, tw - 32, 2, 15, 11, 500);
            fitted.lines.forEach((line, k) => p.text(line, x + 16, 788 + k * (fitted.size + 4), ink.soft));
        });
    }

    // Строки «кто следом»: место, картинка, имя, цифра справа
    function runners(ctx, p, list, y, round) {
        const { W, ink } = p;
        list.forEach((item, n) => {
            const top = y + n * 52;
            if (n) {
                ctx.fillStyle = ink.edge;
                ctx.fillRect(36, top, W - 72, 1);
            }
            ctx.textBaseline = 'middle';
            p.font(16, 700);
            p.text(String(n + 2), 36, top + 26, ink.faint);
            if (round) p.circle(item.img, 78, top + 26, 18, item.name);
            else {
                ctx.save();
                p.roundRect(60, top + 8, 36, 36, 6);
                ctx.clip();
                if (item.img) p.cover(item.img, 60, top + 8, 36, 36);
                else {
                    ctx.fillStyle = ink.glass;
                    ctx.fillRect(60, top + 8, 36, 36);
                }
                ctx.restore();
            }
            p.font(15, 500);
            const right = item.value;
            const rw = ctx.measureText(right).width;
            p.text(right, W - 36, top + 26, ink.soft, 'right');
            p.font(17, 600);
            p.text(p.fit(item.name, W - 36 - 112 - rw - 16), 112, top + 26, ink.ink);
            ctx.textBaseline = 'alphabetic';
        });
    }

    function paintArtist(ctx, p, m) {
        const { W, ink } = p;
        const top = m.artists[0];
        kicker(ctx, p, T.recapTopArtist[m.period], 128, 'center');
        // Фото в кольце на мягкой тени
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 60;
        ctx.shadowOffsetY = 24;
        ctx.beginPath();
        ctx.arc(W / 2, 320, 140, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fill();
        ctx.restore();
        p.circle(top ? top.face : null, W / 2, 320, 140, top ? top.name : '');
        ctx.beginPath();
        ctx.arc(W / 2, 320, 154, 0, Math.PI * 2);
        ctx.strokeStyle = ink.edge;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (!top) return;
        const title = p.headline(top.name, W - 72, 2, 54, 34, 800);
        title.lines.forEach((line, n) => p.text(line, W / 2, 540 + n * title.size * 1.05, ink.ink, 'center'));
        const after = 540 + (title.lines.length - 1) * title.size * 1.05;
        p.font(20, 500);
        p.text(top.time + ' · ' + T.recapShareOf(top.share, m.period), W / 2, after + 40, ink.soft, 'center');
        runners(ctx, p, m.artists.slice(1, 5).map((a) => ({ name: a.name, value: a.time, img: a.face })), Math.max(after + 72, 650), true);
    }

    function paintTrack(ctx, p, m) {
        const { W, ink } = p;
        const top = m.tracks[0];
        kicker(ctx, p, T.recapTopTrack[m.period], 128, 'center');
        const side = 290;
        const x = (W - side) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 60;
        ctx.shadowOffsetY = 28;
        p.roundRect(x, 165, side, side, 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fill();
        ctx.restore();
        ctx.save();
        p.roundRect(x, 165, side, side, 20);
        ctx.clip();
        if (top && top.cover) p.cover(top.cover, x, 165, side, side);
        else {
            // Обложки нет: градиент цветов карточки и нота посередине
            const fill = ctx.createLinearGradient(x, 165, x + side, 165 + side);
            fill.addColorStop(0, p.pal.a);
            fill.addColorStop(1, p.pal.b);
            ctx.fillStyle = fill;
            ctx.fillRect(x, 165, side, side);
            ctx.translate(x + side / 2 - 60, 165 + side / 2 - 60);
            ctx.scale(5, 5);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fill(new window.Path2D('M9 3v10.6A3.5 3.5 0 1 0 11 17V7h5V3z'));
        }
        ctx.restore();
        if (!top) return;
        const title = p.headline(top.title, W - 72, 2, 44, 28, 800);
        title.lines.forEach((line, n) => p.text(line, W / 2, 520 + n * title.size * 1.08, ink.ink, 'center'));
        let y = 520 + (title.lines.length - 1) * title.size * 1.08;
        p.font(20, 500);
        p.text(p.fit(top.artist, W - 72), W / 2, y + 34, ink.soft, 'center');
        p.pill(top.plays + ' ' + plural(top.plays, T.plays), W / 2, y + 56, 16, 700);
        y += 112;
        runners(ctx, p, m.tracks.slice(1, Math.max(1, Math.min(5, 1 + Math.floor((870 - y) / 52)))).map((t) => ({ name: t.title, value: String(t.plays), img: t.cover })), y, false);
    }

    function paintVibe(ctx, p, m) {
        const { W, ink } = p;
        const i = m.insights;
        kicker(ctx, p, T.recapCharacter[m.period], 128, 'center');
        // Значок характера в светящемся круге
        ctx.save();
        ctx.shadowColor = ink.edge;
        ctx.shadowBlur = 50;
        ctx.beginPath();
        ctx.arc(W / 2, 255, 82, 0, Math.PI * 2);
        ctx.fillStyle = ink.glass;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(W / 2, 255, 82, 0, Math.PI * 2);
        ctx.strokeStyle = ink.edge;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.translate(W / 2 - 42, 255 - 42);
        ctx.scale(84 / 24, 84 / 24);
        ctx.fillStyle = ink.ink;
        ctx.fill(new window.Path2D(PERSONA_ICONS[i.archetype]), 'evenodd');
        ctx.restore();
        const title = p.headline(T.archetypes[i.archetype], W - 72, 2, 60, 36, 800);
        ctx.letterSpacing = '-1px';
        title.lines.forEach((line, n) => p.text(line, W / 2, 425 + n * title.size * 1.04, ink.ink, 'center'));
        ctx.letterSpacing = '0px';
        let y = 425 + (title.lines.length - 1) * title.size * 1.04;
        p.font(20, 500);
        p.wrap(T.archetypeLines[i.archetype](i, m), W - 96, 2).forEach((line, n) => p.text(line, W / 2, y + 42 + n * 26, ink.soft, 'center'));
        // Сутки по часам: пик белым, остальное дымкой
        const chartTop = 610;
        const chartH = 110;
        const max = Math.max(1, ...m.hours);
        const step = (W - 72) / 24;
        p.font(17, 700);
        if (i.peakHour >= 0) p.text(p.fit(T.recapPeakAt(pad(i.peakHour) + ':00') + (m.peakDay ? ' · ' + m.peakDay : ''), W - 72), 36, chartTop - 18, ink.ink);
        m.hours.forEach((minutes, hour) => {
            const h = minutes ? Math.max(4, (minutes / max) * chartH) : 2;
            p.roundRect(36 + hour * step + 1.5, chartTop + chartH - h, step - 3, h, Math.min(4, (step - 3) / 2));
            ctx.fillStyle = hour === i.peakHour ? ink.ink : ink.faint;
            ctx.fill();
        });
        p.font(12, 500);
        [0, 6, 12, 18].forEach((hour) => p.text(hour + ':00', 36 + hour * step + 1.5, chartTop + chartH + 22, ink.soft));
        // Жанры плашками по центру
        const chips = m.genres.map((g) => g.name + ' ' + g.share + '%');
        p.font(15, 700);
        const widths = chips.map((chip) => ctx.measureText(chip).width + 26);
        let shown = chips.length;
        while (shown > 0 && widths.slice(0, shown).reduce((sum, w) => sum + w + 8, -8) > W - 72) shown--;
        let cursor = (W - widths.slice(0, shown).reduce((sum, w) => sum + w + 8, -8)) / 2;
        for (let n = 0; n < shown; n++) {
            p.pill(chips[n], cursor + widths[n] / 2, 790, 15, 700);
            cursor += widths[n] + 8;
        }
    }

    const PAINT = { week: paintWeek, artist: paintArtist, track: paintTrack, vibe: paintVibe };
    function drawCard(kind, m) {
        const canvas = document.createElement('canvas');
        canvas.width = RECAP.width * RECAP.scale;
        canvas.height = RECAP.height * RECAP.scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(RECAP.scale, RECAP.scale);
        const pal = paletteFor(kind, m);
        backdrop(ctx, kind, pal);
        const p = painter(ctx, pal);
        chrome(ctx, p, m);
        PAINT[kind](ctx, p, m);
        canvas.setAttribute('aria-hidden', 'true');
        return canvas;
    }
    // Подпись карточки для чтения с экрана
    function cardLabel(kind, m, n) {
        const what =
            kind === 'week' ? T.recapLabel(T.recapOpen[m.period], span(m.heard), m.counted + ' ' + plural(m.counted, T.counted))
            : kind === 'artist' ? T.recapTopArtist[m.period] + ': ' + (m.topArtist || T.nothing)
            : kind === 'track' ? T.recapTopTrack[m.period] + ': ' + (m.topTrack || T.nothing)
            : T.recapCharacter[m.period] + ': ' + T.archetypes[m.insights.archetype];
        return T.recapCardOf(kind === 'week' ? T.recapPeriods[m.period] : T.recapCards[kind], n + 1, RECAP_CARDS.length) + '. ' + what;
    }

    // Пустые итоги: музыки не было или дней слишком мало. Одна карточка в тех же цветах с календарём периода,
    // где дни (у года месяцы) с музыкой горят; копировать и сохранять её нечего
    function emptyModel(s) {
        const r = s.recap;
        const insights = s.insights || { days: 0, daily: [], months: [] };
        const facts = periodFacts(r, insights);
        const need = RECAP_MIN_DAYS[r.period];
        return {
            ...facts,
            name: '',
            link: '',
            avatar: null,
            title: s.heard ? T.recapThinTitle : T.recapQuiet,
            line: s.heard ? T.recapThin(insights.days, need) : T.recapNone(r.period, r.span, new Date(r.from).getMonth(), r.year),
            hint: T.recapThinHint[r.span],
        };
    }
    function drawEmpty(m) {
        const canvas = document.createElement('canvas');
        canvas.width = RECAP.width * RECAP.scale;
        canvas.height = RECAP.height * RECAP.scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(RECAP.scale, RECAP.scale);
        const pal = recap.preset >= 0 ? presetPalette(RECAP_PRESETS[recap.preset]) : paletteOf(m.period === 'year' ? 280 : m.period === 'month' ? 205 : 240, 0.5);
        backdrop(ctx, 'vibe', pal);
        const p = painter(ctx, pal);
        const { W, ink } = p;
        chrome(ctx, p, m);
        kicker(ctx, p, m.kicker, 150);
        const year = m.period === 'year';
        const values = year ? m.months : m.daily;
        const total = year ? 12 : m.period === 'month' ? m.monthDays : 7;
        const cols = year ? 4 : 7;
        const size = year ? 74 : 46;
        const gap = year ? 18 : 12;
        const left = (W - (cols * size + (cols - 1) * gap)) / 2;
        // Неделя в один ряд: ниже, чтобы карточка не была пустой снизу
        const top = m.period === 'week' ? 300 : 200;
        const rows = Math.ceil(total / cols);
        for (let n = 0; n < total; n++) {
            const cx = left + (n % cols) * (size + gap) + size / 2;
            const cy = top + Math.floor(n / cols) * (size + gap) + size / 2;
            const value = values[n];
            ctx.beginPath();
            ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
            if (value > 0) {
                ctx.fillStyle = ink.ink;
                ctx.fill();
            } else if (value !== undefined) {
                ctx.fillStyle = ink.glass;
                ctx.fill();
            }
            ctx.strokeStyle = ink.edge;
            ctx.lineWidth = 1;
            ctx.stroke();
            // В кружке месяц буквой, день числом, день недели сокращением
            const label = year ? T.monthLetters[n] : m.period === 'month' ? String(n + 1) : T.week[n];
            p.font(year ? 22 : 14, 700);
            ctx.textBaseline = 'middle';
            p.text(label, cx, cy + 1, value > 0 ? pal.c : value === undefined ? ink.faint : ink.soft, 'center');
            ctx.textBaseline = 'alphabetic';
        }
        let y = top + rows * (size + gap) - gap + 92;
        const title = p.headline(m.title, W - 72, 2, 50, 32, 800);
        title.lines.forEach((line, n) => p.text(line, W / 2, y + n * title.size * 1.05, ink.ink, 'center'));
        y += (title.lines.length - 1) * title.size * 1.05;
        p.font(19, 500);
        const lines = p.wrap(m.line, W - 96, 3);
        lines.forEach((line, n) => p.text(line, W / 2, y + 44 + n * 26, ink.soft, 'center'));
        p.pill(m.hint, W / 2, y + 44 + lines.length * 26 + 8, 15, 600);
        canvas.setAttribute('aria-hidden', 'true');
        return canvas;
    }

    // Окно итогов: шапка строится при открытии и смене языка, дальше меняются только отметки и карточки.
    // Переключатель периода — сегменты с бегущей подложкой, рядом «прошлый / нынешний»
    function buildRecapModal() {
        const button = (act, label, solid) => '<button class="rc-btn' + (solid ? ' solid' : '') + '" data-rc="' + act + '">' + esc(label) + '</button>';
        modal.innerHTML =
            '<div class="rc-bar"><h2 id="rc-title">' + esc(T.recap) + '</h2>' +
            '<div class="rc-period" role="group" aria-label="' + esc(T.recapPeriodGroup) + '">' +
            RECAP_KINDS.map((kind) => '<button data-rc="period" data-period="' + kind + '">' + esc(T.recapPeriods[kind]) + '</button>').join('') +
            '</div><div class="seg rc-span" role="group" aria-label="' + esc(T.recapSpanGroup) + '">' +
            ['last', 'this'].map((span) => '<button data-rc="span" data-span="' + span + '"></button>').join('') +
            '</div><div class="rc-colors" role="group" aria-label="' + esc(T.recapColors) + '">' +
            '<button class="rc-swatch auto" data-rc="preset" data-index="-1" aria-label="' + esc(T.recapAuto) + '" data-tip="' + esc(T.recapAuto) + '"></button>' +
            RECAP_PRESETS.map((preset, i) =>
                '<button class="rc-swatch" data-rc="preset" data-index="' + i + '" aria-label="' + esc(T.recapPresets[i]) + '" data-tip="' + esc(T.recapPresets[i]) +
                '" style="background:linear-gradient(135deg,' + preset.a + ',' + preset.b + ')"></button>',
            ).join('') +
            '</div><span class="sub" id="rc-status" role="status"></span>' +
            button('copy', T.copy, true) + button('save', T.save, false) + button('close', T.recapClose, false) + '</div>' +
            '<div class="rc-body"></div>';
        updateRecapBar();
    }
    function updateRecapBar() {
        const switcher = modal.querySelector('.rc-period');
        if (switcher) switcher.style.setProperty('--at', String(RECAP_KINDS.indexOf(recap.period)));
        modal.querySelectorAll('[data-rc="period"]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.period === recap.period)));
        modal.querySelectorAll('[data-rc="span"]').forEach((node) => {
            node.textContent = spanLabel(recap.period, node.dataset.span);
            node.setAttribute('aria-pressed', String(node.dataset.span === recap.span));
        });
        modal.querySelectorAll('[data-rc="preset"]').forEach((node) => node.setAttribute('aria-pressed', String(Number(node.dataset.index) === recap.preset)));
        modal.querySelectorAll('[data-rc="copy"], [data-rc="save"]').forEach((node) => (node.disabled = !recap.canvas || recap.busy));
        const status = document.getElementById('rc-status');
        if (status) status.textContent = recap.status;
    }
    function selectCard(index, focus) {
        const nodes = [...modal.querySelectorAll('.rc-card')];
        if (!nodes.length) return;
        recap.selected = (index + nodes.length) % nodes.length;
        recap.canvas = recap.cards[recap.selected] || null;
        nodes.forEach((node, i) => node.setAttribute('aria-pressed', String(i === recap.selected)));
        const node = nodes[recap.selected];
        if (focus) node.focus({ preventScroll: true });
        node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'instant' : 'smooth' });
        updateRecapBar();
    }
    async function refreshRecapBody() {
        const body = modal.querySelector('.rc-body');
        if (!body) return;
        const s = recap.data;
        const draw = ++recap.draw;
        let note = '';
        if (recap.failed) note = T.recapFailed;
        else if (!s || (recapEnough(s) && recap.people === undefined)) note = T.recapLoading;
        if (note) {
            recap.canvas = null;
            recap.cards = [];
            recap.model = null;
            body.innerHTML = '<p class="empty' + (note === T.recapLoading ? ' rc-wait' : '') + '">' + esc(note) + '</p>';
            updateRecapBar();
            return;
        }
        if (!recapEnough(s)) {
            try {
                await recapFonts();
                if (draw !== recap.draw || !recap.open) return;
                const model = emptyModel(s);
                recap.canvas = null;
                recap.cards = [];
                recap.model = null;
                const deck = document.createElement('div');
                // Смена цвета перерисовывает на месте, без выезда
                deck.className = 'rc-deck' + (body.querySelector('.rc-solo') ? '' : ' enter');
                const node = document.createElement('div');
                node.className = 'rc-card rc-solo';
                node.style.setProperty('--i', '1.5');
                node.setAttribute('role', 'img');
                node.setAttribute('aria-label', model.title + '. ' + model.line);
                node.append(drawEmpty(model));
                deck.append(node);
                body.replaceChildren(deck);
            } catch (error) {
                console.error('Пустые итоги не нарисованы:', error);
                if (draw !== recap.draw || !recap.open) return;
                body.innerHTML = '<p class="empty">' + esc(T.recapFailed) + '</p>';
            }
            updateRecapBar();
            return;
        }
        try {
            const [model] = await Promise.all([recapModel(s, recap.people), recapFonts()]);
            if (draw !== recap.draw || !recap.open) return;
            const cards = RECAP_CARDS.map((kind) => drawCard(kind, model));
            const first = !recap.cards.length;
            recap.cards = cards;
            recap.selected = Math.min(recap.selected, cards.length - 1);
            recap.canvas = cards[recap.selected];
            recap.model = model;
            const deck = document.createElement('div');
            // Карточки выезжают по очереди только при первом показе, смена цвета перерисовывает на месте
            deck.className = 'rc-deck' + (first ? ' enter' : '');
            cards.forEach((canvas, i) => {
                const node = document.createElement('button');
                node.className = 'rc-card';
                node.dataset.rc = 'card';
                node.dataset.index = String(i);
                node.style.setProperty('--i', String(i));
                node.setAttribute('aria-pressed', String(i === recap.selected));
                node.setAttribute('aria-label', cardLabel(RECAP_CARDS[i], model, i));
                node.append(canvas);
                deck.append(node);
            });
            body.replaceChildren(deck);
            updateRecapBar();
            // Карточки появились впервые: фокус с «Закрыть» переходит на главное действие
            if (first && document.activeElement && document.activeElement.dataset.rc === 'close') modal.querySelector('[data-rc="copy"]').focus({ preventScroll: true });
        } catch (error) {
            console.error('Сводка недели не нарисована:', error);
            if (draw !== recap.draw || !recap.open) return;
            recap.canvas = null;
            recap.cards = [];
            body.innerHTML = '<p class="empty">' + esc(T.recapFailed) + '</p>';
        }
        updateRecapBar();
    }
    async function loadRecap() {
        const request = ++recap.request;
        const { period, span } = recap;
        const current = () => request === recap.request && recap.open;
        Object.assign(recap, { data: null, people: undefined, failed: false, cards: [], canvas: null, selected: 0 });
        refreshRecapBody();
        try {
            const data = await api.invoke('history:recap', period, span || 'auto');
            if (!data || !data.recap) throw new Error('Пустой ответ итогов');
            if (!current()) return;
            // Открыто на месяце или годе со страницы, а там музыки нет: итоги недели
            if (recap.fallback && period !== 'week' && !data.heard) {
                Object.assign(recap, { period: 'week', span: '', fallback: false });
                updateRecapBar();
                return loadRecap();
            }
            recap.fallback = false;
            recap.span = data.recap.span;
            recap.data = data;
            updateRecapBar();
            if (!recapEnough(data)) return refreshRecapBody();
            refreshRecapBody();
            let people = null;
            try {
                people = await api.invoke('history:people', [...new Set(data.artists.slice(0, 5).map((a) => artistPath(a.path)).filter(Boolean))]);
            } catch (error) {
                console.error('Ник и аватарки для сводки не получены:', error);
            }
            if (!current()) return;
            recap.people = people;
            await refreshRecapBody();
            // Прошлая неделя показана: точка у кнопки истории гаснет
            if (current() && data.recap.period === 'week' && data.recap.span === 'last' && recap.model) api.send('history:recap-seen', data.recap.year, data.recap.number);
        } catch (error) {
            console.error('Итоги не собраны:', error);
            if (!current()) return;
            recap.failed = true;
            refreshRecapBody();
        }
    }
    function setRecapStatus(text) {
        recap.status = text;
        updateRecapBar();
        window.clearTimeout(recap.statusTimer);
        if (text) recap.statusTimer = window.setTimeout(() => setRecapStatus(''), 4000);
    }
    // period: с кнопки страницы — по периоду страницы, с точки у кнопки истории — прошлая неделя
    function openRecap(period, fallback) {
        Object.assign(recap, { open: true, period: RECAP_KINDS.includes(period) ? period : 'week', span: '', fallback: fallback === true, canvas: null, cards: [], selected: 0, model: null, busy: false, status: '' });
        modal.hidden = false;
        view.inert = true;
        tip.hidden = true;
        buildRecapModal();
        modal.querySelector('[data-rc="close"]').focus({ preventScroll: true });
        loadRecap();
    }
    function closeRecap() {
        recap.open = false;
        recap.request++;
        recap.draw++;
        window.clearTimeout(recap.statusTimer);
        modal.hidden = true;
        modal.innerHTML = '';
        recap.canvas = null;
        recap.cards = [];
        view.inert = false;
        view.querySelector('[data-act="recap"]')?.focus({ preventScroll: true });
    }
    async function recapAction(kind) {
        if (!recap.canvas || recap.busy) return;
        let image;
        try {
            image = recap.canvas.toDataURL('image/png');
        } catch (error) {
            console.error('Сводка недели не выгрузилась из холста:', error);
            return setRecapStatus(kind === 'copy' ? T.copyFailed : T.saveFailed);
        }
        const request = recap.request;
        const model = recap.model;
        const card = RECAP_CARDS[recap.selected];
        recap.busy = true;
        updateRecapBar();
        let status;
        try {
            if (kind === 'copy') status = (await api.invoke('history:recap-copy', image)) === true ? T.copied : T.copyFailed;
            else {
                const result = await api.invoke('history:recap-save', image, model ? model.year : null, model ? model.number : null, card, model ? model.period : null);
                status = result === 'saved' ? T.saved : result === 'canceled' ? '' : T.saveFailed;
            }
        } catch (error) {
            console.error('Сводка недели не передана:', error);
            status = kind === 'copy' ? T.copyFailed : T.saveFailed;
        }
        recap.busy = false;
        if (request !== recap.request || !recap.open) return;
        setRecapStatus(status);
    }
    modal.addEventListener('click', (event) => {
        const target = event.target.closest('button[data-rc]');
        if (!target || target.disabled) return;
        const act = target.dataset.rc;
        if (act === 'close') return closeRecap();
        if (act === 'card') return selectCard(Number(target.dataset.index), false);
        if (act === 'period' || act === 'span') {
            const period = act === 'period' ? target.dataset.period : recap.period;
            const span = act === 'span' ? (target.dataset.span === 'this' ? 'this' : 'last') : '';
            if (!RECAP_KINDS.includes(period) || (period === recap.period && (act === 'period' || span === recap.span))) return;
            Object.assign(recap, { period, span, fallback: false, canvas: null });
            updateRecapBar();
            return loadRecap();
        }
        if (act === 'preset') {
            const value = Number(target.dataset.index);
            recap.preset = Number.isInteger(value) && value >= 0 && value < RECAP_PRESETS.length ? value : -1;
            savePreset(recap.preset);
            updateRecapBar();
            return refreshRecapBody();
        }
        recapAction(act);
    });

    // События
    let searchTimer;
    view.addEventListener('input', (event) => {
        if (event.target.id !== 'q') return;
        state.query = event.target.value.trim();
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(async () => {
            if (state.query) {
                try {
                    await loadResults();
                } catch (error) {
                    console.error('Поиск не удался:', error);
                    state.results = [];
                }
            }
            render(false);
        }, 200);
    });
    view.addEventListener('click', async (event) => {
        const target = event.target.closest('button, .play, svg[data-wave]');
        if (!target) return;
        const data = target.dataset;
        if (data.act === 'close') return api.send('history:close');
        if (data.act === 'recap') return openRecap(recapKindOf(state.period), true);
        if (data.act === 'retry') {
            await reload(true);
            return render(false);
        }
        if (data.act === 'artists') {
            state.allArtists = !state.allArtists;
            return render(true);
        }
        if (data.act === 'wave' || data.act === 'wave-retry') {
            state.waveOpen = data.act === 'wave-retry' || !state.waveOpen;
            if (!state.waveOpen || (state.wave && !state.waveFailed)) return render(true);
            state.waveFailed = false;
            render(true);
            await loadWave();
            return render(true);
        }
        if (data.period) {
            state.period = data.period === 'all' ? 'all' : Number(data.period);
            state.allArtists = false;
            await reload(false);
            return render(true);
        }
        if (data.day) {
            try {
                await loadDay(Number(data.day));
            } catch (error) {
                console.error('День не загружен:', error);
            }
            return render(true);
        }
        if (data.drop || data.restore) {
            const kind = data.drop || data.restore;
            target.disabled = true;
            try {
                const next = await api.invoke('history:taste-remove', kind, kind === 'artist' ? Number(data.key) : data.key, !!data.drop);
                if (next) state.taste = next;
            } catch (error) {
                console.error('Вкус волны не изменён:', error);
            }
            return render(true);
        }
        if (data.artist) return api.send('history:artist', data.artist);
        if (data.path) return play(data.path, data.id);
        if (data.wave) {
            const wave = state.overview.wave;
            const box = target.getBoundingClientRect();
            const index = Math.min(wave.bins.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * wave.bins.length)));
            try {
                await loadDay(dayStart(wave.from + index * wave.binHours * 3600000));
            } catch (error) {
                console.error('День не загружен:', error);
                return;
            }
            render(true);
            const reduce = document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            document.getElementById('journal')?.scrollIntoView({ block: 'start', behavior: reduce ? 'instant' : 'smooth' });
        }
    });
    document.addEventListener('keydown', (event) => {
        // Окно чека держит Tab у своих кнопок
        if (recap.open && event.key === 'Tab') {
            const buttons = [...modal.querySelectorAll('button:not([disabled])')];
            const at = buttons.indexOf(document.activeElement);
            const next = event.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
            event.preventDefault();
            buttons[next]?.focus();
            return;
        }
        // Стрелки листают карточки сводки, когда фокус на одной из них
        if (recap.open && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.target.closest && event.target.closest('.rc-card')) {
            event.preventDefault();
            selectCard(recap.selected + (event.key === 'ArrowRight' ? 1 : -1), true);
            return;
        }
        if (event.repeat) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            // Esc сначала закрывает чек недели, история остаётся
            if (recap.open) return closeRecap();
            const q = document.getElementById('q');
            // Первый Esc в поиске очищает запрос, второй закрывает историю
            if (q && document.activeElement === q && q.value) {
                q.value = '';
                state.query = '';
                render(true);
                return;
            }
            api.send('history:close');
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target.classList && event.target.classList.contains('play')) {
            event.preventDefault();
            play(event.target.dataset.path, event.target.dataset.id);
        }
    });

    // Подсказки: наведение и фокус показывают одно и то же
    function showTip(text, x, y) {
        tip.textContent = text;
        tip.hidden = false;
        const w = tip.offsetWidth;
        tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
        tip.style.top = Math.max(4, y - 40) + 'px';
    }
    // Подсказка следует за мышью не чаще кадра: иначе каждое движение пишет стиль и тут же меряет ширину
    let tipEvent = null;
    let tipFrame = 0;
    document.addEventListener('mousemove', (event) => {
        tipEvent = event;
        if (tipFrame) return;
        tipFrame = requestAnimationFrame(() => {
            tipFrame = 0;
            moveTip(tipEvent);
        });
    });
    function moveTip(event) {
        // За кадр страницу могли перерисовать: узел под мышью уже снят
        if (!event.target.isConnected) return;
        const wave = event.target.closest && event.target.closest('svg[data-wave]');
        if (wave && state.overview) {
            const w = state.overview.wave;
            const box = wave.getBoundingClientRect();
            const index = Math.min(w.bins.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * w.bins.length)));
            const at = w.from + index * w.binHours * 3600000;
            const label = w.binHours < 24 ? cap(fmtWd.format(at)) + ', ' + timeOf(at) + '-' + timeOf(at + w.binHours * 3600000) : w.binHours === 24 ? cap(fmtWd.format(at)) : T.from(fmtShort.format(at));
            showTip(label + ': ' + (w.bins[index] ? minutesLabel(w.bins[index]) : T.silence), event.clientX, box.top);
            return;
        }
        const node = event.target.closest && event.target.closest('[data-tip]');
        if (!node) {
            tip.hidden = true;
            return;
        }
        const box = node.getBoundingClientRect();
        showTip(node.dataset.tip, box.left + box.width / 2, box.top);
    }
    document.addEventListener('focusin', (event) => {
        const node = event.target.closest && event.target.closest('[data-tip]');
        if (!node) {
            tip.hidden = true;
            return;
        }
        const box = node.getBoundingClientRect();
        showTip(node.dataset.tip, box.left + box.width / 2, box.top);
    });
    document.addEventListener('focusout', () => {
        tip.hidden = true;
    });
    view.addEventListener('scroll', () => {
        tip.hidden = true;
    });

    // Названия старых треков добрались, язык сменился
    api.on('history:changed', async () => {
        if (!state.loaded || state.failed) return;
        await reload(false);
        render(true);
    });
    api.on('history:language', (lang) => {
        setLanguage(lang);
        render(true);
        if (recap.open) {
            // Подпись о копировании была на прежнем языке, и в самой картинке все надписи
            recap.status = '';
            buildRecapModal();
            refreshRecapBody();
            modal.querySelector('[data-rc="close"]').focus({ preventScroll: true });
        }
    });
    // Плеер сайта сменил трек: отметка «играет» переезжает на него, пауза её не снимает
    api.on('history:now', (id) => {
        const next = typeof id === 'number' && id > 0 ? id : 0;
        if (next === state.nowId) return;
        state.nowId = next;
        if (state.loaded) render(true);
    });

    async function start() {
        let initRecap = false;
        setLanguage(document.documentElement.lang);
        try {
            const init = await api.invoke('history:init');
            setLanguage(init.language);
            document.documentElement.classList.toggle('reduce-motion', init.reduceMotion === true);
            state.signedIn = init.signedIn === true;
            state.nowId = typeof init.playing === 'number' && init.playing > 0 ? init.playing : 0;
            initRecap = init.recap === true;
            if (state.signedIn) await reload(true);
            else state.loaded = true;
        } catch (error) {
            console.error('История не открыта:', error);
            state.failed = true;
            state.loaded = true;
        }
        render(false);
        api.send('history:ready');
        // История открыта нажатием на кнопку с точкой: сразу сводка прошлой недели
        if (initRecap && state.signedIn && !state.failed) openRecap('week', false);
    }
    start();
})();
