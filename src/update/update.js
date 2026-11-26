// Состояние приходит из main целиком: заголовок, строка статуса, проценты, подпись кнопки
(() => {
    const api = window.updateScreen;
    const title = document.getElementById('title');
    const status = document.getElementById('status');
    const fill = document.getElementById('fill');
    const logo = document.getElementById('logo');
    const later = document.getElementById('later');
    const action = document.getElementById('action');
    // Звезда установщика (setup/Setup.cs): двенадцать лучей, длины повторяются через четыре. Крутится, по лучам бежит
    // яркая голова; так же она выглядит в установщике, пока ставится версия
    const RAYS = [1, 0.62, 0.84, 0.48];
    const raysBox = document.getElementById('rays');
    for (let i = 0; i < 12; i++) {
        const ray = document.createElement('i');
        ray.style.setProperty('--i', String(i));
        ray.style.setProperty('--l', String(RAYS[i % 4]));
        raysBox.append(ray);
    }
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
        action.textContent = String(state.action || '');
        action.hidden = !state.action;
    });
})();
