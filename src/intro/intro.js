// Заставка запуска. Логотип собирается в центре, пока грузится сайт. main зовёт window.introGo(), когда сайт готов:
// логотип мягко растворяется, и широкий круг от него открывает клиент. После этого main убирает вид
(() => {
    const logo = document.getElementById('logo');
    const veil = document.getElementById('veil');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Мягкая пружина: без сильного перелёта, иначе движение выглядит дёрганым
    const spring = 'cubic-bezier(.22,1.2,.36,1)';
    const word = document.getElementById('word');
    const track = document.getElementById('track');
    const fill = document.getElementById('fill');
    const barsBox = document.getElementById('bars');
    // Профиль облака SoundCloud из установщика: высоты рёбрышек, низ общий
    const CLOUD = [0.3, 0.36, 0.44, 0.4, 0.52, 0.48, 0.6, 0.7, 0.84, 0.94, 0.99, 1.0, 0.98, 0.92, 0.8, 0.74, 0.7, 0.62, 0.48];
    for (const h of CLOUD) {
        const bar = document.createElement('i');
        bar.style.setProperty('--h', String(h));
        barsBox.append(bar);
    }
    const bars = [...barsBox.children];
    let gone = false;
    let barRaf = 0;
    // Полоса ползёт к 92% и замедляется (сколько грузится сайт, неизвестно); меняется только transform
    const t0 = window.performance.now();
    const tick = () => {
        if (gone) return;
        fill.style.transform = 'scaleX(' + (0.92 * (1 - Math.exp(-(window.performance.now() - t0) / 1900))).toFixed(3) + ')';
        barRaf = requestAnimationFrame(tick);
    };

    // Сборка: рёбрышки вырастают волной слева направо, название проявляется, потом рёбрышки «дышат»
    if (reduce) {
        for (const bar of bars) bar.style.transform = 'none';
        word.style.opacity = '1';
        track.style.opacity = '1';
        tick();
    } else {
        logo.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, easing: spring, fill: 'both' });
        const grow = bars.map((bar, i) =>
            bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 700, delay: 80 + i * 40, easing: spring, fill: 'forwards' }),
        );
        word.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 600, easing: spring, fill: 'forwards' });
        track.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 900, fill: 'forwards' });
        tick();
        grow[grow.length - 1].finished
            .then(() => {
                if (gone) return;
                for (const bar of bars) {
                    bar.getAnimations().forEach((animation) => animation.cancel());
                    bar.style.transform = 'none';
                }
                bars.forEach((bar, i) => (bar.style.animationDelay = -((i * 0.37) % 1.6) + 's'));
                logo.classList.add('idle');
            })
            .catch(() => {});
    }

    // Мягкий уход: название и полоса гаснут, логотип плавно вырастает и растворяется, а из его центра широким мягким
    // кругом открывается клиент. Если сайт был готов раньше, сборка логотипа ускоряется, чтобы не заставлять ждать
    window.introGo = () => {
        if (gone) return;
        gone = true;
        cancelAnimationFrame(barRaf);
        fill.animate([{ transform: fill.style.transform || 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 200, fill: 'forwards' });
        for (const part of [word, track]) part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 80, easing: 'ease-out', fill: 'forwards' });
        if (reduce) {
            document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
            return;
        }
        // Сборка ещё идёт: доигрываем её втрое быстрее
        for (const animation of document.getAnimations()) if (animation.playState === 'running') animation.updatePlaybackRate(3);
        logo.classList.remove('idle');
        const box = logo.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        logo.animate(
            [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.18)', opacity: 0 }],
            { duration: 700, delay: 120, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
        );
        veil.style.setProperty('--x', x + 'px');
        veil.style.setProperty('--y', y + 'px');
        veil.classList.add('open');
        const far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 200;
        veil.animate([{ '--r': '0px' }, { '--r': far.toFixed(0) + 'px' }], { duration: 950, delay: 180, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    };
})();
