import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/lib/auth";
import { PRIORIDADES } from "@/lib/suporte";

/**
 * Habilita e configura o suporte de um cliente: liga a abertura de chamados
 * pelo portal, escolhe a caixa de destino e a política de SLA aplicada.
 */
export function SuporteDoCliente({ clientId }: { clientId: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["suporte-config", clientId],
    queryFn: async () => {
      const { data } = await supabase.from("client_support").select("*").eq("client_id", clientId).maybeSingle();
      return data;
    },
  });

  const { data: caixas } = useQuery({
    queryKey: ["caixas-todas"],
    queryFn: async () => {
      const { data } = await supabase.from("support_inboxes").select("id, nome, padrao").eq("ativa", true).order("nome");
      return data ?? [];
    },
  });

  const { data: politicas } = useQuery({
    queryKey: ["politicas-sla"],
    queryFn: async () => {
      const { data } = await supabase.from("sla_policies").select("id, nome, padrao").order("nome");
      return data ?? [];
    },
  });

  const politicaEscolhida = cfg?.sla_policy_id ?? politicas?.find((p) => p.padrao)?.id;

  const { data: metas } = useQuery({
    queryKey: ["metas-sla", politicaEscolhida],
    enabled: !!politicaEscolhida,
    queryFn: async () => {
      const { data } = await supabase
        .from("sla_targets")
        .select("prioridade, primeira_resposta_min, resolucao_min")
        .eq("policy_id", politicaEscolhida!);
      return data ?? [];
    },
  });

  const salvar = useMutation({
    mutationFn: async (campos: {
      habilitado?: boolean;
      inbox_id?: string | null;
      sla_policy_id?: string | null;
      observacoes?: string | null;
    }) => {
      const base = {
        client_id: clientId,
        habilitado: cfg?.habilitado ?? false,
        inbox_id: cfg?.inbox_id ?? caixas?.find((c) => c.padrao)?.id ?? null,
        sla_policy_id: cfg?.sla_policy_id ?? politicas?.find((p) => p.padrao)?.id ?? null,
        observacoes: cfg?.observacoes ?? null,
        ...campos,
      };
      const virouAtivo = campos.habilitado === true && !cfg?.habilitado;
      const { error } = await supabase.from("client_support").upsert({
        ...base,
        ...(virouAtivo ? { habilitado_por: me?.userId ?? null, habilitado_em: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suporte-config", clientId] });
      toast.success("Configuração de suporte salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const ativo = cfg?.habilitado ?? false;

  const emHoras = (min: number) => (min < 60 ? `${min}min` : min < 1440 ? `${min / 60}h` : `${Math.round(min / 480)} dias úteis`);

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <LifeBuoy className={ativo ? "mt-0.5 h-5 w-5 text-primary" : "mt-0.5 h-5 w-5 text-muted-foreground"} />
          <div>
            <p className="text-sm font-medium">
              {ativo ? "Suporte habilitado" : "Suporte não habilitado"}
            </p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              {ativo
                ? "Os usuários deste cliente podem abrir chamados pelo portal, e os SLAs abaixo passam a valer."
                : "Enquanto estiver desligado, este cliente não vê a seção de suporte no portal nem consegue abrir chamados."}
            </p>
          </div>
        </div>
        <Button
          variant={ativo ? "outline" : "default"}
          disabled={salvar.isPending}
          onClick={() => salvar.mutate({ habilitado: !ativo })}
        >
          {ativo ? "Desabilitar" : "Habilitar suporte"}
        </Button>
      </div>

      {ativo && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel p-4">
              <Label className="mb-2 block text-xs text-muted-foreground">Caixa de destino</Label>
              <select
                value={cfg?.inbox_id ?? ""}
                onChange={(e) => salvar.mutate({ inbox_id: e.target.value || null })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— usar a padrão —</option>
                {(caixas ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.padrao ? " (padrão)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                Define em qual fila os chamados deste cliente aparecem para a equipe.
              </p>
            </div>

            <div className="panel p-4">
              <Label className="mb-2 block text-xs text-muted-foreground">Política de SLA</Label>
              <select
                value={cfg?.sla_policy_id ?? ""}
                onChange={(e) => salvar.mutate({ sla_policy_id: e.target.value || null })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— usar a padrão —</option>
                {(politicas ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">
                O relógio conta apenas em horário comercial e pausa enquanto o chamado aguarda o cliente.
              </p>
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="mb-3 text-sm font-semibold">Prazos por criticidade</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Criticidade</th>
                    <th className="pb-2 font-medium">Primeira resposta</th>
                    <th className="pb-2 font-medium">Resolução</th>
                    <th className="pb-2 font-medium">Quando usar</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORIDADES.map((p) => {
                    const m = (metas ?? []).find((x) => x.prioridade === p.id);
                    return (
                      <tr key={p.id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 font-medium">{p.label}</td>
                        <td className="py-2">{m ? emHoras(m.primeira_resposta_min) : "—"}</td>
                        <td className="py-2">{m ? emHoras(m.resolucao_min) : "—"}</td>
                        <td className="py-2 text-xs text-muted-foreground">{p.ajuda}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-4">
            <Label htmlFor="obs-suporte" className="mb-2 block text-xs text-muted-foreground">
              Observações do atendimento
            </Label>
            <Textarea
              id="obs-suporte"
              defaultValue={cfg?.observacoes ?? ""}
              rows={3}
              placeholder="Particularidades deste cliente: janela de manutenção, contatos autorizados, ambiente…"
              onBlur={(e) => {
                if (e.target.value !== (cfg?.observacoes ?? "")) salvar.mutate({ observacoes: e.target.value || null });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
