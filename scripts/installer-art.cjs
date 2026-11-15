// Картинки установщика: боковая 164x314 (приветствие и финиш) и шапка 150x57 (страница установки), 24-битные BMP
// в build-resources. Рисует Electron из HTML, чтобы оформление совпадало с заставкой клиента.
// Запуск: electron scripts/installer-art.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const LOGO =
    '<svg viewBox="0 -4 200 96"><g fill="#fff">' +
    [[2, 45, 32], [15, 38, 46], [28, 41, 46], [41.5, 26, 61], [54.5, 20, 67], [68, 23, 64], [81.5, 13, 74]].map(([x, y, h]) => `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3"/>`).join('') +
    '<path d="M100 87Q95 87 95 82V10Q95 5 100 3.5Q108 1 117 1Q155 1 163 36Q167 35 170 35Q193 35 193 61Q193 87 168 87Z"/></g></svg>';
const page = (width, height, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#0b0e18;font-family:'Segoe UI',system-ui,sans-serif;color:#fff}
.bg{position:absolute;inset:0;background:radial-gradient(120% 70% at 20% 0%,#2b3fae 0%,transparent 60%),radial-gradient(110% 60% at 100% 100%,#7a35c9 0%,transparent 62%),radial-gradient(80% 40% at 60% 55%,#0f8fc4 0%,transparent 70%),#0b0e18}
.grain{position:absolute;inset:0;opacity:.5;background:radial-gradient(circle at 50% 120%,rgba(11,14,24,0) 30%,#0b0e18 100%)}
${body.css}</style></head><body><div class="bg"></div><div class="grain"></div>${body.html}</body></html>`;

const sidebar = page(164, 314, {
    css: `.logo{position:absolute;left:28px;top:96px;width:108px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.55))}
.name{position:absolute;left:0;right:0;top:176px;text-align:center;font-size:19px;font-weight:700;letter-spacing:-.3px}
.sub{position:absolute;left:0;right:0;top:204px;text-align:center;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.62)}
.eq{position:absolute;left:0;right:0;bottom:0;height:64px;display:flex;align-items:flex-end;gap:3px;padding:0 10px;box-sizing:border-box;opacity:.5}
.eq i{flex:1;border-radius:2px 2px 0 0;background:linear-gradient(#fff,rgba(255,255,255,.08))}`,
    html: `<div class="logo">${LOGO}</div><div class="name">SoundCloud 2</div><div class="sub">Моя волна</div><div class="eq">${Array.from({ length: 26 }, (_, i) => `<i style="height:${Math.round(10 + 44 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)))}px"></i>`).join('')}</div>`,
});
const header = page(150, 57, {
    css: `.logo{position:absolute;right:14px;top:14px;width:62px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}`,
    html: `<div class="logo">${LOGO}</div>`,
});

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
app.whenReady().then(async () => {
    const target = path.resolve(__dirname, '..', 'build-resources');
    for (const [name, html, width, height] of [['installerSidebar.bmp', sidebar, 164, 314], ['installerHeader.bmp', header, 150, 57]]) {
        const win = new BrowserWindow({ width, height, show: false, frame: false, useContentSize: true, webPreferences: { sandbox: true } });
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        await new Promise((resolve) => setTimeout(resolve, 400));
        const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
        fs.writeFileSync(path.join(target, name), bmp(image, width, height));
        fs.writeFileSync(path.join(target, name.replace('.bmp', '.preview.png')), image.toPNG());
        win.destroy();
    }
    app.exit(0);
});
