/* global require, process, __dirname, console, Buffer */
// Маленький установщик build/SoundCloud-2-Setup.exe (~100 КБ) из setup/Setup.cs. Собирается csc.exe из .NET Framework 4,
// который лежит в любой Windows, SDK не нужен. Репозиторий релизов, имя продукта и версия берутся из package.json,
// поэтому после синхронизации с оригиналом загрузчик по-прежнему качает релизы форка. Только Windows.
// Запуск: node scripts/build-setup.cjs
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const publish = pkg.build.publish;
const windir = process.env.WINDIR || 'C:\\Windows';
const net = ['Framework64', 'Framework']
    .map((dir) => path.join(windir, 'Microsoft.NET', dir, 'v4.0.30319'))
    .find((dir) => fs.existsSync(path.join(dir, 'csc.exe')));
if (!net) throw new Error('Не найден csc.exe из .NET Framework 4: установщик собирается только в Windows');

const quote = (text) => JSON.stringify(String(text));
// Ключ записи в «Программах и компонентах» у electron-builder: UUID v5 от appId в его пространстве имён.
// По нему загрузчик находит именно этот клиент, а не другие программы с деинсталлятором «Uninstall SoundCloud.exe»
function appGuid(appId) {
    const ns = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
    const h = crypto
        .createHash('sha1')
        .update(Buffer.concat([ns, Buffer.from(appId, 'utf8')]))
        .digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString('hex');
    return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20)].join('-');
}
const version = pkg.version.replace(/[^0-9.]/g, '');
const gen = path.join(os.tmpdir(), 'soundcloud-setup-build.g.cs');
fs.writeFileSync(
    gen,
    `using System.Reflection;
[assembly: AssemblyTitle("SoundCloud 2 Setup")]
[assembly: AssemblyProduct(${quote(pkg.build.productName + ' 2')})]
[assembly: AssemblyCompany(${quote(pkg.author.name)})]
[assembly: AssemblyVersion(${quote(version)})]
[assembly: AssemblyFileVersion(${quote(version)})]
namespace SoundCloudSetup {
    static class Build {
        public const string Repo = ${quote(publish.owner + '/' + publish.repo)};
        public const string Product = ${quote(pkg.build.productName)};
        public const string Version = ${quote(pkg.version)};
        public const string Guid = ${quote(appGuid(pkg.build.appId))};
    }
}
`,
);

const out = path.join(root, 'build', 'SoundCloud-2-Setup.exe');
fs.mkdirSync(path.dirname(out), { recursive: true });
const wpf = path.join(net, 'WPF');
execFileSync(
    path.join(net, 'csc.exe'),
    [
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/platform:anycpu',
        '/utf8output',
        '/codepage:65001',
        `/out:${out}`,
        `/win32icon:${path.join(root, 'assets', 'icons', 'soundcloud-win.ico')}`,
        `/win32manifest:${path.join(root, 'setup', 'setup.manifest')}`,
        `/r:${path.join(wpf, 'PresentationFramework.dll')}`,
        `/r:${path.join(wpf, 'PresentationCore.dll')}`,
        `/r:${path.join(wpf, 'WindowsBase.dll')}`,
        `/r:${path.join(net, 'System.Xaml.dll')}`,
        path.join(root, 'setup', 'Setup.cs'),
        gen,
    ],
    { stdio: 'inherit' },
);
fs.rmSync(gen, { force: true });
console.log(`Установщик: ${path.relative(root, out)}, ${Math.round(fs.statSync(out).size / 1024)} КБ`);
