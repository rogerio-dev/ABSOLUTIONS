import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileSignature, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMe } from "@/lib/auth";
import { brl, d } from "@/lib/crm";
import {
  CONTA_HORAS,
  ENCERRADOS,
  MODALIDADES,
  SITUACOES,
  avaliarVigencia,
  corModalidade,
  corSituacao,
  horas,
  rotuloModalidade,
  rotuloSituacao,
  type ModalidadeId,
} from "@/lib/contratos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos | AB Solutions CRM" },
      { name: "description", content: "Contratos de consultoria TOTVS Fluig, vigências e valores." },
    ],
  }),
  component: Contratos,
});

type Contrato = {
  id: string;
  numero: string | null;
  titulo: string;
  modalidade: string;
  situacao: string;
  valor: number | null;
  valor_mensal: number | null;
  valor_hora: number | null;
  horas_mensais: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  prazo_indeterminado: boolean;
  renovacao_automatica: boolean;
  aviso_previo_dias: number | null;
  produtos: string[];
  clients: { id: string; nome: string } | null;
};

function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** O que o contrato vale por mês, na medida que a modalidade usa. */
function valorDeReferencia(c: Contrato): string {
  if (c.valor_mensal) return `${brl(Number(c.valor_mensal))}/mês`;
  if (c.modalidade === "projeto" && c.valor) return brl(Number(c.valor));
  if (c.valor_hora) return `${brl(Number(c.valor_hora))}/hora`;
  return c.valor ? brl(Number(c.valor)) : "—";
}

function Contratos() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("vigentes");
  const [modalidade, setModalidade] = useState<string>("todas");
  const [criando, setCriando] = useState(false);

  const { data: contratos, isLoading: carregando } = useQuery({
    queryKey: ["contratos"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(
          "id, numero, titulo, modalidade, situacao, valor, valor_mensal, valor_hora, horas_mensais, data_inicio, data_fim, prazo_indeterminado, renovacao_automatica, aviso_previo_dias, produtos, clients(id, nome)",
        )
        .order("data_inicio", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Contrato[];
    },
  });

  const visiveis = useMemo(() => {
    let lista = contratos ?? [];
    if (filtro === "vigentes") lista = lista.filter((c) => !ENCERRADOS.includes(c.situacao));
    else if (filtro === "atencao")
      lista = lista.filter((c) => {
        const v = avaliarVigencia(c);
        return v.situacao === "vencido" || v.situacao === "aviso_vencendo" || v.situacao === "renova_sozinho";
      });
    else if (filtro !== "todos") lista = lista.filter((c) => c.situacao === filtro);

    if (modalidade !== "todas") lista = lista.filter((c) => c.modalidade === modalidade);

    if (busca.trim()) {
      const b = busca.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.titulo.toLowerCase().includes(b) ||
          (c.numero ?? "").toLowerCase().includes(b) ||
          (c.clients?.nome ?? "").toLowerCase().includes(b),
      );
    }
    return lista;
  }, [contratos, filtro, modalidade, busca]);

  const resumo = useMemo(() => {
    const vigentes = (contratos ?? []).filter((c) => !ENCERRADOS.includes(c.situacao));
    const recorrente = vigentes.reduce((s, c) => s + Number(c.valor_mensal ?? 0), 0);
    const atencao = vigentes.filter((c) => {
      const v = avaliarVigencia(c);
      return v.situacao === "vencido" || v.situacao === "aviso_vencendo" || v.situacao === "renova_sozinho";
    });
    return { vigentes: vigentes.length, recorrente, atencao };
  }, [contratos]);

  const criar = useMutation({
    mutationFn: async (form: { cliente: string; titulo: string; modalidade: ModalidadeId }) => {
      const { data: cliente } = await supabase
        .from("clients")
        .select("id")
        .ilike("nome", `%${form.cliente}%`)
        .limit(1)
        .maybeSingle();
      if (!cliente) throw new Error("Cliente não encontrado. Confira o nome.");

      const { data, error } = await supabase
        .from("contracts")
        .insert({
          client_id: cliente.id,
          titulo: form.titulo,
          modalidade: form.modalidade,
          situacao: "rascunho",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setCriando(false);
      qc.invalidateQueries({ queryKey: ["contratos"] });
      toast.success("Contrato criado. Complete os dados na ficha.");
      void navigate({ to: "/contratos/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        title="Contratos"
        subtitle={`${resumo.vigentes} vigente(s) · ${brl(resumo.recorrente)} de receita recorrente por mês`}
        action={
          <Dialog open={criando} onOpenChange={setCriando}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Novo contrato
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Novo contrato</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  criar.mutate({
                    cliente: String(f.get("cliente") ?? ""),
                    titulo: String(f.get("titulo") ?? ""),
                    modalidade: String(f.get("modalidade") ?? "fixo_mensal") as ModalidadeId,
                  });
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor="cliente">Cliente</Label>
                  <Input id="cliente" name="cliente" required placeholder="Parte do nome da empresa" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="titulo">Objeto</Label>
                  <Input id="titulo" name="titulo" required placeholder="Sustentação e evolução TOTVS Fluig" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="modalidade">Modalidade</Label>
                  <select
                    id="modalidade"
                    name="modalidade"
                    defaultValue="fixo_mensal"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    {MODALIDADES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.ajuda}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ele nasce como rascunho. O resto dos dados você completa na ficha.
                </p>
                <Button type="submit" className="w-full" disabled={criar.isPending}>
                  {criar.isPending ? "Criando…" : "Criar e abrir"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {resumo.atencao.length > 0 && (
        <button
          type="button"
          onClick={() => setFiltro("atencao")}
          className="panel mb-4 flex w-full items-center gap-3 border-amber-500/30 bg-amber-500/5 p-4 text-left transition-colors hover:border-amber-500/50"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-medium text-amber-200">
              {resumo.atencao.length} contrato(s) pedindo decisão
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Vencidos, perto do prazo de aviso, ou já renovados sozinhos por ter passado dele.
            </p>
          </div>
        </button>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, objeto ou cliente…"
            className="pl-9"
          />
        </div>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="vigentes">Vigentes</option>
          <option value="atencao">Pedindo decisão</option>
          <option value="todos">Todos</option>
          {SITUACOES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={modalidade}
          onChange={(e) => setModalidade(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="todas">Todas as modalidades</option>
          {MODALIDADES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando contratos…</p>
      ) : visiveis.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <FileSignature className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nenhum contrato por aqui</p>
          <p className="text-sm text-muted-foreground">
            {(contratos?.length ?? 0) === 0
              ? "Cadastre o primeiro contrato para acompanhar vigência, saldo de horas e documentos."
              : "Nenhum contrato bate com este filtro."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map((c) => {
            const v = avaliarVigencia(c);
            return (
              <li key={c.id}>
                <Link
                  to="/contratos/$id"
                  params={{ id: c.id }}
                  className="panel block p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {c.numero && <span className="font-mono text-xs text-muted-foreground">{c.numero}</span>}
                    <span className="flex-1 text-sm font-medium">{c.titulo}</span>
                    <Etiqueta className={corModalidade(c.modalidade)}>
                      {rotuloModalidade(c.modalidade)}
                    </Etiqueta>
                    <Etiqueta className={corSituacao(c.situacao)}>{rotuloSituacao(c.situacao)}</Etiqueta>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.clients?.nome}</span>
                    <span>
                      {d(c.data_inicio)} — {c.prazo_indeterminado ? "sem prazo" : d(c.data_fim)}
                    </span>
                    {CONTA_HORAS.includes(c.modalidade) && c.horas_mensais ? (
                      <span>{horas(Number(c.horas_mensais))}/mês</span>
                    ) : null}
                    {c.produtos?.length > 0 && <span>{c.produtos.join(", ")}</span>}
                    {c.renovacao_automatica && <span>renovação automática</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <span className={cn("text-[11px]", v.cor)}>{v.rotulo}</span>
                    <span className="font-display text-sm font-semibold text-primary">
                      {valorDeReferencia(c)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
