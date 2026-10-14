import { useCallback, useRef } from 'react';

/**
 * 3D tilt / magnetic hover card.
 * Attach the returned handlers to a wrapping element; the element gently
 * rotates toward the pointer and snaps back on leave.
 */
export function useTilt<T extends HTMLElement>(max = 5) {
    const ref = useRef<T | null>(null);

    const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = 'perspective(900px) rotateX(' + (-py * max).toFixed(2) + 'deg) rotateY(' + (px * max).toFixed(2) + 'deg) translateY(-2px)';
        el.style.transition = 'transform 0.08s ease';
    }, [max]);

    const onPointerLeave = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.transform = '';
        el.style.transition = 'transform 0.3s ease';
    }, []);

    return { ref, onPointerMove, onPointerLeave };
}
