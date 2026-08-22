import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Send } from "lucide-react";
import { STATUS_DE_ENVIO, pontoStatus, type StatusDeEnvioId } from "@/lib/suporte";
import { cn } from "@/lib/utils";

/**
 * Botão dividido: envia a resposta e decide, no mesmo gesto, de quem passa a
 * ser a bola.
 *
 * Separar as duas coisas — mandar a resposta e depois lembrar de mexer no
 * status — é como chamado fica marcado como aberto durante uma semana esperando
 * o cliente. Aqui o status é parte do envio, e o rótulo do botão diz em voz alta
 * o que vai acontecer.
 */
export function EnviarComStatus({
  valor,
  aoMudar,
  aoEnviar,
  desabilitado,
  enviando,
}: {
  valor: StatusDeEnvioId;
  aoMudar: (v: StatusDeEnvioId) => void;
  aoEnviar: () => void;
  desabilitado?: boolean;
  enviando?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou no Esc: um menu preso na tela atrapalha mais do que
  // ajuda, ainda mais colado no rodapé do formulário.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const atual = STATUS_DE_ENVIO.find((s) => s.id === valor) ?? STATUS_DE_ENVIO[0];

  return (
    <div ref={caixa} className="relative">
      <div className="flex">
        <button
          type="button"
          disabled={desabilitado || enviando}
          onClick={aoEnviar}
          className="inline-flex h-9 items-center gap-2 rounded-l-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span>
            {enviando ? "Enviando" : "Enviar como"} <strong className="font-bold">{atual.label}</strong>
          </span>
        </button>
        <button
          type="button"
          aria-label="Escolher a situação do chamado"
          aria-expanded={aberto}
          disabled={desabilitado || enviando}
          onClick={() => setAberto((v) => !v)}
          className="inline-flex h-9 items-center rounded-r-md border-l border-primary-foreground/20 bg-primary px-2 text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronUp className={cn("h-4 w-4 transition-transform", !aberto && "rotate-180")} />
        </button>
      </div>

      {aberto && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
          {STATUS_DE_ENVIO.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                aoMudar(s.id);
                setAberto(false);
              }}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                s.id === valor && "bg-accent/60",
              )}
            >
              <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm", pontoStatus(s.id))} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {s.label}
                  {s.id === valor && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{s.ajuda}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground/70">{s.sla}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
