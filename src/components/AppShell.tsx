import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  FileSignature,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  FolderKanban,
  UsersRound,
  LifeBuoy,
  Palette,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe, useSignOut } from "@/lib/auth";
import { cn } from "@/lib/utils";

const staffNav = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Building2 },
  { to: "/prospeccao", label: "Prospecção", icon: Target },
  { to: "/funil", label: "Funil", icon: KanbanSquare },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/contratos", label: "Contratos", icon: FileSignature },
  { to: "/projetos", label: "Projetos", icon: FolderKanban },
  { to: "/tickets", label: "Suporte", icon: LifeBuoy },
  { to: "/marketing", label: "Marketing", icon: Palette },
  { to: "/equipe", label: "Equipe & Acessos", icon: UsersRound },
] as const;

/** Analista só trata chamados: o CRM não aparece nem como link morto. */
const analistaNav = [
  { to: "/tickets", label: "Suporte", icon: LifeBuoy },
] as const;

const clientNav = [
  { to: "/portal", label: "Meu projeto", icon: FolderKanban },
  { to: "/tickets", label: "Suporte", icon: LifeBuoy },
  { to: "/agenda", label: "Reuniões", icon: CalendarDays },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = me?.isStaff ? staffNav : me?.isAnalista ? analistaNav : clientNav;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <img src="/favicon.svg" alt="AB Solutions" className="h-9 w-9 rounded-lg" />
          <div>
            <p className="font-display text-sm font-bold leading-tight">
              AB <span className="text-primary">Solutions</span>
            </p>
            <p className="text-[11px] text-muted-foreground">TOTVS Fluig</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-primary",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-lg border border-sidebar-border p-3">
          <p className="truncate text-sm font-medium">{me?.fullName ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {me?.isAdmin
              ? "Administrador"
              : me?.isStaff
                ? "Equipe interna"
                : me?.isAnalista
                  ? "Analista de suporte"
                  : "Cliente"}
          </p>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="AB Solutions" className="h-7 w-7 rounded" />
            <span className="font-display text-sm font-bold">AB Solutions</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function NoAccess() {
  return (
    <div className="panel flex flex-col items-center gap-3 p-10 text-center">
      <LifeBuoy className="h-8 w-8 text-primary" />
      <h2 className="font-display text-lg font-semibold">Acesso ainda não liberado</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Sua conta foi criada, mas ainda não possui perfil atribuído. Peça a um administrador da AB Solutions para
        liberar seu acesso em “Equipe &amp; Acessos”.
      </p>
    </div>
  );
}
