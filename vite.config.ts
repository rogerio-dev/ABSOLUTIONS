import { defineConfig, loadEnv, type PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * Alvo do build do servidor. `node-server` gera um servidor Node comum, que roda
 * em qualquer lugar (Railway, VPS, container). Use `cloudflare-module` para
 * publicar em Cloudflare Workers.
 */
const NITRO_PRESET = process.env.NITRO_PRESET ?? "node-server";

export default defineConfig(async ({ mode, command }) => {
  /*
   * As variáveis VITE_ precisam ser injetadas explicitamente como literais.
   * O Vite já faz isso no bundle do navegador, mas não no bundle do servidor
   * gerado pelo Nitro — sem este define, elas chegam indefinidas em produção
   * e o cliente Supabase falha ao inicializar.
   */
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(env).map(([chave, valor]) => [`import.meta.env.${chave}`, JSON.stringify(valor)]),
  );

  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // server.entry aponta para src/server.ts, que embrulha o SSR com tratamento de erro
    tanstackStart({ server: { entry: "server" } }),
  ];

  // O Nitro só entra no build; em desenvolvimento o próprio Vite serve a aplicação.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: NITRO_PRESET }));
  }

  plugins.push(viteReact());

  return { define, plugins };
});
