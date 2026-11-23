// Состояние приходит из main целиком: заголовок, строка статуса, проценты, подпись кнопки
(() => {
    const api = window.updateScreen;
    const title = document.getElementById('title');
    const status = document.getElementById('status');
    const fill = document.getElementById('fill');
    const arc = document.getElementById('arc');
    const ring = document.getElementById('ring');
    const later = document.getElementById('later');
    const action = document.getElementById('action');
    // Облако из рёбрышек, как на заставке запуска: высоты по профилю логотипа
    const CLOUD = [0.3, 0.36, 0.44, 0.4, 0.52, 0.48, 0.6, 0.7, 0.84, 0.94, 0.99, 1.0, 0.98, 0.92, 0.8, 0.74, 0.7, 0.62, 0.48];
    const barsBox = document.getElementById('bars');
    CLOUD.forEach((h, i) => {
        const bar = document.createElement('i');
        bar.style.setProperty('--h', String(h));
        bar.style.animationDelay = -((i * 0.37) % 1.6) + 's';
        barsBox.append(bar);
    });
    // Длина окружности кольца, r = 54
    const LENGTH = 339.3;
    later.addEventListener('click', () => api.later());
    action.addEventListener('click', () => api.action());
    api.onState((state) => {
        if (!state || typeof state !== 'object') return;
        title.textContent = String(state.title || '');
        status.textContent = String(state.status || '');
        const percent = Math.max(0, Math.min(100, Number(state.percent) || 0));
        fill.style.width = percent + '%';
        arc.style.strokeDashoffset = String(LENGTH * (1 - percent / 100));
        ring.setAttribute('aria-valuenow', String(Math.round(percent)));
        later.textContent = String(state.later || '');
        // Когда установщик уже запущен, отказаться нельзя: клиент закрывается
        later.hidden = state.installing === true;
        document.body.classList.toggle('installing', state.installing === true);
        // Одно окно на всё обновление (2.9.0): проверка крутит кольцо, после «последняя версия» или ошибки полосы нет
        document.body.classList.toggle('busy', state.busy === true);
        document.body.classList.toggle('done', state.done === true);
        action.textContent = String(state.action || '');
        action.hidden = !state.action;
    });
})();
