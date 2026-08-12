import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, NoAccess, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/clientes_/novo")({
  head: () => ({
    meta: [
      { title: "Novo cliente | AB Solutions CRM" },
      { name: "description", content: "Cadastrar uma nova empresa no CRM da AB Solutions." },
      { property: "og:title", content: "Novo cliente | AB Solutions CRM" },
      { property: "og:description", content: "Cadastrar uma nova empresa no CRM da AB Solutions." },
    ],
  }),
  component: NovoCliente,
});

function NovoCliente() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();

  const criar = useMutation({
    mutationFn: async (form: FormData) => {
      const get = (key: string) => String(form.get(key) ?? "").trim();
      const payload = {
        nome: get("nome"),
        cnpj: get("cnpj") || null,
        razao_social: get("razao_social") || null,
        email_contrato: get("email_contrato") || null,
        email_financeiro: get("email_financeiro") || null,
        segmento: get("segmento") || null,
        macro_segmento: get("macro_segmento") || null,
        classificacao: get("classificacao") || null,
        tipo: get("tipo") || null,
        cidade: get("cidade") || null,
        uf: get("uf").toUpperCase() || null,
        pais: get("pais") || null,
        observacoes: get("observacoes") || null,
        ativo: "ativo",
        owner_id: me?.userId ?? null,
      };

      const { data, error } = await supabase.from("clients").insert(payload).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Cliente cadastrado com sucesso.");
      navigate({ to: "/clientes/$id", params: { id } });
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
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Voltar para clientes
      </Link>

      <PageHeader title="Novo cliente" subtitle="Cadastre uma nova empresa no CRM." />

      <form
        className="panel space-y-6 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate(new FormData(e.currentTarget));
        }}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="nome">
              Nome fantasia <span className="text-destructive">*</span>
            </Label>
            <Input id="nome" name="nome" placeholder="Ex.: ACME Indústria" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="razao_social">Razão social</Label>
            <Input id="razao_social" name="razao_social" placeholder="Ex.: ACME Indústria Ltda." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_contrato">E-mail comercial</Label>
            <Input id="email_contrato" name="email_contrato" type="email" placeholder="contato@empresa.com.br" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_financeiro">E-mail financeiro</Label>
            <Input id="email_financeiro" name="email_financeiro" type="email" placeholder="financeiro@empresa.com.br" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="segmento">Segmento</Label>
            <Input id="segmento" name="segmento" placeholder="Ex.: Indústria, Varejo, Serviços" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="macro_segmento">Macro segmento</Label>
            <Input id="macro_segmento" name="macro_segmento" placeholder="Ex.: B2B, B2C" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="classificacao">Classificação</Label>
            <Input id="classificacao" name="classificacao" placeholder="Ex.: A, B, C ou Enterprise" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo</Label>
            <Input id="tipo" name="tipo" placeholder="Ex.: Prospect, Cliente ativo, Parceiro" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" name="cidade" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="uf">UF</Label>
            <Input id="uf" name="uf" maxLength={2} placeholder="DF" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pais">País</Label>
            <Input id="pais" name="pais" defaultValue="Brasil" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea id="observacoes" name="observacoes" rows={4} placeholder="Informações complementares sobre a empresa…" />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" asChild>
            <Link to="/clientes">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={criar.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {criar.isPending ? "Salvando…" : "Salvar cliente"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
