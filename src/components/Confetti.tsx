import { useEffect, useRef } from "react";

/**
 * One-shot canvas confetti for the board-complete celebration. Burst once
 * on mount, then auto-stops when every particle has settled or faded.
 *
 * Deliberately lightweight: ~80 particles, ~1.6s lifetime, single rAF
 * loop. Skips entirely when the user prefers reduced motion.
 *
 * `tint` colors the burst to the color the player just completed; passing
 * undefined uses a rainbow palette.
 */
export function Confetti({ tint, count = 80 }: { tint?: string; count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const palette = tint
      ? [tint, shade(tint, 0.85), shade(tint, 1.15), "#ffffff"]
      : ["#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#0a84ff", "#bf5af2", "#ff375f"];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      angle: number;
      spin: number;
      color: string;
      shape: "rect" | "ribbon";
      age: number;
      life: number;
    }

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.18,
      vx: (Math.random() - 0.5) * 7.5,
      vy: -6 - Math.random() * 5,
      r: 3 + Math.random() * 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.34,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: Math.random() > 0.45 ? "rect" : "ribbon",
      age: 0,
      life: 1500 + Math.random() * 500,
    }));

    let raf = 0;
    let lastTs = performance.now();
    const start = lastTs;

    const draw = (ts: number) => {
      const dt = ts - lastTs;
      lastTs = ts;
      const elapsed = ts - start;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.age += dt;
        if (p.age > p.life) continue;
        p.vy += 0.32 * (dt / 16.67); // gravity, normalized to ~60fps tick
        p.vx *= 0.992;
        p.x += p.vx * (dt / 16.67);
        p.y += p.vy * (dt / 16.67);
        p.angle += p.spin * (dt / 16.67);
        const fade = 1 - p.age / p.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        } else {
          ctx.fillRect(-p.r * 1.4, -1.5, p.r * 2.8, 3);
        }
        ctx.restore();
      }

      if (elapsed < 2200) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, [tint, count]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 45,
      }}
    />
  );
}

/** Multiply a hex color's RGB by a factor, clamped to 0–255. */
function shade(hex: string, factor: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const r = Math.min(255, Math.max(0, parseInt(n.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.max(0, parseInt(n.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.max(0, parseInt(n.slice(4, 6), 16) * factor));
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
