import { useEffect, useRef } from "react";

/**
 * Rede de partículas do topo do site. Todo o desenho acontece dentro do
 * useEffect porque a aplicação renderiza no servidor, onde canvas não existe.
 */
export function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const DIST = 130;
    let particulas: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const mouse: { x: number | null; y: number | null } = { x: null, y: null };
    let frame = 0;

    function redimensionar() {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * DPR;
      canvas!.height = rect.height * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);

      const total = Math.min(90, Math.floor((rect.width * rect.height) / 16000));
      particulas = Array.from({ length: total }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.6,
      }));
    }

    function desenhar() {
      const w = canvas!.width / DPR;
      const h = canvas!.height / DPR;
      ctx!.clearRect(0, 0, w, h);

      for (let i = 0; i < particulas.length; i++) {
        const p = particulas[i];
        if (!p) continue;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(34, 211, 238, 0.55)";
        ctx!.fill();

        for (let j = i + 1; j < particulas.length; j++) {
          const q = particulas[j];
          if (!q) continue;
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < DIST) {
            ctx!.beginPath();
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(q.x, q.y);
            ctx!.strokeStyle = `rgba(59, 130, 246, ${0.16 * (1 - d / DIST)})`;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }

        if (mouse.x !== null && mouse.y !== null) {
          const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          const limite = DIST * 1.2;
          if (d < limite) {
            ctx!.beginPath();
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(mouse.x, mouse.y);
            ctx!.strokeStyle = `rgba(34, 211, 238, ${0.22 * (1 - d / limite)})`;
            ctx!.lineWidth = 1;
            ctx!.stroke();
          }
        }
      }
      frame = requestAnimationFrame(desenhar);
    }

    const pai = canvas.parentElement;
    function moverMouse(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }
    function sairMouse() {
      mouse.x = null;
      mouse.y = null;
    }

    pai?.addEventListener("mousemove", moverMouse);
    pai?.addEventListener("mouseleave", sairMouse);
    window.addEventListener("resize", redimensionar);

    redimensionar();
    desenhar();

    return () => {
      cancelAnimationFrame(frame);
      pai?.removeEventListener("mousemove", moverMouse);
      pai?.removeEventListener("mouseleave", sairMouse);
      window.removeEventListener("resize", redimensionar);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
