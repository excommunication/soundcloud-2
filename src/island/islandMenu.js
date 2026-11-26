// Меню острова: рисует пункты, которые прислал main, закрывается по Esc (по потере фокуса его закрывает main)
(() => {
    const api = window.islandMenuAPI;
    const menu = document.getElementById('menu');
    const ICONS = {
        play: '<path d="M5 3.5v9l7.5-4.5z"/>',
        pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
        next: '<path d="M3 3.5v9l6.5-4.5zM12.5 3.5v9"/>',
        previous: '<path d="M13 3.5v9L6.5 8zM3.5 3.5v9"/>',
        liked: '<path fill="currentColor" d="M8 13.5S2.5 10.2 2.5 6.4A2.9 2.9 0 0 1 8 5a2.9 2.9 0 0 1 5.5 1.4C13.5 10.2 8 13.5 8 13.5z"/>',
        like: '<path d="M8 13.5S2.5 10.2 2.5 6.4A2.9 2.9 0 0 1 8 5a2.9 2.9 0 0 1 5.5 1.4C13.5 10.2 8 13.5 8 13.5z"/>',
        open: '<path d="M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/>',
        hide: '<path d="M2 8s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4zM3 13 13 3"/>',
        copy: '<path d="M6.5 9.5 9.5 6.5M7 4.5l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8"/>',
        cover: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M2.5 10.5 6 7.5l3 2.5 1.5-1.2 3 2.2"/>',
        fullscreen: '<rect x="1.5" y="4" width="13" height="8.5" rx="2"/><path d="M5 8.2h2.5M6.2 7v2.5M10.2 7.6v.1M11.5 9v.1"/>',
        reset: '<path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3"/>',
        settings: '<path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6"/><circle cx="10" cy="5" r="1.5"/><circle cx="6" cy="11" r="1.5"/>',
        off: '<path d="M8 2.5v5M4.6 4.4a5 5 0 1 0 6.8 0"/>',
    };
    const svg = (id) => '<svg viewBox="0 0 16 16" aria-hidden="true">' + (ICONS[id] || '') + '</svg>';

    void api.items().then((payload) => {
        if (!payload) return;
        document.documentElement.classList.toggle('shaped', payload.shaped === true);
        for (const item of payload.items) {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'sep';
                sep.setAttribute('role', 'separator');
                menu.append(sep);
                continue;
            }
            const row = document.createElement('button');
            row.className = 'row' + (item.danger ? ' danger' : '');
            row.setAttribute('role', 'menuitem');
            row.innerHTML = svg(item.icon || item.id);
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.label;
            row.append(label);
            if (typeof item.checked === 'boolean') {
                const tick = document.createElement('i');
                tick.className = 'switch' + (item.checked ? ' on' : '');
                row.append(tick);
                row.setAttribute('role', 'menuitemcheckbox');
                row.setAttribute('aria-checked', String(item.checked));
            }
            if (item.disabled) row.disabled = true;
            row.addEventListener('click', () => {
                // Переключатель сначала щёлкает на месте, а меню закрывается чуть позже: видно, что нажалось
                if (typeof item.checked === 'boolean') {
                    row.querySelector('.switch')?.classList.toggle('on');
                    setTimeout(() => api.pick(item.id), 140);
                } else api.pick(item.id);
            });
            row.addEventListener('mousemove', () => row !== document.activeElement && !row.disabled && row.focus({ preventScroll: true }));
            menu.append(row);
        }
    });
    // Стрелки ходят по пунктам, Home/End — к краям, Enter и пробел нажимают, как в системном меню
    function rows() {
        return [...menu.querySelectorAll('.row:not(:disabled)')];
    }
    function step(delta) {
        const list = rows();
        if (!list.length) return;
        const at = list.indexOf(document.activeElement);
        const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : (at + delta + list.length) % list.length;
        list[next].focus();
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); step(1); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); step(-1); }
        else if (event.key === 'Home') { event.preventDefault(); rows()[0]?.focus(); }
        else if (event.key === 'End') { event.preventDefault(); rows().at(-1)?.focus(); }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') api.pick('');
    });
    document.addEventListener('contextmenu', (event) => event.preventDefault());
})();
