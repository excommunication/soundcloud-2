// Заставка запуска. main зовёт window.introGo(), когда сайт готов: логотип приседает, его подбрасывает, и он
// взрывается; круг взрыва открывает клиент под заставкой. После этого main убирает вид
(() => {
    const logo = document.getElementById('logo');
    const veil = document.getElementById('veil');
    const fx = document.getElementById('fx');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spring = 'cubic-bezier(.34,1.56,.64,1)';
    const bars = [...document.querySelectorAll('.bars rect')];
    const cloud = document.querySelector('.cloud');
    let gone = false;

    // Сборка: столбики эквалайзера вырастают по очереди, облако мягко проявляется, потом столбики «дышат»
    if (reduce) {
        for (const bar of bars) bar.style.transform = 'none';
        cloud.style.opacity = '1';
    } else {
        logo.animate([{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, easing: spring, fill: 'both' });
        bars.forEach((bar, i) =>
            bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 520, delay: 80 + i * 55, easing: spring, fill: 'forwards' }),
        );
        cloud
            .animate([{ opacity: 0, transform: 'translateY(10px) scale(.86)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 420, easing: spring, fill: 'forwards' })
            .finished.then(() => {
                if (gone) return;
                for (const bar of bars) {
                    bar.getAnimations().forEach((animation) => animation.cancel());
                    bar.style.transform = 'none';
                }
                logo.classList.add('idle');
            })
            .catch(() => {});
    }

    const PALETTE = ['#ffffff', '#ffffff', '#9db4ff', '#c9a8ff', '#7fe3ff', '#ffb3e6'];
    function explode(x, y) {
        // Кольцо ударной волны и вспышка
        const ring = document.createElement('i');
        ring.style.cssText = `left:${x - 60}px;top:${y - 60}px;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,.85);box-shadow:0 0 40px rgba(160,190,255,.6)`;
        const flash = document.createElement('i');
        flash.style.cssText = `left:${x - 160}px;top:${y - 160}px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.9),rgba(170,190,255,.25) 40%,transparent 70%)`;
        fx.append(flash, ring);
        ring.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(7)', opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
        flash.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
        // Осколки: столбики логотипа и искры разлетаются дугой с лёгкой гравитацией
        for (let i = 0; i < 34; i++) {
            const piece = document.createElement('i');
            const pill = i < 12;
            const w = pill ? 5 : 3 + Math.random() * 5;
            const h = pill ? 14 + Math.random() * 22 : w;
            const color = PALETTE[i % PALETTE.length];
            piece.style.cssText = `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;border-radius:${pill ? 3 : 50}px;background:${color};box-shadow:0 0 12px ${color}`;
            fx.append(piece);
            const angle = Math.random() * Math.PI * 2;
            const distance = 140 + Math.random() * 360;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            const spin = (Math.random() - 0.5) * 720;
            piece.animate(
                [
                    { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
                    { transform: `translate(${dx * 0.7}px,${dy * 0.7}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${dx}px,${dy + 120}px) rotate(${spin}deg) scale(.4)`, opacity: 0 },
                ],
                { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(.15,.75,.35,1)', fill: 'forwards' },
            );
        }
        // Круг взрыва открывает клиент
        veil.style.setProperty('--x', x + 'px');
        veil.style.setProperty('--y', y + 'px');
        const far = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 120;
        veil.animate([{ '--r': '0px' }, { '--r': far + 'px' }], { duration: 900, easing: 'cubic-bezier(.6,0,.25,1)', fill: 'forwards' });
    }

    window.introGo = () => {
        if (gone) return;
        gone = true;
        if (reduce) {
            document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
            return;
        }
        logo.classList.remove('idle');
        const box = logo.getBoundingClientRect();
        const lift = Math.min(110, window.innerHeight * 0.14);
        // Приседание, бросок вверх с поворотом, в верхней точке взрыв
        logo.animate(
            [
                { transform: 'translate(0,0) rotate(0deg) scale(1,1)' },
                { transform: 'translate(0,8px) rotate(2deg) scale(1.08,.88)', offset: 0.35 },
                { transform: `translate(26px,${-lift * 0.75}px) rotate(-9deg) scale(.94,1.08)`, offset: 0.75 },
                { transform: `translate(38px,${-lift}px) rotate(-13deg) scale(1.02,1)` },
            ],
            { duration: 620, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' },
        ).finished.then(() => {
            const x = box.left + box.width / 2 + 38;
            const y = box.top + box.height / 2 - lift;
            logo.animate(
                [
                    { transform: `translate(38px,${-lift}px) rotate(-13deg) scale(1)`, opacity: 1, filter: 'blur(0)' },
                    { transform: `translate(38px,${-lift}px) rotate(-13deg) scale(1.7)`, opacity: 0, filter: 'blur(10px)' },
                ],
                { duration: 240, easing: 'ease-out', fill: 'forwards' },
            );
            explode(x, y);
        }).catch(() => {});
    };
})();
