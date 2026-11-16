// Заставка запуска. Логотип собирается в центре, пока грузится сайт. main зовёт window.introGo(), когда сайт готов:
// логотип сжимается, чуть подлетает и падает вниз с искрами на место плеера, там взрывается, и круг взрыва от нижнего
// бара открывает клиент. После этого main убирает вид
(() => {
    const logo = document.getElementById('logo');
    const veil = document.getElementById('veil');
    const fx = document.getElementById('fx');
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

    const PALETTE = ['#ffffff', '#ffb27a', '#ff8800', '#ff5500', '#ff8800', '#ff3300'];
    const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
    // Искра: точка, которая отлетает в сторону и гаснет
    function spark(x, y, dx, dy, size, life) {
        const dot = document.createElement('i');
        const color = pick();
        dot.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 ${size * 2.5}px ${color}`;
        fx.append(dot);
        dot.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0 }], { duration: life, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' })
            .finished.then(() => dot.remove())
            .catch(() => {});
    }

    function explode(x, y) {
        // Вспышка, кольцо ударной волны и полоса света вдоль нижнего бара
        const ring = document.createElement('i');
        ring.style.cssText = `left:${x - 60}px;top:${y - 60}px;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,.85);box-shadow:0 0 40px rgba(255,110,30,.6)`;
        const flash = document.createElement('i');
        flash.style.cssText = `left:${x - 180}px;top:${y - 180}px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95),rgba(255,100,20,.3) 40%,transparent 70%)`;
        const streak = document.createElement('i');
        streak.style.cssText = `left:0;top:${y - 2}px;width:100%;height:4px;background:linear-gradient(90deg,transparent,rgba(255,140,60,.9) 35%,#fff 50%,rgba(255,90,20,.9) 65%,transparent);filter:blur(1.5px);transform-origin:${x}px 50%`;
        fx.append(flash, ring, streak);
        ring.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(8)', opacity: 0 }], { duration: 1200, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
        flash.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 700, easing: 'ease-out', fill: 'forwards' });
        streak.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 0.9, offset: 0.35 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 1000, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
        // Осколки летят вверх веером (взрыв у нижнего края) и опадают
        for (let i = 0; i < 46; i++) {
            const piece = document.createElement('i');
            const pill = i < 14;
            const w = pill ? 5 : 3 + Math.random() * 5;
            const h = pill ? 14 + Math.random() * 22 : w;
            const color = PALETTE[i % PALETTE.length];
            piece.style.cssText = `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;border-radius:${pill ? 3 : 50}px;background:${color};box-shadow:0 0 12px ${color}`;
            fx.append(piece);
            const angle = -Math.PI * (0.06 + Math.random() * 0.88);
            const distance = 160 + Math.random() * 460;
            const dx = Math.cos(angle) * distance * 1.25;
            const dy = Math.sin(angle) * distance;
            const spin = (Math.random() - 0.5) * 720;
            piece.animate(
                [
                    { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
                    { transform: `translate(${dx * 0.75}px,${dy}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.5 },
                    { transform: `translate(${dx}px,${dy * 0.55 + 60}px) rotate(${spin}deg) scale(.4)`, opacity: 0 },
                ],
                { duration: 1300 + Math.random() * 600, easing: 'cubic-bezier(.15,.75,.35,1)', fill: 'forwards' },
            );
        }
        // Круг взрыва открывает клиент: маленькая дыра в маске растёт масштабом слоя вокруг точки взрыва
        veil.style.setProperty('--x', x + 'px');
        veil.style.setProperty('--y', y + 'px');
        veil.classList.add('open');
        const far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 80;
        veil.animate([{ '--r': '0px' }, { '--r': far.toFixed(0) + 'px' }], { duration: 1500, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
    }

    window.introGo = () => {
        if (gone) return;
        gone = true;
        cancelAnimationFrame(barRaf);
        fill.animate([{ transform: fill.style.transform || 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 220, fill: 'forwards' });
        for (const part of [word, track]) part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 160, fill: 'forwards' });
        if (reduce) {
            document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
            return;
        }
        logo.classList.remove('idle');
        const box = logo.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        // Место плеера: нижний бар клиента, чуть левее центра, где кнопки управления
        const landX = Math.max(120, window.innerWidth * 0.5 - Math.min(260, window.innerWidth * 0.18));
        const landY = window.innerHeight - 26;
        const dx = landX - cx;
        const dy = landY - cy;
        let falling = true;
        // Сжатие с подлётом вверх, потом падение по дуге с разгоном и поворотом
        logo.animate(
            [
                { transform: 'translate(0,0) rotate(0deg) scale(1)', easing: 'cubic-bezier(.4,0,.2,1)' },
                { transform: 'translate(0,-34px) rotate(-6deg) scale(.4)', offset: 0.34, easing: 'cubic-bezier(.45,0,.75,.5)' },
                { transform: `translate(${dx * 0.45}px,${dy * 0.3}px) rotate(70deg) scale(.36)`, offset: 0.7, easing: 'cubic-bezier(.35,.1,.8,.65)' },
                { transform: `translate(${dx}px,${dy}px) rotate(200deg) scale(.28)` },
            ],
            { duration: 1900, fill: 'forwards' },
        ).finished.then(() => {
            falling = false;
            logo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
            explode(landX, landY);
        }).catch(() => {});
        // Искры за логотипом, пока он падает: с каждым кадром точки из его центра, чем быстрее летит, тем больше
        let last = { x: cx, y: cy };
        const started = window.performance.now();
        const trail = () => {
            if (!falling) return;
            const rect = logo.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const speed = Math.hypot(x - last.x, y - last.y);
            if (window.performance.now() - started > 380) {
                const count = Math.min(5, 1 + Math.floor(speed / 9));
                for (let i = 0; i < count; i++) {
                    const back = Math.atan2(last.y - y, last.x - x) + (Math.random() - 0.5) * 1.3;
                    const reach = 26 + Math.random() * 70;
                    spark(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14, Math.cos(back) * reach, Math.sin(back) * reach + 18, 2 + Math.random() * 4, 380 + Math.random() * 420);
                }
            }
            last = { x, y };
            window.requestAnimationFrame(trail);
        };
        window.requestAnimationFrame(trail);
    };
})();
