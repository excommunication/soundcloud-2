// Состояние приходит из main целиком: заголовок, строка статуса, проценты, подпись кнопки
(() => {
    const api = window.updateScreen;
    const title = document.getElementById('title');
    const status = document.getElementById('status');
    const fill = document.getElementById('fill');
    const logo = document.getElementById('logo');
    const later = document.getElementById('later');
    const action = document.getElementById('action');
    // Облако из рёбрышек, как в установщике (setup/Setup.cs): высоты по профилю логотипа
    const CLOUD = [0.3, 0.36, 0.44, 0.4, 0.52, 0.48, 0.6, 0.7, 0.84, 0.94, 0.99, 1.0, 0.98, 0.92, 0.8, 0.74, 0.7, 0.62, 0.48];
    const barsBox = document.getElementById('bars');
    const bars = CLOUD.map((h, i) => {
        const bar = document.createElement('i');
        bar.style.setProperty('--h', String(h));
        bar.style.setProperty('--i', String(i));
        barsBox.append(bar);
        return bar;
    });
    // Звезда установки: двенадцать лучей, длины повторяются через четыре
    const RAYS = [1, 0.62, 0.84, 0.48];
    const raysBox = document.getElementById('rays');
    for (let i = 0; i < 12; i++) {
        const ray = document.createElement('i');
        ray.style.setProperty('--i', String(i));
        ray.style.setProperty('--l', String(RAYS[i % 4]));
        raysBox.append(ray);
    }
    // Рёбрышки загораются слева направо по ходу скачивания: погашенное светится на 30%, как в установщике
    const light = (share) => {
        const done = share * bars.length;
        bars.forEach((bar, i) => bar.style.setProperty('--lit', String(0.3 + 0.7 * Math.max(0, Math.min(1, done - i)))));
    };
    later.addEventListener('click', () => api.later());
    action.addEventListener('click', () => api.action());
    api.onState((state) => {
        if (!state || typeof state !== 'object') return;
        title.textContent = String(state.title || '');
        status.textContent = String(state.status || '');
        const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
        fill.style.width = percent + '%';
        // Проверка идёт без процентов: у неопределённого прогресса aria-valuenow нет, иначе читалка говорит «0 %»
        if (state.busy === true) logo.removeAttribute('aria-valuenow');
        else logo.setAttribute('aria-valuenow', String(Math.round(percent)));
        later.textContent = String(state.later || '');
        // Когда установщик уже запущен, отказаться нельзя: клиент закрывается
        later.hidden = state.installing === true;
        document.body.classList.toggle('installing', state.installing === true);
        // Одно окно на всё обновление (2.9.0): на проверке бежит полоса, после «последняя версия» или ошибки полосы нет
        document.body.classList.toggle('busy', state.busy === true);
        document.body.classList.toggle('done', state.done === true);
        // Сбой проверки: итог без процентов (у «последней версии» и «вышла версия» полоса полная)
        document.body.classList.toggle('failed', state.done === true && percent === 0);
        // Облако горит целиком на проверке, установке и итоге; на скачивании — по доле
        const downloading = state.busy !== true && state.installing !== true && state.done !== true;
        light(downloading ? percent / 100 : 1);
        action.textContent = String(state.action || '');
        action.hidden = !state.action;
    });
})();
