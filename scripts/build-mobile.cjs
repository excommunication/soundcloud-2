// Скрипты страницы для мобильного прототипа: те же функции, что main внедряет в soundcloud.com на ПК, собранные tsc,
// в два файла ресурсов Android. bridge.js ставится до скриптов сайта (мост вместо preload), page.js после загрузки.
// Запуск после tsc: node scripts/build-mobile.cjs [папка назначения]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const services = path.join(root, 'tsc', 'services');
const load = (name) => require(path.join(services, name));
const target = path.resolve(process.argv[2] || path.join(root, 'mobile', 'android', 'app', 'src', 'main', 'assets'));

const { executePageCommand } = load('playbackController');
const parts = [
    // Однократно: SPA сайта не перезагружает страницу, а Android вызывает внедрение на каждой полной загрузке
    'if (!window.__sc2Page) { window.__sc2Page = true;',
    // Команды из уведомления: тот же поиск кнопок плеера сайта, что у PlaybackController на ПК
    'window.__sc2Command = (command) => (' + executePageCommand.toString() + ')(command);',
    load('audioMonitorService').audioMonitorScript,
    load('fullShuffle').fullShuffleScript(true),
    load('pageMotion').pageMotionScript(false),
    load('homeBlocks').homePageScript(),
    load('wave').waveScript(false),
    load('playerArea').playerAreaScript(),
    load('searchHistory').searchHistoryScript('ru'),
    load('searchLink').searchLinkScript(),
    '}',
];
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(root, 'mobile', 'web', 'bridge.js'), path.join(target, 'bridge.js'));
fs.writeFileSync(path.join(target, 'page.js'), parts.join('\n;\n'));
console.log('Скрипты страницы для Android: ' + target + ' (' + Math.round(fs.statSync(path.join(target, 'page.js')).size / 1024) + ' КБ)');
