import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type Sugestao = { email: string; nome: string; origem: string };

/** Encontra os e-mails mencionados num texto. */
export const EMAIL_MENCIONADO = /@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function extrairMencoes(texto: string): string[] {
  const achados = [...texto.matchAll(EMAIL_MENCIONADO)]
    .map((m) => m[1]?.toLowerCase())
    .filter((e): e is string => !!e);
  return [...new Set(achados)];
}

/**
 * Campo de texto com autocompletar de menção.
 * Digitar "@" abre a lista; também aceita e-mail digitado por inteiro, para
 * mencionar quem ainda não está na plataforma.
 */
export function MentionTextarea({
  value,
  onChange,
  sugestoes,
  placeholder,
  disabled,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  sugestoes: Sugestao[];
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const [busca, setBusca] = useState<{ termo: string; inicio: number } | null>(null);
  const [destacado, setDestacado] = useState(0);
  // O campo costuma ficar no rodapé do painel; abrir para baixo jogaria a
  // lista para fora da tela. Decidimos o lado pelo espaço disponível.
  const [paraCima, setParaCima] = useState(true);

  const filtradas = useMemo(() => {
    if (!busca) return [];
    const t = busca.termo.toLowerCase();
    return sugestoes
      .filter((s) => s.email.toLowerCase().includes(t) || s.nome.toLowerCase().includes(t))
      .slice(0, 30);
  }, [busca, sugestoes]);

  useEffect(() => setDestacado(0), [busca?.termo]);

  // Escolhe o lado ao abrir: se não couber embaixo, abre para cima.
  useEffect(() => {
    if (!busca || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom;
    setParaCima(abaixo < 240 && r.top > abaixo);
  }, [busca?.termo, busca?.inicio]);

  // Mantém o item destacado visível ao navegar pelo teclado.
  useEffect(() => {
    listaRef.current?.children[destacado]?.scrollIntoView({ block: "nearest" });
  }, [destacado]);

  function aoDigitar(texto: string, cursor: number) {
    onChange(texto);
    // Procura um "@" iniciando a palavra em que o cursor está
    const antes = texto.slice(0, cursor);
    const m = antes.match(/(?:^|\s)@([^\s@]*)$/);
    const termo = m?.[1];
    setBusca(termo === undefined ? null : { termo, inicio: cursor - termo.length - 1 });
  }

  function escolher(s: Sugestao) {
    if (!busca) return;
    const antes = value.slice(0, busca.inicio);
    const depois = value.slice(busca.inicio + busca.termo.length + 1);
    const novo = `${antes}@${s.email} ${depois.replace(/^\s/, "")}`;
    onChange(novo);
    setBusca(null);
    requestAnimationFrame(() => {
      const pos = antes.length + s.email.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => aoDigitar(e.target.value, e.target.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (busca && filtradas.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setDestacado((i) => (i + 1) % filtradas.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setDestacado((i) => (i - 1 + filtradas.length) % filtradas.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const alvo = filtradas[destacado];
              if (alvo) escolher(alvo);
              return;
            }
            if (e.key === "Escape") {
              setBusca(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />

      {busca && filtradas.length > 0 && (
        <ul
          ref={listaRef}
          className={cn(
            "absolute z-50 max-h-60 w-full overflow-y-auto overscroll-contain rounded-md border border-border bg-popover shadow-lg",
            paraCima ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {filtradas.map((s, i) => (
            <li key={s.email}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(s);
                }}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                  i === destacado ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="truncate">
                  <span className="font-medium">{s.nome}</span>{" "}
                  <span className="text-muted-foreground">{s.email}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{s.origem}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {busca && filtradas.length === 0 && busca.termo.length > 0 && (
        <p
          className={cn(
            "absolute z-50 w-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg",
            paraCima ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {busca.termo.includes("@")
            ? "Continue digitando o e-mail completo para convidar alguém de fora."
            : "Ninguém encontrado. Digite o e-mail completo para convidar."}
        </p>
      )}
    </div>
  );
}

/** Renderiza o texto do comentário destacando as menções. */
export function TextoComMencoes({ texto }: { texto: string }) {
  const partes = texto.split(EMAIL_MENCIONADO);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-primary/15 px-1 font-medium text-primary">
            @{p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}
