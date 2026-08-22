import { cn } from "@/lib/utils";

/**
 * Diz se a tela está se atualizando sozinha.
 *
 * Parece detalhe, mas não é: sem esse aviso, quem olha uma fila parada não sabe
 * se não há nada novo ou se a tela travou — e na dúvida recarrega, que é
 * exatamente o hábito que o tempo real veio tirar.
 */
export function AoVivo({ ativo, className }: { ativo: boolean; className?: string }) {
  return (
    <span
      title={
        ativo
          ? "A fila se atualiza sozinha conforme os chamados mudam."
          : "Conexão ao vivo indisponível; a tela recarrega a cada 20 segundos."
      }
      className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}
    >
      <span className="relative flex h-2 w-2">
        {ativo && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            ativo ? "bg-emerald-400" : "bg-muted-foreground/50",
          )}
        />
      </span>
      {ativo ? "ao vivo" : "sem conexão ao vivo"}
    </span>
  );
}
