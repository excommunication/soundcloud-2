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
