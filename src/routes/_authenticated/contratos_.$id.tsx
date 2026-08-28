import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Paperclip,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/auth";
import { brl, d } from "@/lib/crm";
import {
  CONTA_HORAS,
  MODALIDADES,
  PRODUTOS,
  REAJUSTES,
  SITUACOES,
  TIPOS_DOCUMENTO,
  avaliarVigencia,
  corModalidade,
  corSituacao,
  horas,
  nomeSeguro,
  rotuloDocumento,
  rotuloModalidade,
  rotuloSituacao,
  tamanhoLegivel,
} from "@/lib/contratos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contratos_/$id")({
  head: () => ({
    meta: [
      { title: "Contrato | AB Solutions CRM" },
      { name: "description", content: "Ficha do contrato: vigência, valores, horas e documentos." },
    ],
  }),
  component: ContratoDetalhe,
});

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Campos editáveis. O resto da linha é só leitura. */
type Rascunho = Record<string, unknown>;

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda?: string | undefined; children: React.ReactNode }) {
  return (
    <section className="panel mb-4 p-5">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {ajuda && <p className="mb-4 mt-1 text-xs text-muted-foreground">{ajuda}</p>}
      <div className={cn("grid gap-3 sm:grid-cols-2", ajuda ? "" : "mt-4")}>{children}</div>
    </section>
  );
}

function Campo({
  rotulo,
  ajuda,
  largo,
  children,
}: {
  rotulo: string;
  ajuda?: string | undefined;
  largo?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-xs text-muted-foreground">{rotulo}</label>
      {children}
      {ajuda && <p className="mt-1 text-[11px] text-muted-foreground/80">{ajuda}</p>}
    </div>
  );
}

const entrada =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground/60";

function ContratoDetalhe() {
  const { id } = Route.useParams();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<Rascunho>({});
  const arquivoRef = useRef<HTMLInputElement>(null);

  const { data: c } = useQuery({
    queryKey: ["contrato", id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, clients(id, nome), sla_policies(id, nome)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: politicas } = useQuery({
    queryKey: ["sla-policies"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("sla_policies").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  const { data: documentos } = useQuery({
    queryKey: ["contrato-docs", id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_documentos")
        .select("*")
        .eq("contract_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const contaHoras = c ? CONTA_HORAS.includes(c.modalidade as string) : false;

  const { data: saldo } = useQuery({
    queryKey: ["contrato-saldo", id],
    enabled: !!me && contaHoras,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_de_horas", { _contrato: id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data: apontamentos } = useQuery({
    queryKey: ["contrato-apontamentos", id],
    enabled: !!me && contaHoras,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_apontamentos")
        .select("*")
        .eq("contract_id", id)
        .order("data", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  // O rascunho zera sempre que o contrato recarrega, para não sobrescrever
  // com valores velhos algo que outra pessoa mudou no meio.
  useEffect(() => setRascunho({}), [c?.updated_at]);

  const valor = (campo: string) =>
    campo in rascunho ? rascunho[campo] : ((c as Record<string, unknown> | undefined)?.[campo] ?? "");

  const mudar = (campo: string, v: unknown) => setRascunho((r) => ({ ...r, [campo]: v }));
  const sujo = Object.keys(rascunho).length > 0;

  const salvar = useMutation({
    mutationFn: async () => {
      // Campo numérico vazio precisa virar null; string vazia o Postgres recusa.
      const limpo: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rascunho)) limpo[k] = v === "" ? null : v;
      // O rascunho e montado por nome de campo em tempo de execucao, entao o
      // tipo gerado nao consegue conferir. A protecao real esta na RLS e nas
      // restricoes da tabela.
      const { error } = await supabase
        .from("contracts")
        .update(limpo as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRascunho({});
      qc.invalidateQueries({ queryKey: ["contrato", id] });
      qc.invalidateQueries({ queryKey: ["contratos"] });
      qc.invalidateQueries({ queryKey: ["contrato-saldo", id] });
      toast.success("Contrato atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviarArquivo = useMutation({
    mutationFn: async (arquivo: File) => {
      // O primeiro segmento do caminho é o id do contrato: é por ele que a
      // política do Storage descobre de quem é o arquivo.
      const caminho = `${id}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
      const { error: erroUp } = await supabase.storage
        .from("contratos")
        .upload(caminho, arquivo, arquivo.type ? { contentType: arquivo.type } : {});
      if (erroUp) throw erroUp;

      const { error } = await supabase.from("contract_documentos").insert({
        contract_id: id,
        tipo: "contrato_assinado",
        nome: arquivo.name,
        caminho,
        mime: arquivo.type || null,
        tamanho_bytes: arquivo.size,
        enviado_por: me?.userId ?? null,
      });
      if (error) {
        // Sem isto, uma falha aqui deixaria arquivo órfão no bucket para sempre.
        await supabase.storage.from("contratos").remove([caminho]);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contrato-docs", id] });
      toast.success("Documento anexado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarDocumento = useMutation({
    mutationFn: async ({ docId, campos }: { docId: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("contract_documentos")
        .update(campos as never)
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contrato-docs", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const apagarDocumento = useMutation({
    mutationFn: async ({ docId, caminho }: { docId: string; caminho: string }) => {
      const { error } = await supabase.from("contract_documentos").delete().eq("id", docId);
      if (error) throw error;
      await supabase.storage.from("contratos").remove([caminho]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contrato-docs", id] });
      toast.success("Documento removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apontar = useMutation({
    mutationFn: async (form: { data: string; horas: string; descricao: string }) => {
      const { error } = await supabase.from("contract_apontamentos").insert({
        contract_id: id,
        data: form.data,
        horas: Number(form.horas.replace(",", ".")),
        descricao: form.descricao,
        consultor_id: me?.userId ?? null,
        consultor_nome: me?.fullName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contrato-apontamentos", id] });
      qc.invalidateQueries({ queryKey: ["contrato-saldo", id] });
      toast.success("Horas lançadas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** O arquivo é privado: o acesso sai de uma URL assinada de curta duração. */
  const baixar = async (caminho: string, nome: string) => {
    const { data, error } = await supabase.storage.from("contratos").createSignedUrl(caminho, 60, {
      download: nome,
    });
    if (error || !data) {
      toast.error("Não foi possível gerar o link do arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const vigencia = useMemo(() => (c ? avaliarVigencia(c as never) : null), [c]);

  if (isLoading) return <AppShell>Carregando…</AppShell>;
  if (!me?.isStaff && !me?.clientId)
    return (
      <AppShell>
        <NoAccess />
      </AppShell>
    );
  if (!c)
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Contrato não encontrado ou sem acesso.</p>
      </AppShell>
    );

  const cliente = c.clients as unknown as { id: string; nome: string } | null;
  const somenteLeitura = !me.isStaff;

  return (
    <AppShell>
      <Link
        to="/contratos"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para os contratos
      </Link>

      <div className="panel mb-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {c.numero ? <span className="font-mono text-sm text-muted-foreground">{c.numero}</span> : null}
          <span
            className={cn(
              "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
              corModalidade(c.modalidade as string),
            )}
          >
            {rotuloModalidade(c.modalidade as string)}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
              corSituacao(c.situacao as string),
            )}
          >
            {rotuloSituacao(c.situacao as string)}
          </span>
        </div>
        <h1 className="mt-2 font-display text-xl font-semibold">{c.titulo as string}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cliente ? (
            <Link to="/clientes/$id" params={{ id: cliente.id }} className="hover:text-primary">
              {cliente.nome}
            </Link>
          ) : null}
          {" · "}
          {d(c.data_inicio as string)} — {c.prazo_indeterminado ? "sem prazo" : d(c.data_fim as string)}
          {vigencia ? <span className={cn(" · ", vigencia.cor)}>{vigencia.rotulo}</span> : null}
        </p>
      </div>

      {contaHoras && saldo && (
        <div className="panel mb-4 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" /> Saldo de horas em {MESES[new Date(`${saldo.mes}T00:00:00`).getMonth()]}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { r: "Contratadas no mês", v: horas(Number(saldo.contratadas)) },
              { r: "Vindas de meses anteriores", v: horas(Number(saldo.acumulado_anterior)) },
              { r: "Consumidas", v: horas(Number(saldo.consumidas)) },
              { r: "Saldo", v: horas(Number(saldo.saldo)), destaque: Number(saldo.saldo) < 0 },
            ].map((x) => (
              <div key={x.r}>
                <p className="text-[11px] text-muted-foreground">{x.r}</p>
                <p
                  className={cn(
                    "font-display text-xl font-semibold",
                    x.destaque ? "text-rose-400" : "text-foreground",
                  )}
                >
                  {x.v}
                </p>
              </div>
            ))}
          </div>
          {Number(saldo.saldo) < 0 && (
            <p className="mt-3 text-xs text-amber-300">
              O consumo passou do contratado. O excedente costuma ser faturado à parte — confira o valor
              da hora extra antes de fechar o mês.
            </p>
          )}
        </div>
      )}

      {/* Documentos: o que o cliente também enxerga */}
      <section className="panel mb-4 p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-4 w-4" /> Documentos
          </h2>
          {!somenteLeitura && (
            <>
              <input
                ref={arquivoRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) enviarArquivo.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={enviarArquivo.isPending}
                onClick={() => arquivoRef.current?.click()}
              >
                <FileUp className="mr-2 h-4 w-4" />
                {enviarArquivo.isPending ? "Enviando…" : "Anexar arquivo"}
              </Button>
            </>
          )}
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          O contrato assinado, aditivos e propostas. Marcado como visível, o cliente baixa o mesmo arquivo
          no portal dele. PDF, imagem, Word ou Excel, até 25 MB.
        </p>

        {(documentos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum documento anexado ainda.
            {!somenteLeitura && " Comece pelo contrato assinado."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(documentos ?? []).map((doc) => (
              <li key={doc.id as string} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.nome as string}</p>
                  <p className="text-xs text-muted-foreground">
                    {rotuloDocumento(doc.tipo as string)} · {tamanhoLegivel(doc.tamanho_bytes as number)} ·{" "}
                    {d(doc.created_at as string)}
                  </p>
                </div>

                {!somenteLeitura && (
                  <select
                    value={doc.tipo as string}
                    onChange={(e) =>
                      mudarDocumento.mutate({ docId: doc.id as string, campos: { tipo: e.target.value } })
                    }
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}

                {!somenteLeitura && (
                  <button
                    type="button"
                    title={
                      doc.visivel_cliente
                        ? "Visível para o cliente. Clique para esconder."
                        : "Escondido do cliente. Clique para liberar."
                    }
                    onClick={() =>
                      mudarDocumento.mutate({
                        docId: doc.id as string,
                        campos: { visivel_cliente: !doc.visivel_cliente },
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors",
                      doc.visivel_cliente
                        ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {doc.visivel_cliente ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                    {doc.visivel_cliente ? "cliente vê" : "só interno"}
                  </button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => baixar(doc.caminho as string, doc.nome as string)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>

                {!somenteLeitura && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={apagarDocumento.isPending}
                    onClick={() => {
                      if (!confirm(`Remover "${doc.nome as string}"? O arquivo é apagado junto.`)) return;
                      apagarDocumento.mutate({
                        docId: doc.id as string,
                        caminho: doc.caminho as string,
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {somenteLeitura ? null : (
        <>
          <Secao titulo="Identificação">
            <Campo rotulo="Número">
              <input
                className={entrada}
                value={String(valor("numero") ?? "")}
                onChange={(e) => mudar("numero", e.target.value)}
                placeholder="CT-2026-001"
              />
            </Campo>
            <Campo rotulo="Situação">
              <select
                className={entrada}
                value={String(valor("situacao"))}
                onChange={(e) => mudar("situacao", e.target.value)}
              >
                {SITUACOES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Objeto" largo>
              <input
                className={entrada}
                value={String(valor("titulo") ?? "")}
                onChange={(e) => mudar("titulo", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Modalidade" ajuda={MODALIDADES.find((m) => m.id === valor("modalidade"))?.ajuda}>
              <select
                className={entrada}
                value={String(valor("modalidade"))}
                onChange={(e) => mudar("modalidade", e.target.value)}
              >
                {MODALIDADES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Produtos cobertos">
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {PRODUTOS.map((prod) => {
                  const atuais = (valor("produtos") as string[] | null) ?? [];
                  const marcado = atuais.includes(prod);
                  return (
                    <button
                      key={prod}
                      type="button"
                      onClick={() =>
                        mudar(
                          "produtos",
                          marcado ? atuais.filter((p) => p !== prod) : [...atuais, prod],
                        )
                      }
                      className={cn(
                        "rounded border px-2 py-1 text-xs transition-colors",
                        marcado
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {prod}
                    </button>
                  );
                })}
              </div>
            </Campo>
            <Campo rotulo="Escopo detalhado" largo ajuda="O que está incluído e, principalmente, o que não está.">
              <textarea
                rows={4}
                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={String(valor("escopo") ?? "")}
                onChange={(e) => mudar("escopo", e.target.value)}
              />
            </Campo>
          </Secao>

          <Secao
            titulo="Vigência e renovação"
            ajuda="A data que importa não é o fim: é o último dia para avisar que não vai renovar."
          >
            <Campo rotulo="Início">
              <input
                type="date"
                className={entrada}
                value={String(valor("data_inicio") ?? "")}
                onChange={(e) => mudar("data_inicio", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Fim">
              <input
                type="date"
                className={entrada}
                disabled={!!valor("prazo_indeterminado")}
                value={String(valor("data_fim") ?? "")}
                onChange={(e) => mudar("data_fim", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Prazo">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!valor("prazo_indeterminado")}
                  onChange={(e) => mudar("prazo_indeterminado", e.target.checked)}
                />
                Indeterminado
              </label>
            </Campo>
            <Campo rotulo="Renovação">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!valor("renovacao_automatica")}
                  onChange={(e) => mudar("renovacao_automatica", e.target.checked)}
                />
                Automática
              </label>
            </Campo>
            <Campo rotulo="Aviso prévio (dias)" ajuda="Antecedência para avisar que não vai renovar.">
              <input
                type="number"
                className={entrada}
                value={String(valor("aviso_previo_dias") ?? "")}
                onChange={(e) => mudar("aviso_previo_dias", Number(e.target.value) || null)}
              />
            </Campo>
            <Campo rotulo="Reajuste">
              <select
                className={entrada}
                value={String(valor("reajuste"))}
                onChange={(e) => mudar("reajuste", e.target.value)}
              >
                {REAJUSTES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Mês do reajuste">
              <select
                className={entrada}
                value={String(valor("reajuste_mes") ?? "")}
                onChange={(e) => mudar("reajuste_mes", Number(e.target.value) || null)}
              >
                <option value="">—</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </Campo>
          </Secao>

          <Secao titulo="Valores e faturamento">
            <Campo rotulo="Valor mensal" ajuda="O que entra todo mês. É daqui que sai a receita recorrente.">
              <input
                type="number"
                step="0.01"
                className={entrada}
                value={String(valor("valor_mensal") ?? "")}
                onChange={(e) => mudar("valor_mensal", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Valor global" ajuda="Para contrato por projeto, com preço fechado.">
              <input
                type="number"
                step="0.01"
                className={entrada}
                value={String(valor("valor") ?? "")}
                onChange={(e) => mudar("valor", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Valor da hora">
              <input
                type="number"
                step="0.01"
                className={entrada}
                value={String(valor("valor_hora") ?? "")}
                onChange={(e) => mudar("valor_hora", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Valor da hora excedente" ajuda="Cobrado no que passar do pacote contratado.">
              <input
                type="number"
                step="0.01"
                className={entrada}
                value={String(valor("valor_hora_extra") ?? "")}
                onChange={(e) => mudar("valor_hora_extra", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Dia do vencimento">
              <input
                type="number"
                min={1}
                max={31}
                className={entrada}
                value={String(valor("dia_vencimento") ?? "")}
                onChange={(e) => mudar("dia_vencimento", Number(e.target.value) || null)}
              />
            </Campo>
            <Campo rotulo="Dia da emissão da nota">
              <input
                type="number"
                min={1}
                max={31}
                className={entrada}
                value={String(valor("nota_fiscal_dia") ?? "")}
                onChange={(e) => mudar("nota_fiscal_dia", Number(e.target.value) || null)}
              />
            </Campo>
            <Campo rotulo="Prazo de pagamento (dias)">
              <input
                type="number"
                className={entrada}
                value={String(valor("prazo_pagamento_dias") ?? "")}
                onChange={(e) => mudar("prazo_pagamento_dias", Number(e.target.value) || null)}
              />
            </Campo>
            <Campo rotulo="Forma de pagamento">
              <input
                className={entrada}
                placeholder="Boleto, PIX, transferência…"
                value={String(valor("forma_pagamento") ?? "")}
                onChange={(e) => mudar("forma_pagamento", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Multa por atraso (%)">
              <input
                type="number"
                step="0.01"
                className={entrada}
                value={String(valor("multa_atraso_pct") ?? "")}
                onChange={(e) => mudar("multa_atraso_pct", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Juros ao mês (%)">
              <input
                type="number"
                step="0.01"
                className={entrada}
                value={String(valor("juros_mes_pct") ?? "")}
                onChange={(e) => mudar("juros_mes_pct", e.target.value)}
              />
            </Campo>
            <Campo rotulo="ISS">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!valor("iss_retido")}
                  onChange={(e) => mudar("iss_retido", e.target.checked)}
                />
                Retido na fonte
              </label>
            </Campo>
          </Secao>

          <Secao
            titulo="Horas"
            ajuda="Vale para banco de horas, horas avulsas e alocação. Nas outras modalidades fica só como referência."
          >
            <Campo rotulo="Horas por mês">
              <input
                type="number"
                step="0.5"
                className={entrada}
                value={String(valor("horas_mensais") ?? "")}
                onChange={(e) => mudar("horas_mensais", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Horas totais do contrato">
              <input
                type="number"
                step="0.5"
                className={entrada}
                value={String(valor("horas_contratadas") ?? "")}
                onChange={(e) => mudar("horas_contratadas", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Saldo não usado" ajuda="Sem acúmulo, o que sobra é perdido na virada do mês.">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!valor("horas_acumulam")}
                  onChange={(e) => mudar("horas_acumulam", e.target.checked)}
                />
                Acumula para o mês seguinte
              </label>
            </Campo>
            <Campo rotulo="Validade do acúmulo (meses)" ajuda="Vazio é sem prazo para usar.">
              <input
                type="number"
                className={entrada}
                disabled={!valor("horas_acumulam")}
                value={String(valor("horas_validade_meses") ?? "")}
                onChange={(e) => mudar("horas_validade_meses", Number(e.target.value) || null)}
              />
            </Campo>
          </Secao>

          <Secao titulo="Atendimento">
            <Campo rotulo="Política de SLA" ajuda="Define os prazos dos chamados abertos por este cliente.">
              <select
                className={entrada}
                value={String(valor("sla_policy_id") ?? "")}
                onChange={(e) => mudar("sla_policy_id", e.target.value || null)}
              >
                <option value="">—</option>
                {(politicas ?? []).map((p) => (
                  <option key={p.id as string} value={p.id as string}>
                    {p.nome as string}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Horário de atendimento">
              <input
                className={entrada}
                placeholder="Segunda a sexta, 8h às 18h"
                value={String(valor("horario_atendimento") ?? "")}
                onChange={(e) => mudar("horario_atendimento", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Contato que assinou">
              <input
                className={entrada}
                value={String(valor("contato_assinante") ?? "")}
                onChange={(e) => mudar("contato_assinante", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Contato técnico">
              <input
                className={entrada}
                value={String(valor("contato_tecnico") ?? "")}
                onChange={(e) => mudar("contato_tecnico", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Contato financeiro" ajuda="Para quem vai a nota fiscal.">
              <input
                className={entrada}
                value={String(valor("contato_financeiro") ?? "")}
                onChange={(e) => mudar("contato_financeiro", e.target.value)}
              />
            </Campo>
          </Secao>

          <Secao titulo="Jurídico">
            <Campo rotulo="Assinado em">
              <input
                type="date"
                className={entrada}
                value={String(valor("assinado_em") ?? "")}
                onChange={(e) => mudar("assinado_em", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Forma da assinatura">
              <input
                className={entrada}
                placeholder="Digital (ICP-Brasil), física…"
                value={String(valor("forma_assinatura") ?? "")}
                onChange={(e) => mudar("forma_assinatura", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Aviso de rescisão (dias)">
              <input
                type="number"
                className={entrada}
                value={String(valor("rescisao_aviso_dias") ?? "")}
                onChange={(e) => mudar("rescisao_aviso_dias", Number(e.target.value) || null)}
              />
            </Campo>
            <Campo rotulo="Multa de rescisão">
              <input
                className={entrada}
                placeholder="30% do saldo, ou 3 mensalidades…"
                value={String(valor("multa_rescisao") ?? "")}
                onChange={(e) => mudar("multa_rescisao", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Foro">
              <input
                className={entrada}
                placeholder="Brasília/DF"
                value={String(valor("foro") ?? "")}
                onChange={(e) => mudar("foro", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Observações" largo>
              <textarea
                rows={3}
                className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={String(valor("observacoes") ?? "")}
                onChange={(e) => mudar("observacoes", e.target.value)}
              />
            </Campo>
          </Secao>
        </>
      )}

      {contaHoras && !somenteLeitura && (
        <section className="panel mb-4 p-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" /> Apontamento de horas
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            É o lançamento que transforma o pacote contratado em saldo. Sem ele, "40 horas por mês" é um
            número decorativo.
          </p>

          <form
            className="mb-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              apontar.mutate({
                data: String(f.get("data") ?? ""),
                horas: String(f.get("horas") ?? ""),
                descricao: String(f.get("descricao") ?? ""),
              });
              e.currentTarget.reset();
            }}
          >
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Data</label>
              <input
                type="date"
                name="data"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Horas</label>
              <input
                name="horas"
                required
                placeholder="2,5"
                className="h-9 w-24 rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </div>
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">O que foi feito</label>
              <Input name="descricao" required placeholder="Ajuste na regra de alçada do processo de compras" />
            </div>
            <Button type="submit" disabled={apontar.isPending}>
              <Plus className="mr-2 h-4 w-4" /> Lançar
            </Button>
          </form>

          {(apontamentos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma hora lançada ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(apontamentos ?? []).map((a) => (
                <li key={a.id as string} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {d(a.data as string)}
                  </span>
                  <span className="w-16 shrink-0 font-medium">{horas(Number(a.horas))}</span>
                  <span className="min-w-0 flex-1 truncate">{a.descricao as string}</span>
                  <span className="text-xs text-muted-foreground">{(a.consultor_nome as string) ?? ""}</span>
                  {!a.faturavel && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      cortesia
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Barra de salvar: só aparece quando há mudança pendente */}
      {sujo && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-popover p-3 shadow-xl">
          <p className="text-sm">
            {Object.keys(rascunho).length} campo(s) alterado(s), ainda não salvos.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRascunho({})}>
              Descartar
            </Button>
            <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              <Save className="mr-2 h-4 w-4" />
              {salvar.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </div>
      )}

      {somenteLeitura && (
        <div className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold">Resumo</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Modalidade", rotuloModalidade(c.modalidade as string)],
              ["Vigência", `${d(c.data_inicio as string)} — ${c.prazo_indeterminado ? "sem prazo" : d(c.data_fim as string)}`],
              ["Valor mensal", c.valor_mensal ? brl(Number(c.valor_mensal)) : "—"],
              ["Horas por mês", c.horas_mensais ? horas(Number(c.horas_mensais)) : "—"],
              ["Horário de atendimento", (c.horario_atendimento as string) ?? "—"],
              ["Escopo", (c.escopo as string) ?? "—"],
            ].map(([r, v]) => (
              <div key={r}>
                <dt className="text-xs text-muted-foreground">{r}</dt>
                <dd className="mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </AppShell>
  );
}
