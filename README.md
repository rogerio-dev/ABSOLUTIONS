# AB Solutions

Site institucional, CRM interno e portal do cliente — **uma única aplicação**, um domínio, um deploy.

## Como está organizado

| Rota | O que é | Acesso |
|---|---|---|
| `/` | Site institucional: serviços, oferta do processo gratuito, FAQ | público |
| `/auth` | Login e cadastro | público |
| `/painel`, `/funil`, `/clientes`, `/contratos`, `/projetos`, `/agenda`, `/equipe` | CRM interno | equipe |
| `/portal` | Portal onde o cliente acompanha contratos e projetos | cliente |

O botão **Acesso**, no canto superior direito do site, leva direto à tela de login — sem sair da aplicação e sem recarregar a página. Quem já está autenticado vê **Painel** no lugar.

## Stack

- **TanStack Start** (React 19) com renderização no servidor — o site institucional é servido como HTML pronto, então continua totalmente indexável
- **Nitro** como runtime do servidor
- **Supabase** para banco e autenticação
- **Tailwind CSS 4** com Radix UI

## Rodando localmente

```bash
npm install
npm run dev
```

## Build e produção

```bash
npm install
npm run build
npm start
```

O build gera um servidor Node em `.output/server/index.mjs`, que roda em qualquer host Node. A porta vem de `PORT`. Para publicar em Cloudflare Workers, defina `NITRO_PRESET=cloudflare-module` antes do build.

## Variáveis de ambiente

| Variável | Onde é usada |
|---|---|
| `VITE_SUPABASE_URL` | navegador (injetada no build) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | navegador (injetada no build) |
| `SUPABASE_URL` | servidor, durante a renderização |
| `SUPABASE_PUBLISHABLE_KEY` | servidor, durante a renderização |

As chaves `publishable` são públicas por design — vão no bundle do navegador de qualquer forma. A proteção dos dados está nas políticas de Row Level Security do banco, não nelas.

## Segurança dos dados

As 12 tabelas têm Row Level Security ativo, com dois perfis:

- **Equipe** (`is_staff()`) — acesso completo
- **Cliente** (`my_client_id()`) — só os próprios registros, e atividades apenas quando marcadas como visíveis

As funções de autorização têm execução revogada para `anon` e `public`, e só administradores gerenciam papéis. O primeiro cadastro vira administrador por gatilho; os seguintes dependem de liberação.

Migrações em `supabase/migrations/`.

## Autenticação

E-mail e senha via Supabase. O botão "Continuar com Google" usa o OAuth nativo do Supabase — exige habilitar o provedor em **Authentication → Providers** no painel. Sem isso, o botão retorna erro e apenas o login por senha funciona.

## Estrutura

```
├── src/
│   ├── routes/            # site institucional (index.tsx), auth e rotas do CRM
│   ├── components/site/   # partículas, diagrama BPMN e animação de entrada
│   ├── components/ui/     # componentes compartilhados
│   ├── integrations/      # cliente Supabase e middleware de sessão
│   └── styles.css         # tokens de design e estilos do diagrama
├── public/                # favicon, og-cover, robots.txt, sitemap.xml
├── supabase/migrations/
└── marketing/             # peças em PNG e o gerador delas (README próprio)
```

## Domínio

`https://www.absolutionsconsultoria.com.br`, com a raiz sem `www` redirecionando via regra na Cloudflare. O DNS fica na Cloudflare e o e-mail do domínio na KingHost.

Se o domínio mudar, atualize a constante `SITE` em `src/routes/index.tsx` (usada no canonical, Open Graph e dados estruturados), além de `public/robots.txt` e `public/sitemap.xml`.

## Marketing

As peças gráficas e o gerador delas estão em `marketing/`, com documentação própria.
