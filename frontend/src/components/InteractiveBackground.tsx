import React, { useEffect, useRef } from 'react';

type Palette = { dots: string[]; lines: string; blob: [number, number, number, number][]; glow: string };

const PALETTES: Record<string, Palette> = {
    light: {
        // 亮色背景：靛蓝 / 琥珀，比之前更明显但仍优雅
        dots: ['67, 86, 199', '99, 102, 241', '139, 92, 246', '185, 130, 46', '217, 119, 6'],
        lines: 'rgba(99, 102, 241, 0.10)',
        blob: [
            [67, 86, 199, 0.16],
            [139, 92, 246, 0.12],
            [185, 130, 46, 0.15],
            [99, 102, 241, 0.10],
        ],
        glow: 'rgba(255, 255, 255, 0.20)',
    },
    dark: {
        // 深色背景：霓虹靛紫 / 琥珀 / 青，粒子明亮、流动清晰
        dots: ['129, 140, 248', '165, 180, 252', '196, 181, 253', '251, 191, 36', '94, 234, 212'],
        lines: 'rgba(129, 140, 248, 0.20)',
        blob: [
            [99, 102, 241, 0.22],
            [139, 92, 246, 0.16],
            [217, 119, 6, 0.14],
            [45, 212, 191, 0.10],
        ],
        glow: 'rgba(196, 181, 253, 0.28)',
    },
};

const readTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/**
 * 登录/注册页互动背景（canvas）：
 * - 流动的液态光斑（gradient blobs，主题感知、色深明显）
 * - 明亮闪烁的星点粒子，按主题取色（深色下霓虹靛/紫/琥珀/青）
 * - 粒子间临近连线，形成“流动网格”质感
 * - 指针吸引/驱散 + 光晕跟随；鼠标不动时粒子仍持续漂移
 * prefers-reduced-motion 时只保留缓慢光斑。
 */
const InteractiveBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let w = 0;
        let h = 0;
        let raf = 0;
        let last = performance.now();
        let theme = readTheme();
        let palette: Palette = PALETTES[theme];

        const pointer = { x: -9999, y: -9999, active: false, vx: 0, vy: 0, lastX: -9999, lastY: -9999, lastT: 0 };

        // 主题切换即时跟随（ThemeContext 切 data-theme 时生效）
        const themeObserver =
            typeof MutationObserver !== 'undefined'
                ? new MutationObserver(() => {
                      const next = readTheme();
                      if (next !== theme) {
                          theme = next;
                          palette = PALETTES[theme];
                      }
                  })
                : null;
        themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        const N = reduced ? 26 : 118;
        const parts = Array.from({ length: N }, (_, i) => {
            // 少数“高速流动”粒子制造明显动感
            const fast = Math.random() < 0.16;
            const speedBase = fast ? 0.14 + Math.random() * 0.1 : 0.042 + Math.random() * 0.055;
            const angle = Math.random() * Math.PI * 2;
            const directionBias = Math.random();
            let vx = Math.cos(angle) * speedBase;
            let vy = Math.sin(angle) * speedBase;
            if (directionBias < 0.22) {
                // 明显右向横流，强化“流动感”
                vx = Math.abs(vx) * 0.7 + speedBase * 0.6;
                vy = vy * 0.55;
            } else if (directionBias > 0.92) {
                vx = -Math.abs(vx) * 0.7 - speedBase * 0.5;
            }
            return {
                x: Math.random(),
                y: Math.random(),
                // 尾迹起点的初始值
                px: Math.random(),
                py: Math.random(),
                r: fast ? 2.2 + Math.random() * 2.6 : 1.2 + Math.random() * 2.0,
                colorIdx: Math.floor(Math.random() * PALETTES.dark.dots.length),
                // 权重：靛紫为主、琥珀次之、青色点缀
                weight: Math.random(),
                vx,
                vy,
                twinkle: 0.6 + Math.random() * 2.2,
                phase: Math.random() * Math.PI * 2,
                baseA: fast ? 0.65 + Math.random() * 0.3 : 0.42 + Math.random() * 0.4,
                glow: fast || Math.random() < 0.18,
            };
        });

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            w = Math.max(1, Math.round(rect.width));
            h = Math.max(1, Math.round(rect.height));
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        // 布局完成后再校准一次（避免挂载时 clientWidth=0 导致画布 1x1）
        const rafResize = requestAnimationFrame(resize);
        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => resize());
            observer.observe(canvas);
        }
        window.addEventListener('resize', resize);

        const onMove = (e: PointerEvent) => {
            const now = performance.now();
            if (pointer.lastX > -9999 && pointer.lastT > 0) {
                const dx = e.clientX - pointer.lastX;
                const dy = e.clientY - pointer.lastY;
                const ddt = Math.max(8, now - pointer.lastT);
                pointer.vx = (dx / ddt) * 16.6;
                pointer.vy = (dy / ddt) * 16.6;
            }
            pointer.lastX = e.clientX;
            pointer.lastY = e.clientY;
            pointer.lastT = now;
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            pointer.active = true;
        };
        const onLeave = () => {
            pointer.active = false;
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerleave', onLeave);

        let lastPaint = performance.now();

        const draw = (now: number) => {
            // 先预约下一帧：即使本帧中途出现异常，动画链也绝不中断
            raf = requestAnimationFrame(draw);
            const dt = Math.min(40, now - last);
            last = now;
            lastPaint = now;
            const t = now;
            try {
            if (w <= 1 || h <= 1) {
                resize();
                return;
            }

            ctx.clearRect(0, 0, w, h);

            // --- 流动液态光斑 ---
            const blobDefs: [number, number, number, number][] = palette.blob;
            const blobs = [
                { cx: 0.22 + Math.sin(t * 0.00016) * 0.13, cy: 0.26 + Math.cos(t * 0.0002) * 0.16, r: 0.72, i: 0 },
                { cx: 0.8 + Math.cos(t * 0.00014) * 0.12, cy: 0.34 + Math.sin(t * 0.00018) * 0.18, r: 0.6, i: 1 },
                { cx: 0.6 + Math.sin(t * 0.00012) * 0.16, cy: 0.9 + Math.cos(t * 0.00011) * 0.12, r: 0.68, i: 2 },
                { cx: 0.12 + Math.cos(t * 0.0001) * 0.1, cy: 0.7 + Math.sin(t * 0.00013) * 0.14, r: 0.55, i: 3 },
            ];
            for (const b of blobs) {
                const c = blobDefs[b.i % blobDefs.length];
                const x = b.cx * w;
                const y = b.cy * h;
                const r = b.r * Math.max(w, h);
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`);
                g.addColorStop(0.55, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] * 0.45})`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
            }

            if (reduced) {
                return;
            }

            // --- 粒子位移 ---
            for (const p of parts) {
                p.px = p.x;
                p.py = p.y;
                p.x += (p.vx * dt) / 1000;
                p.y += (p.vy * dt) / 1000;

                // 指针驱散（越近推得越明显）
                if (pointer.active) {
                    const dxp = p.x * w - pointer.x;
                    const dyp = p.y * h - pointer.y;
                    const dist = Math.hypot(dxp, dyp);
                    if (dist < 170 && dist > 0.01) {
                        const f = ((170 - dist) / 170) * 1.35 * (dt / 16);
                        p.x += (dxp / dist) * (f / w) * 14;
                        p.y += (dyp / dist) * (f / h) * 14;
                        // 高速扫过时带起尾流
                        const sp = Math.hypot(pointer.vx, pointer.vy);
                        if (sp > 30) {
                            p.vx += (dxp / dist) * 0.0006 * (sp / 60);
                            p.vy += (dyp / dist) * 0.0006 * (sp / 60);
                        }
                    }
                }

                // 轻微自转回流，避免直线漂移太“僵”
                p.vx += Math.sin(t * 0.0004 + p.phase) * 0.000004 * dt * 2;
                p.vy += Math.cos(t * 0.00035 + p.phase * 1.7) * 0.000004 * dt * 2;

                // 边界：先反弹后限速
                if (p.x < 0.005 || p.x > 0.995) p.vx *= -1;
                if (p.y < 0.005 || p.y > 0.995) p.vy *= -1;
                const maxS = 0.42;
                const s = Math.hypot(p.vx, p.vy);
                if (s > maxS) {
                    p.vx = (p.vx / s) * maxS;
                    p.vy = (p.vy / s) * maxS;
                }
                p.x = Math.max(0.002, Math.min(0.998, p.x));
                p.y = Math.max(0.002, Math.min(0.998, p.y));

                // 能量保险：极低速/被边界“困住”的粒子随时补充动量
                if (Math.hypot(p.vx, p.vy) < 0.006) {
                    const ra = Math.random() * Math.PI * 2;
                    const rs = 0.05 + Math.random() * 0.08;
                    p.vx = Math.cos(ra) * rs + 0.07;
                    p.vy = Math.sin(ra) * rs;
                }
            }

            const LINK_MAX = 118;
            const linkMaxSq = LINK_MAX * LINK_MAX;

            ctx.globalCompositeOperation = 'lighter';

            // --- 临近连线（暗色下霓虹网格 / 亮色下淡墨蓝） ---
            ctx.lineWidth = 1;
            for (let i = 0; i < parts.length; i++) {
                const a = parts[i];
                const ax = a.x * w;
                const ay = a.y * h;
                for (let j = i + 1; j < parts.length; j++) {
                    const b = parts[j];
                    const dx = ax - b.x * w;
                    const dy = ay - b.y * h;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < linkMaxSq) {
                        const alpha = (1 - Math.sqrt(d2) / LINK_MAX) * 0.5;
                        ctx.strokeStyle = theme === 'dark' ? `rgba(129, 140, 248, ${(alpha * 0.34).toFixed(3)})` : `rgba(99, 102, 241, ${(alpha * 0.22).toFixed(3)})`;
                        ctx.beginPath();
                        ctx.moveTo(ax, ay);
                        ctx.lineTo(b.x * w, b.y * h);
                        ctx.stroke();
                    }
                }
            }

            // --- 彗星尾迹（速度越快尾巴越长，强化流动感） ---
            const dots0 = palette.dots;
            ctx.lineCap = 'round';
            for (const p of parts) {
                const ax0 = p.px * w;
                const ay0 = p.py * h;
                const ax1 = p.x * w;
                const ay1 = p.y * h;
                const sp = Math.hypot(p.vx, p.vy);
                if (sp < 0.008) continue;
                // 让尾部与运动方向一致
                const len = Math.min(sp * 0.22, 0.9); // 视口比例
                const ux = (ax1 - ax0) / Math.max(1e-4, Math.hypot(ax1 - ax0, ay1 - ay0));
                const uy = (ay1 - ay0) / Math.max(1e-4, Math.hypot(ax1 - ax0, ay1 - ay0));
                const tx = ax1 - ux * len * Math.min(w, h);
                const ty = ay1 - uy * len * Math.min(w, h);
                let ci = p.colorIdx;
                if (p.weight > 0.94) ci = dots0.length - 1;
                else if (p.weight > 0.62) ci = p.weight > 0.84 ? 3 : 2;
                else ci = p.weight > 0.42 ? 1 : 0;
                ci = ci % dots0.length;
                const aA = p.baseA * (0.35 + 0.3 * Math.min(1, sp / 0.22));
                const g = ctx.createLinearGradient(tx, ty, ax1, ay1);
                g.addColorStop(0, 'rgba(' + dots0[ci] + ', 0)');
                g.addColorStop(1, 'rgba(' + dots0[ci] + ', ' + aA.toFixed(3) + ')');
                ctx.strokeStyle = g;
                ctx.lineWidth = Math.max(0.6, p.r * 0.55);
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(ax1, ay1);
                ctx.stroke();
            }

            // --- 星点粒子 ---
            const dots = palette.dots;
            for (const p of parts) {
                // 颜色按权重偏向 靛/紫（idx0-1），琥珀 idx2-3，青 idx4
                let ci = p.colorIdx;
                if (p.weight > 0.94) ci = dots.length - 1; // 青色点缀
                else if (p.weight > 0.62) ci = p.weight > 0.84 ? 3 : 2; // 琥珀
                else ci = p.weight > 0.42 ? 1 : 0; // 靛紫
                ci = ci % dots.length;

                const tw = 0.55 + 0.45 * Math.sin(t * 0.001 * p.twinkle + p.phase);
                const alpha = p.baseA * tw;

                const px = p.x * w;
                const py = p.y * h;
                const rgb = dots[ci];

                // 光晕粒子额外一圈辉光
                if (p.glow) {
                    const gr = p.r * 3.2;
                    const g = ctx.createRadialGradient(px, py, 0, px, py, gr);
                    g.addColorStop(0, `rgba(${rgb}, ${(alpha * 0.5).toFixed(3)})`);
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(px, py, gr, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(px, py, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
                ctx.fill();
            }

            // --- 指针光晕（颜色跟随主题） ---
            if (pointer.active) {
                const R = 230;
                const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, R);
                g.addColorStop(0, palette.glow);
                g.addColorStop(0.4, palette.glow.replace(/\)$/, ', 0.08)'));
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(pointer.x - R, pointer.y - R, R * 2, R * 2);
            }

            ctx.globalCompositeOperation = 'source-over';
            } catch (err) {
                // 防御：任何单帧异常都不允许杀死动画（下一帧已预约）
                console.warn('[interactive-bg] frame error', err);
            }
        };

        raf = requestAnimationFrame(draw);

        // 看门狗：rAF 因后台节流/冻结/异常而停摆时自动复活动画
        const kick = () => {
            cancelAnimationFrame(raf);
            last = performance.now();
            lastPaint = performance.now();
            raf = requestAnimationFrame(draw);
        };
        const watchdog = window.setInterval(() => {
            if (performance.now() - lastPaint > 1500) kick();
        }, 1000);
        const onVis = () => {
            if (!document.hidden && performance.now() - lastPaint > 800) kick();
        };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            cancelAnimationFrame(raf);
            cancelAnimationFrame(rafResize);
            window.clearInterval(watchdog);
            document.removeEventListener('visibilitychange', onVis);
            observer?.disconnect();
            themeObserver?.disconnect();
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerleave', onLeave);
        };
    }, []);

    return <canvas ref={canvasRef} className="interactive-bg" aria-hidden="true" />;
};

export default InteractiveBackground;
