// Кладёт рядом со скомпилированным кодом статические файлы окон клиента и их общие токены: tsc их не переносит
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
fs.cpSync(path.join(root, 'src', 'header'), path.join(root, 'tsc', 'header'), { recursive: true });

const updateSource = path.join(root, 'src', 'update');
const updateTarget = path.join(root, 'tsc', 'update');
fs.mkdirSync(updateTarget, { recursive: true });
for (const name of fs.readdirSync(updateSource)) {
    if (/\.(html|css|js)$/.test(name)) fs.copyFileSync(path.join(updateSource, name), path.join(updateTarget, name));
}

for (const folder of ['settings', 'history', 'tray', 'intro', 'island']) {
    const source = path.join(root, 'src', folder);
    const target = path.join(root, 'tsc', folder);
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) {
        if (/\.(html|css|js)$/.test(name)) fs.copyFileSync(path.join(source, name), path.join(target, name));
    }
}
// Общие токены окон и шрифт Onest (OFL): окна подключают их как ../shared/tokens.css
fs.cpSync(path.join(root, 'src', 'shared'), path.join(root, 'tsc', 'shared'), { recursive: true });
