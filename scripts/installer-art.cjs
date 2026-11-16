/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, Buffer, __dirname, setTimeout */
// Картинки установщика (2.8.1): минимализм в духе установщика Claude, цвета SoundCloud (тёмный фон и оранжевый #f50).
// Боковая 164x314 (приветствие и финиш), шапка 150x57 (страница установки) и восемь кадров шапки со спиннером:
// установщик меняет их 8 раз в секунду, получается «архивная» покадровая анимация с низким fps.
// Спиннер это двенадцать лучей-столбиков эквалайзера по кругу, как лучи у звезды Claude, но столбики SoundCloud.
// Всё в build-resources. Рисует Electron из HTML. Запуск: electron scripts/installer-art.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const BG = '#121212';
const GREEN = '#f50';
const FRAMES = 8;
// Шрифт Onest из клиента (OFL): фирменный Interstate у SoundCloud платный и в репозиторий не кладётся
const font = (file, range) => `@font-face{font-family:'Onest';font-weight:100 900;src:url(data:font/woff2;base64,${fs.readFileSync(path.resolve(__dirname, '..', 'src', 'history', 'fonts', file)).toString('base64')}) format('woff2');unicode-range:${range}}`;
const FONTS = font('onest-latin.woff2', 'U+0000-00FF,U+2000-206F') + font('onest-cyrillic.woff2', 'U+0400-04FF');
const RAYS = 12;
// Длины лучей по кругу: повторяются через четыре, поэтому поворот на 120° даёт тот же рисунок и круг замыкается
const BASE = [1, 0.62, 0.84, 0.48];

// Звезда из столбиков. frame 0..7 поворачивает её на 15° за кадр и «дёргает» длины, как рисованную от руки
function spark(size, frame, color, hot) {
    const c = size / 2;
    const inner = size * 0.17;
    const reach = size * 0.33;
    const width = Math.max(2.4, size * 0.058);
    let out = '';
    for (let i = 0; i < RAYS; i++) {
        const wobble = 0.82 + 0.18 * (((i * 5 + frame * 3) % 8) / 7);
        const length = reach * BASE[i % 4] * wobble;
        const angle = (i * 360) / RAYS + frame * 15;
        const lit = hot && (i + frame) % RAYS === 0;
        out += `<line x1="${c}" y1="${c - inner}" x2="${c}" y2="${c - inner - length}" stroke="${lit ? '#fff' : color}" stroke-width="${width}" stroke-linecap="round" transform="rotate(${angle} ${c} ${c})"/>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

const page = (width, height, css, html) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${BG};font-family:'Onest','Segoe UI',system-ui,sans-serif;color:#fff}
${FONTS}
${css}</style></head><body>${html}</body></html>`;

const sidebar = page(
    164,
    314,
    `.glow{position:absolute;inset:0;background:radial-gradient(90% 55% at 50% 118%,rgba(255,85,0,.22),transparent 70%)}
.spark{position:absolute;left:19px;top:70px}
.name{position:absolute;left:0;right:0;top:206px;text-align:center;font-size:21px;font-weight:800;letter-spacing:-.5px}
.sub{position:absolute;left:0;right:0;top:234px;text-align:center;font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#b3b3b3}
.egg{position:absolute;left:0;right:0;bottom:12px;text-align:center;font:9px/1 Consolas,'Courier New',monospace;letter-spacing:.12em;color:#5c5c5c}`,
    `<div class="glow"></div><div class="spark">${spark(126, 0, GREEN, true)}</div><div class="name">SoundCloud 2</div><div class="sub">Моя волна</div><div class="egg">// sound claude</div>`,
);
const headerFrame = (frame) =>
    page(150, 57, `.spark{position:absolute;left:50px;top:3px}`, `<div class="spark">${spark(51, frame, GREEN, true)}</div>`);

// 24-битный BMP снизу вверх из BGRA-буфера Electron, строки добиты до 4 байт
function bmp(image, width, height) {
    const size = image.getSize();
    const scaled = size.width === width && size.height === height ? image : image.resize({ width, height, quality: 'best' });
    const source = scaled.toBitmap();
    const row = Math.ceil((width * 3) / 4) * 4;
    const out = Buffer.alloc(54 + row * height);
    out.write('BM', 0, 'ascii');
    out.writeUInt32LE(out.length, 2);
    out.writeUInt32LE(54, 10);
    out.writeUInt32LE(40, 14);
    out.writeInt32LE(width, 18);
    out.writeInt32LE(height, 22);
    out.writeUInt16LE(1, 26);
    out.writeUInt16LE(24, 28);
    out.writeUInt32LE(row * height, 34);
    out.writeInt32LE(2835, 38);
    out.writeInt32LE(2835, 42);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const from = ((height - 1 - y) * width + x) * 4;
            const to = 54 + y * row + x * 3;
            out[to] = source[from];
            out[to + 1] = source[from + 1];
            out[to + 2] = source[from + 2];
        }
    }
    return out;
}

// Окна закрываются по одному: без этого Electron выходит после первого
app.on('window-all-closed', () => undefined);
setTimeout(() => app.exit(1), 90000);
app.whenReady().then(async () => {
    const target = path.resolve(__dirname, '..', 'build-resources');
    fs.mkdirSync(path.join(target, 'spin'), { recursive: true });
    const jobs = [['installerSidebar.bmp', sidebar, 164, 314], ['installerHeader.bmp', headerFrame(0), 150, 57]];
    for (let i = 0; i < FRAMES; i++) jobs.push([path.join('spin', `sp${i}.bmp`), headerFrame(i), 150, 57]);
    for (const [name, html, width, height] of jobs) {
        const win = new BrowserWindow({ width, height, show: false, frame: false, useContentSize: true, webPreferences: { sandbox: true } });
        // Страница со шрифтами в base64 слишком велика для data:-адреса, поэтому идёт через временный файл
        const file = path.join(require('node:os').tmpdir(), 'sc-installer-art.html');
        fs.writeFileSync(file, html);
        await win.loadFile(file);
        await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
        await new Promise((resolve) => setTimeout(resolve, 250));
        const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
        fs.writeFileSync(path.join(target, name), bmp(image, width, height));
        // Предпросмотры нужны только для глаз и в репозиторий не идут (см. .gitignore)
        if (!name.startsWith('spin')) fs.writeFileSync(path.join(target, name.replace('.bmp', '.preview.png')), image.toPNG());
        win.destroy();
    }
    app.exit(0);
});
