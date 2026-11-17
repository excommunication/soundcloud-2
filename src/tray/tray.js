// Меню трея SoundCloud 2: показывает трек из main и шлёт действия; ничего не знает о сайте
const TEXT = {
    en: { open: 'Open SoundCloud 2', appearance: 'Appearance', settings: 'Settings', incognito: 'Discord incognito', quit: 'Quit', idle: 'Nothing playing', play: 'Play', pause: 'Pause', previous: 'Previous', next: 'Next', like: 'Like' },
    ru: { open: 'Открыть SoundCloud 2', appearance: 'Оформление', settings: 'Настройки', incognito: 'Инкогнито в Discord', quit: 'Выход', idle: 'Ничего не играет', play: 'Играть', pause: 'Пауза', previous: 'Предыдущий', next: 'Следующий', like: 'Лайк' },
};
const PLAY = 'M4 2.5v11L13.5 8z';
const PAUSE = 'M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z';
let texts = TEXT.ru;

function render(state) {
    if (!state) return;
    texts = TEXT[state.language] || TEXT.ru;
    document.documentElement.lang = state.language;
    for (const node of document.querySelectorAll('[data-t]')) node.textContent = texts[node.dataset.t];
    const track = state.track || {};
    document.getElementById('title').textContent = track.title || texts.idle;
    document.getElementById('author').textContent = track.author || 'SoundCloud 2';
    const art = document.getElementById('art');
    art.style.backgroundImage = /^https:\/\//.test(track.artwork || '') ? 'url("' + track.artwork.replace(/["\\]/g, '') + '")' : '';
    document.getElementById('play-icon').firstElementChild.setAttribute('d', track.isPlaying ? PAUSE : PLAY);
    document.getElementById('play').setAttribute('aria-label', track.isPlaying ? texts.pause : texts.play);
    for (const act of ['previous', 'next', 'like']) document.querySelector('[data-act="' + act + '"]')?.setAttribute('aria-label', texts[act]);
    document.getElementById('like').setAttribute('aria-pressed', String(track.isLiked === true));
    document.getElementById('incognito').checked = state.incognito === true;
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (button) window.trayAPI.act(button.dataset.act);
});
document.getElementById('incognito').addEventListener('change', (event) => window.trayAPI.act('incognito', event.target.checked));
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.trayAPI.act('close');
});
window.trayAPI.onState(render);
window.trayAPI.state().then(render);
