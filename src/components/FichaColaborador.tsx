import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODALIDADES_PAGAMENTO } from "@/lib/financeiro";
import { cn } from "@/lib/utils";

export type Colaborador = {
  id: string;
  nome: string;
  papel: string | null;
  email: string | null;
  telefone: string | null;
  profile_id: string | null;
  modalidade: string;
  valor_hora: number | null;
  valor_mensal: number | null;
  dia_pagamento: number | null;
  tipo_pessoa: string;
  documento: string | null;
  razao_social: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  chave_pix: string | null;
  ativo: boolean;
  observacoes: string | null;
};

const campo = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

/**
 * Ficha de quem executa, para criar e para editar.
 *
 * Um componente só para os dois casos evita o desencontro clássico: o
 * formulário de cadastro ganha um campo, o de edição não, e meses depois um
 * dado só existe em quem foi criado depois da mudança.
 */
export function FichaColaborador({
  aberto,
  colaborador,
  semFicha,
  onFechar,
}: {
  aberto: boolean;
  /** Nulo cria; preenchido edita. */
  colaborador: Colaborador | null;
  semFicha: { profile_id: string; nome: string | null; papel: string | null }[];
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const editando = !!colaborador;
  // "" = ninguém escolhido; "avulso" = pessoa sem conta no sistema.
  const [quem, setQuem] = useState("");
  const [modalidade, setModalidade] = useState("por_task");

  useEffect(() => {
    if (!aberto) return;
    setQuem(colaborador ? (colaborador.profile_id ?? "avulso") : "");
    setModalidade(colaborador?.modalidade ?? "por_task");
  }, [aberto, colaborador]);

  const recarregar = () => {
    for (const k of ["fin-colaboradores", "execucao-sem-ficha", "equipe-interna"])
      qc.invalidateQueries({ queryKey: [k] });
  };

  const salvar = useMutation({
    mutationFn: async (f: FormData) => {
      const avulso = quem === "avulso" || !quem;
      const daEquipe = semFicha.find((p) => p.profile_id === quem);
      // O nome vem do perfil quando há um: uma pessoa, um nome.
      const nome = avulso
        ? String(f.get("nome") ?? "")
        : (daEquipe?.nome ?? colaborador?.nome ?? "");
      if (!nome.trim()) throw new Error("Escolha quem executa, ou informe o nome.");

      const numero = (chave: string) => {
        const v = String(f.get(chave) ?? "").trim();
        return v ? Number(v) : null;
      };
      const texto = (chave: string) => String(f.get(chave) ?? "").trim() || null;

      const dados = {
        nome,
        papel: texto("papel"),
        telefone: texto("telefone"),
        modalidade: String(f.get("modalidade") ?? "por_task"),
        // Modalidade define qual valor faz sentido guardar. Manter os dois
        // gravados é como a ficha diz "sem custo" e mostra R$ 80 por hora.
        valor_hora: modalidade === "fixo_mensal" || modalidade === "sem_custo" ? null : numero("valor_hora"),
        valor_mensal: modalidade === "fixo_mensal" ? numero("valor_mensal") : null,
        dia_pagamento: modalidade === "sem_custo" ? null : numero("dia"),
        tipo_pessoa: String(f.get("tipo_pessoa") ?? "pj"),
        documento: texto("documento"),
        razao_social: texto("razao_social"),
        banco: texto("banco"),
        agencia: texto("agencia"),
        conta: texto("conta"),
        chave_pix: texto("pix"),
        observacoes: texto("observacoes"),
        ativo: f.get("ativo") === "on",
        ...(editando ? {} : { profile_id: avulso ? null : quem }),
      };

      const { error } = editando
        ? await supabase.from("colaboradores").update(dados as never).eq("id", colaborador.id)
        : await supabase.from("colaboradores").insert(dados as never);
      if (error) throw error;
    },
    onSuccess: () => {
      onFechar();
      recarregar();
      toast.success(editando ? "Ficha atualizada." : "Pessoa cadastrada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Só deixa apagar quem nunca entrou em um fechamento; o resto é histórico
  // financeiro, e apagar quebraria a conta de um mês já fechado.
  const { data: temTitulo } = useQuery({
    queryKey: ["colab-tem-titulo", colaborador?.id],
    enabled: aberto && editando,
    queryFn: async () => {
      const { count } = await supabase
        .from("pagamentos")
        .select("id", { count: "exact", head: true })
        .eq("colaborador_id", colaborador!.id);
      return (count ?? 0) > 0;
    },
  });

  const apagar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("colaboradores").delete().eq("id", colaborador!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onFechar();
      recarregar();
      toast.success("Ficha removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const usaHora = modalidade === "por_task" || modalidade === "por_hora";
  const usaMensal = modalidade === "fixo_mensal";
  const gera = modalidade !== "sem_custo";

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? colaborador.nome : "Cadastrar quem executa"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate(new FormData(e.currentTarget));
          }}
        >
          {editando ? (
            <p className="text-xs text-muted-foreground">
              {colaborador.profile_id
                ? "Vinculada a uma conta do sistema — os cards do kanban chegam por ela."
                : "Sem conta no sistema. Não acumula cards; use para quem você paga por fora."}
            </p>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="perfil">Quem executa</Label>
              <select
                id="perfil"
                name="perfil"
                required
                value={quem}
                onChange={(e) => setQuem(e.target.value)}
                className={campo}
              >
                <option value="">Escolha na equipe…</option>
                {semFicha.map((p) => (
                  <option key={p.profile_id} value={p.profile_id}>
                    {p.nome} ({p.papel})
                  </option>
                ))}
                <option value="avulso">Alguém sem conta no sistema</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                É por esta conta que os cards do kanban chegam até a pessoa. Quem não tem conta não
                acumula horas.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {(quem === "avulso" || (editando && !colaborador.profile_id)) && (
              <div className="space-y-1">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" name="nome" required defaultValue={colaborador?.nome ?? ""} />
              </div>
            )}
            <div
              className={cn(
                "space-y-1",
                !(quem === "avulso" || (editando && !colaborador.profile_id)) && "col-span-2",
              )}
            >
              <Label htmlFor="papel">Papel</Label>
              <Input
                id="papel"
                name="papel"
                placeholder="Desenvolvedor Fluig"
                defaultValue={colaborador?.papel ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="modalidade">Como é pago</Label>
            <select
              id="modalidade"
              name="modalidade"
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value)}
              className={campo}
            >
              {MODALIDADES_PAGAMENTO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.ajuda}
                </option>
              ))}
            </select>
          </div>

          {/* Só os campos que a modalidade escolhida usa. */}
          <div className="grid grid-cols-3 gap-3">
            {usaHora && (
              <div className="space-y-1">
                <Label htmlFor="valor_hora">Valor da hora</Label>
                <Input
                  id="valor_hora"
                  name="valor_hora"
                  type="number"
                  step="0.01"
                  defaultValue={colaborador?.valor_hora ?? ""}
                />
              </div>
            )}
            {usaMensal && (
              <div className="space-y-1">
                <Label htmlFor="valor_mensal">Valor mensal</Label>
                <Input
                  id="valor_mensal"
                  name="valor_mensal"
                  type="number"
                  step="0.01"
                  defaultValue={colaborador?.valor_mensal ?? ""}
                />
              </div>
            )}
            {gera && (
              <div className="space-y-1">
                <Label htmlFor="dia">Dia do pagamento</Label>
                <Input
                  id="dia"
                  name="dia"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={colaborador?.dia_pagamento ?? 5}
                />
              </div>
            )}
            {!gera && (
              <p className="col-span-3 text-[11px] text-muted-foreground">
                Sem custo não gera título a pagar. As horas continuam sendo contadas no projeto, para o
                orçamento fechar.
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tipo_pessoa">Pessoa</Label>
              <select
                id="tipo_pessoa"
                name="tipo_pessoa"
                defaultValue={colaborador?.tipo_pessoa ?? "pj"}
                className={campo}
              >
                <option value="pj">Jurídica</option>
                <option value="pf">Física</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="documento">CNPJ ou CPF</Label>
              <Input id="documento" name="documento" defaultValue={colaborador?.documento ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" defaultValue={colaborador?.telefone ?? ""} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="razao_social">Razão social</Label>
            <Input id="razao_social" name="razao_social" defaultValue={colaborador?.razao_social ?? ""} />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="banco">Banco</Label>
              <Input id="banco" name="banco" defaultValue={colaborador?.banco ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agencia">Agência</Label>
              <Input id="agencia" name="agencia" defaultValue={colaborador?.agencia ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conta">Conta</Label>
              <Input id="conta" name="conta" defaultValue={colaborador?.conta ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pix">Chave PIX</Label>
              <Input id="pix" name="pix" defaultValue={colaborador?.chave_pix ?? ""} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="observacoes">Observações</Label>
            <textarea
              id="observacoes"
              name="observacoes"
              rows={2}
              defaultValue={colaborador?.observacoes ?? ""}
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ativo" defaultChecked={colaborador?.ativo ?? true} />
            Ativo
            <span className="text-xs text-muted-foreground">
              — inativo some da fila de fechamento, mas o histórico fica
            </span>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar"}
            </Button>
            {editando && (
              <Button
                type="button"
                variant="ghost"
                disabled={apagar.isPending || temTitulo}
                title={
                  temTitulo
                    ? "Já tem título no financeiro. Marque como inativo em vez de apagar."
                    : "Remover ficha"
                }
                onClick={() => {
                  if (!confirm(`Remover a ficha de ${colaborador.nome}?`)) return;
                  apagar.mutate();
                }}
              >
                <Trash2 className={cn("h-4 w-4", temTitulo ? "text-muted-foreground" : "text-rose-400")} />
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
