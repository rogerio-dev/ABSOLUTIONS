import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { iniciaisDe } from "@/components/TicketBits";
import { cn } from "@/lib/utils";

export type Agente = {
  id: string;
  nome: string | null;
  email: string | null;
  papel: "admin" | "interno" | "analista" | "cliente";
};

/**
 * Quem pode receber um chamado.
 *
 * Vem de uma função no banco em vez de um select em `profiles` porque o
 * analista não lê a tabela de perfis inteira — e não deveria mesmo.
 */
export function useAgentes(habilitado: boolean) {
  return useQuery({
    queryKey: ["agentes-suporte"],
    enabled: habilitado,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agentes_de_suporte");
      if (error) throw error;
      return (data ?? []) as Agente[];
    },
  });
}

export function nomeDoAgente(agentes: Agente[] | undefined, id: string | null | undefined) {
  if (!id) return null;
  const a = agentes?.find((x) => x.id === id);
  return a?.nome ?? a?.email ?? null;
}

/** Bolinha com as iniciais de quem atende, ou um traço quando ninguém pegou. */
export function AvatarAgente({ nome, className }: { nome?: string | null; className?: string }) {
  return (
    <span
      title={nome ?? "Sem responsável"}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        nome ? "bg-primary/15 text-primary" : "border border-dashed border-border text-muted-foreground",
        className,
      )}
    >
      {nome ? iniciaisDe(nome) : "—"}
    </span>
  );
}

/**
 * Seletor de responsável com atalho para assumir.
 *
 * O atalho existe porque assumir o próprio chamado é o gesto mais frequente do
 * dia, e procurar o próprio nome numa lista de colegas é atrito à toa.
 */
export function SeletorResponsavel({
  valor,
  agentes,
  euId,
  aoMudar,
  ocupado,
}: {
  valor: string | null;
  agentes: Agente[] | undefined;
  euId: string | null;
  aoMudar: (id: string | null) => void;
  ocupado?: boolean;
}) {
  const souEu = !!euId && valor === euId;

  return (
    <div>
      <select
        value={valor ?? ""}
        disabled={ocupado}
        onChange={(e) => aoMudar(e.target.value || null)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
      >
        <option value="">Caixa geral (sem responsável)</option>
        {(agentes ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome ?? a.email}
            {a.id === euId ? " (você)" : ""}
          </option>
        ))}
      </select>

      {!souEu && euId && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => aoMudar(euId)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          <UserCheck className="h-3.5 w-3.5" />
          {valor ? "Passar para mim" : "Assumir este chamado"}
        </button>
      )}
    </div>
  );
}
