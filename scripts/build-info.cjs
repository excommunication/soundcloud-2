const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const build = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
mkdirSync('tsc', { recursive: true });
// SC_BUILD_CHANNEL=test помечает тестовую сборку: другое название и иконка, чтобы не спутать с установленной
const channel = process.env.SC_BUILD_CHANNEL === 'test' ? 'test' : 'release';
// Версия из package.json: без упаковки (npm run dev) Electron не видит package.json приложения и отдаёт свою версию
const { version } = require('../package.json');
writeFileSync('tsc/build-info.json', JSON.stringify({ build, dirty, channel, version }) + '\n');
