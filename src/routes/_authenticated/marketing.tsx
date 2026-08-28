import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, FileText } from "lucide-react";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketing")({
  head: () => ({
    meta: [
      { title: "Marketing | AB Solutions" },
      {
        name: "description",
        content: "Logotipo, ícones, paleta e peças prontas da marca AB Solutions.",
      },
    ],
  }),
  component: Marketing,
});

/**
 * Central da marca.
 *
 * Os arquivos moram em public/, então o navegador baixa direto e o mesmo
 * endereço serve para mandar a uma gráfica sem dar acesso ao repositório.
 * Nada aqui é upload: tudo sai de `python marca/gerar-marca.py`, o que garante
 * que a peça mostrada é a mesma versionada.
 */

type Peca = {
  nome: string;
  arquivo: string;
  descricao: string;
  /** Como mostrar a miniatura: o fundo em que aquela versão foi feita para viver. */
  fundo: "escuro" | "claro" | "xadrez";
  svg?: boolean;
};

const LOGOS: Peca[] = [
  {
    nome: "Assinatura padrão",
    arquivo: "ab-solutions-fundo-escuro",
    descricao: "Sobre o azul-noite da marca ou qualquer fundo escuro.",
    fundo: "escuro",
    svg: true,
  },
  {
    nome: "Sobre fundo claro",
    arquivo: "ab-solutions-fundo-claro",
    descricao: "Ciano escurecido para manter contraste no branco.",
    fundo: "claro",
    svg: true,
  },
  {
    nome: "Uma cor: branco",
    arquivo: "ab-solutions-branco",
    descricao: "Sobre foto, cor chapada ou vídeo.",
    fundo: "escuro",
    svg: true,
  },
  {
    nome: "Uma cor: preto",
    arquivo: "ab-solutions-preto",
    descricao: "Gravação, carimbo, bordado, jornal.",
    fundo: "claro",
    svg: true,
  },
  {
    nome: "Empilhada, fundo escuro",
    arquivo: "ab-solutions-vertical-fundo-escuro",
    descricao: "Para espaço quadrado ou estreito.",
    fundo: "escuro",
    svg: true,
  },
  {
    nome: "Empilhada, fundo claro",
    arquivo: "ab-solutions-vertical-fundo-claro",
    descricao: "A mesma, sobre branco.",
    fundo: "claro",
    svg: true,
  },
  {
    nome: "Símbolo",
    arquivo: "simbolo-cor",
    descricao: "Avatar, marca d'água, carimbo.",
    fundo: "escuro",
    svg: true,
  },
  {
    nome: "Símbolo, fundo claro",
    arquivo: "simbolo-fundo-claro",
    descricao: "O losango sobre branco.",
    fundo: "claro",
    svg: true,
  },
];

const ICONES = [
  { nome: "favicon.svg", arquivo: "favicon/favicon.svg", onde: "Navegadores atuais" },
  { nome: "favicon.ico", arquivo: "favicon/favicon.ico", onde: "Windows, atalho, barra de tarefas" },
  { nome: "apple-touch-icon.png", arquivo: "favicon/apple-touch-icon.png", onde: "iPhone e iPad, 180 px" },
  { nome: "icone-192.png", arquivo: "favicon/icone-192.png", onde: "Android" },
  { nome: "icone-512.png", arquivo: "favicon/icone-512.png", onde: "Android, instalação como app" },
  {
    nome: "icone-maskable-512.png",
    arquivo: "favicon/icone-maskable-512.png",
    onde: "Android que recorta o ícone em círculo ou gota",
  },
];

const CORES = [
  { nome: "Ciano", hex: "#22D3EE", uso: "Destaque: traço do símbolo, Solutions, botões e links." },
  { nome: "Azul", hex: "#3B82F6", uso: "Secundária. Gradientes e apoio." },
  { nome: "Azul-noite", hex: "#060B18", uso: "Fundo. É o preto da marca — preto puro nunca é usado." },
  { nome: "Azul-profundo", hex: "#0E1730", uso: "Superfície. Cartões e blocos sobre o fundo." },
  { nome: "Branco-gelo", hex: "#E6EDF7", uso: "Texto sobre fundo escuro." },
  { nome: "Cinza-azulado", hex: "#9DB0C9", uso: "Texto secundário e legendas." },
];

const CORES_CLARO = [
  { nome: "Ciano escuro", hex: "#0E7490", uso: "O ciano da marca sobre branco." },
  { nome: "Tinta", hex: "#0B1220", uso: "Texto sobre branco." },
];

const PECAS_PRONTAS = [
  { nome: "Post: processo gratuito", arquivo: "post-processo-gratis.png", formato: "1080 × 1080" },
  { nome: "Story: processo gratuito", arquivo: "story-processo-gratis.png", formato: "1080 × 1920" },
  { nome: "Post: serviços", arquivo: "post-servicos.png", formato: "1080 × 1080" },
  { nome: "Capa do LinkedIn", arquivo: "capa-linkedin.png", formato: "1584 × 396" },
  { nome: "Foto de perfil", arquivo: "avatar-perfil.png", formato: "1024 × 1024" },
];

function Secao({
  titulo,
  ajuda,
  children,
}: {
  titulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      {ajuda && <p className="mb-4 mt-1 max-w-3xl text-sm text-muted-foreground">{ajuda}</p>}
      <div className={ajuda ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

function Baixar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

const FUNDOS: Record<Peca["fundo"], string> = {
  escuro: "bg-[#060b18]",
  claro: "bg-white",
  xadrez: "bg-muted",
};

function Marketing() {
  const { data: me, isLoading } = useMe();
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiado(hex);
      setTimeout(() => setCopiado((c) => (c === hex ? null : c)), 1600);
    } catch {
      toast.error("O navegador bloqueou a cópia. Selecione o código e copie na mão.");
    }
  };

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );

  return (
    <AppShell>
      <PageHeader
        title="Marketing"
        subtitle="Logotipo, ícones, paleta e peças prontas. Tudo pronto para baixar e mandar."
        action={
          <a
            href="/marca/manual-da-marca.png"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <FileText className="h-4 w-4" /> Manual da marca
          </a>
        }
      />

      <Secao
        titulo="Logotipo"
        ajuda="Prefira o SVG sempre que der: ele não perde qualidade em tamanho nenhum, de cartão de visita a fachada. As letras são curvas, não texto — o desenho fica igual mesmo em quem não tem a fonte Sora instalada."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {LOGOS.map((l) => (
            <div key={l.arquivo} className="panel overflow-hidden">
              <div className={cn("flex h-36 items-center justify-center p-6", FUNDOS[l.fundo])}>
                <img
                  src={`/marca/logo/${l.arquivo}.svg`}
                  alt={l.nome}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="border-t border-border p-4">
                <p className="text-sm font-medium">{l.nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{l.descricao}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Baixar href={`/marca/logo/${l.arquivo}.svg`}>SVG</Baixar>
                  <Baixar href={`/marca/logo/${l.arquivo}.png`}>PNG</Baixar>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao
        titulo="Paleta"
        ajuda="Clique em qualquer código para copiar."
      >
        <div className="grid gap-2 lg:grid-cols-2">
          {CORES.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => copiar(c.hex)}
              className="panel flex items-center gap-4 p-3 text-left transition-colors hover:border-primary/50"
            >
              <span
                className="h-11 w-11 shrink-0 rounded-lg border border-border"
                style={{ backgroundColor: c.hex }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{c.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.uso}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-primary">
                {c.hex}
                {copiado === c.hex ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 opacity-50" />
                )}
              </span>
            </button>
          ))}
        </div>

        <p className="mb-2 mt-5 text-sm text-muted-foreground">
          Sobre fundo branco o ciano da marca some. Use estas no lugar:
        </p>
        <div className="grid gap-2 lg:grid-cols-2">
          {CORES_CLARO.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => copiar(c.hex)}
              className="panel flex items-center gap-4 p-3 text-left transition-colors hover:border-primary/50"
            >
              <span
                className="h-11 w-11 shrink-0 rounded-lg border border-border"
                style={{ backgroundColor: c.hex }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{c.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.uso}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs text-primary">
                {c.hex}
                {copiado === c.hex ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 opacity-50" />
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Baixar href="/marca/paleta/paleta.png">Cartela em PNG</Baixar>
          <Baixar href="/marca/paleta/paleta.txt">Texto</Baixar>
          <Baixar href="/marca/paleta/paleta.css">CSS</Baixar>
          <Baixar href="/marca/paleta/paleta.json">JSON</Baixar>
        </div>
      </Secao>

      <Secao
        titulo="Peças prontas"
        ajuda="Para publicar como estão. Se um texto precisar mudar, é no gerador — assim nenhuma versão diverge das outras."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PECAS_PRONTAS.map((p) => (
            <div key={p.arquivo} className="panel overflow-hidden">
              <div className="flex h-44 items-center justify-center bg-[#060b18] p-4">
                {/*
                  h-full em vez de max-h-full: sem altura própria, a imagem
                  ainda não carregada colapsa para zero, nunca entra no campo de
                  visão e o loading="lazy" jamais dispara — a peça ficava em
                  branco para sempre.
                */}
                <img
                  src={`/marketing/${p.arquivo}`}
                  alt={p.nome}
                  loading="lazy"
                  className="h-full w-full rounded object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">{p.formato}</p>
                </div>
                <Baixar href={`/marketing/${p.arquivo}`}>PNG</Baixar>
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Ícones do site e do aplicativo">
        <div className="panel divide-y divide-border">
          {ICONES.map((i) => (
            <div key={i.arquivo} className="flex flex-wrap items-center gap-4 p-3">
              <img src={`/marca/favicon/favicon.svg`} alt="" className="h-8 w-8 rounded" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{i.nome}</p>
                <p className="text-xs text-muted-foreground">{i.onde}</p>
              </div>
              <Baixar href={`/marca/${i.arquivo}`}>Baixar</Baixar>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Tipografia">
        <div className="panel p-5">
          <p style={{ fontFamily: "Sora, sans-serif" }} className="text-2xl font-extrabold">
            Sora — títulos
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pesos 700 e 800. É a fonte do logotipo e de todo título.
          </p>
          <p className="mt-4 text-base">Inter — corpo de texto</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pesos 400 e 600. Parágrafos, tabelas, interface.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            As duas são gratuitas no Google Fonts. Quem for montar uma apresentação ou proposta baixa
            de lá e usa sem custo.
          </p>
        </div>
      </Secao>

      <p className="text-xs text-muted-foreground">
        Todo o material sai de um gerador só (<code className="font-mono">marca/gerar-marca.py</code>
        ). Nada aqui é upload manual — é o que garante que a peça baixada é exatamente a versionada,
        e que trocar uma cor não deixa uma versão para trás.
      </p>
    </AppShell>
  );
}
