import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "interno" | "analista" | "cliente";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export type Me = {
  userId: string | null;
  roles: AppRole[];
  /** Equipe do CRM: funil, contratos, clientes. */
  isStaff: boolean;
  isAdmin: boolean;
  /** Atende chamados. Inclui a equipe e os analistas. */
  isSuporte: boolean;
  /** Analista puro: só o módulo de suporte. */
  isAnalista: boolean;
  clientId: string | null;
  fullName: string | null;
  email: string | null;
};

export function useMe() {
  return useQuery<Me>({
    queryKey: ["me"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        return {
          userId: null,
          roles: [],
          isStaff: false,
          isAdmin: false,
          isSuporte: false,
          isAnalista: false,
          clientId: null,
          fullName: null,
          email: null,
        };
      }
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("client_id, full_name, email").eq("id", user.id).maybeSingle(),
      ]);
      const list = (roles ?? []).map((r) => r.role as AppRole);
      const equipe = list.includes("admin") || list.includes("interno");
      return {
        userId: user.id,
        roles: list,
        isStaff: equipe,
        isAdmin: list.includes("admin"),
        isSuporte: equipe || list.includes("analista"),
        isAnalista: list.includes("analista") && !equipe,
        clientId: profile?.client_id ?? null,
        fullName: profile?.full_name ?? user.email ?? null,
        email: profile?.email ?? user.email ?? null,
      };
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };
}
