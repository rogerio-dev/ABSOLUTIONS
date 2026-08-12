import { useEffect, useRef, type ReactNode } from "react";

/**
 * Faz o conteúdo surgir ao entrar na tela. Começa visível no HTML do servidor
 * e só então recebe o estado inicial da animação no navegador — assim o texto
 * continua presente para buscadores e para quem tem JavaScript desativado.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "li" | "p";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    el.style.opacity = "0";
    el.style.transform = "translateY(26px)";
    el.style.transition = `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`;

    const observer = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            el.style.opacity = "1";
            el.style.transform = "none";
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.12 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  );
}
