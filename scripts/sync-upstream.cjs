// Обновления из оригинала (scripts/fork.json → upstream): слить свежий main оригинала в наш, не ломая своё.
// Конфликты в package.json, README и lock-файле решаются сами: package.json берётся у оригинала и на него заново
// накладываются поля форка, README и картинки остаются нашими, lock-файл их. Ссылки на репозиторий оригинала в файлах
// relinkFiles переписываются на наш. Любой другой конфликт или упавшие проверки: слияние отменяется, в GitHub
// открывается issue со списком файлов, наш main не трогается.
// После удачного слияния версия поднимается на патч, ставится тег vX.Y.Z, а его сборку делает release.yml.
// Запуск: node scripts/sync-upstream.cjs [--dry-run]. В GitHub Actions пишет tag=… в GITHUB_OUTPUT
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fork = JSON.parse(fs.readFileSync(path.join(__dirname, 'fork.json'), 'utf8'));
const dry = process.argv.includes('--dry-run');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const output = (key, value) => {
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    console.log(`${key}=${value}`);
};

/** Наложить поля форка на package.json; ключи с точкой это путь внутрь объекта */
function applyPackage(version) {
    const file = path.join(root, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(fork.package)) {
        const parts = key.split('.');
        let at = pkg;
        for (const part of parts.slice(0, -1)) at = at[part] ??= {};
        at[parts.at(-1)] = value;
    }
    if (version) pkg.version = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 4) + '\n');
    return pkg;
}
function relink() {
    for (const name of fork.relinkFiles) {
        const file = path.join(root, name);
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        const next = text
            .split('github.com/' + fork.upstreamSlug).join('github.com/' + fork.slug)
            .split('api.github.com/repos/' + fork.upstreamSlug).join('api.github.com/repos/' + fork.slug);
        if (next !== text) fs.writeFileSync(file, next);
    }
}
const bump = (version) => {
    const [major, minor, patch] = version.split('.').map((part) => parseInt(part, 10) || 0);
    return `${major}.${minor}.${patch + 1}`;
};
function report(title, body) {
    console.error(title + '\n' + body);
    if (dry || !process.env.GH_TOKEN) return;
    const open = spawnSync('gh', ['issue', 'list', '--state', 'open', '--search', title + ' in:title', '--json', 'number', '--jq', '.[0].number'], { cwd: root, encoding: 'utf8' });
    const number = open.stdout?.trim();
    const args = number ? ['issue', 'comment', number, '--body', body] : ['issue', 'create', '--title', title, '--body', body];
    spawnSync('gh', args, { cwd: root, stdio: 'inherit' });
}
function checks() {
    const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    for (const [cmd, args] of [
        ['npx', ['--yes', 'pnpm@12.15.0', 'install', '--frozen-lockfile']],
        ['npx', ['--yes', 'pnpm@12.15.0', 'typecheck']],
        ['npx', ['--yes', 'pnpm@12.15.0', 'lint']],
        ['npx', ['--yes', 'pnpm@12.15.0', 'exec', 'vitest', 'run', '--testTimeout=30000', '--retry=1']],
    ]) {
        if (run(cmd, args).status !== 0) return `${cmd} ${args.slice(2).join(' ')}`;
    }
    return '';
}

if (tryGit('remote', 'get-url', 'upstream').status !== 0) git('remote', 'add', 'upstream', fork.upstream);
git('fetch', '--no-tags', 'upstream', 'main');
const upstream = git('rev-parse', 'upstream/main');
if (tryGit('merge-base', '--is-ancestor', upstream, 'HEAD').status === 0) {
    console.log('Оригинал без новых коммитов');
    output('tag', '');
    process.exit(0);
}
const short = upstream.slice(0, 7);
const log = git('log', '--format=- %s', 'HEAD..' + upstream);
const ourVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
tryGit('merge', '--no-commit', '--no-ff', upstream);
const conflicts = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
const base = git('merge-base', 'HEAD', upstream);
const show = (rev, file) => {
    const result = tryGit('show', rev + ':' + file);
    return result.status === 0 ? result.stdout : null;
};
// Наша версия отличается от общей базы только ссылками на репозиторий: берём файл оригинала, ссылки перепишет relink
const onlyRelinked = (file) => {
    const ours = show('HEAD', file);
    const was = show(base, file);
    return ours !== null && was !== null && ours !== was && ours.split(fork.slug).join(fork.upstreamSlug) === was;
};
const left = [];
for (const file of conflicts) {
    const top = (list) => list.some((entry) => file === entry || file.startsWith(entry + '/'));
    if (file === 'package.json') git('checkout', '--theirs', '--', file);
    else if (top(fork.ours)) git('checkout', '--ours', '--', file);
    else if (top(fork.theirs) || onlyRelinked(file)) git('checkout', '--theirs', '--', file);
    else {
        left.push(file);
        continue;
    }
    git('add', '--', file);
}
if (left.length) {
    tryGit('merge', '--abort');
    report('Обновления оригинала требуют ручного слияния', `Оригинал ${short} меняет те же места, что и SoundCloud 2:\n\n${left.map((file) => '- `' + file + '`').join('\n')}\n\nНовое в оригинале:\n${log}\n\nСлить руками: \`git fetch upstream && git merge upstream/main\`, решить конфликты, запушить.`);
    output('tag', '');
    process.exit(0);
}
// package.json приходит от оригинала (их зависимости и скрипты), поля форка поверх, версия наша и на патч выше
const version = bump(ourVersion);
applyPackage(version);
relink();
git('add', '-A');
const failed = dry ? '' : checks();
if (failed) {
    tryGit('merge', '--abort');
    tryGit('reset', '--hard', 'HEAD');
    report('Обновления оригинала ломают сборку', `После слияния оригинала ${short} не прошло: \`${failed}\`.\n\nНовое в оригинале:\n${log}`);
    output('tag', '');
    process.exit(0);
}
git('add', '-A');
git('commit', '-m', `Обновления из оригинала ${short}, версия ${version}\n\n${log}`);
if (dry) {
    console.log(`Слито ${short}, версия ${version} (без отправки)`);
    output('tag', '');
    process.exit(0);
}
git('tag', 'v' + version);
git('push', 'origin', 'HEAD:main');
git('push', 'origin', 'v' + version);
output('tag', 'v' + version);
