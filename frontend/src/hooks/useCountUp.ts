import { useEffect, useState } from 'react';

/**
 * Animate a number from 0 to `target` with an ease-out cubic curve.
 */
export function useCountUp(target: number, duration = 1200) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        const start = performance.now();
        let raf = 0;
        const from = 0;
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setValue(Math.round(from + (target - from) * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
            else setValue(target);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return value;
}
