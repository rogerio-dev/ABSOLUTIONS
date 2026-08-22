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


## Suporte: envio de e-mail

O envio aceita dois caminhos e escolhe pelo que estiver configurado.

**API HTTPS — recomendado em produção.** A Railway bloqueia portas de SMTP fora do plano Pro, então SMTP simplesmente não conecta lá.

| Variável | Descrição |
|---|---|
| `EMAIL_API_KEY` | chave do provedor |
| `EMAIL_API_PROVEDOR` | `resend` (padrão) ou `mailgun` |
| `EMAIL_REMETENTE` | `Suporte AB Solutions <suporte@absolutionsconsultoria.com.br>` |
| `MAILGUN_DOMINIO` | apenas para o Mailgun |

**SMTP — bom para desenvolvimento local:**

| Variável | Valor para a KingHost |
|---|---|
| `SMTP_HOST` | `smtp.kinghost.net` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | a conta de e-mail |
| `SMTP_PASS` | a senha dessa conta |
| `SMTP_FROM_NOME` | opcional |

O remetente por SMTP é sempre o `SMTP_USER`: servidores SMTP recusam um `From` diferente da conta autenticada. O que muda por chamado é o **Reply-To**, que aponta para o endereço daquele ticket.

Para conferir o SMTP antes de subir:

```bash
SMTP_HOST=smtp.kinghost.net SMTP_PORT=465 SMTP_USER=... SMTP_PASS=... node scripts/testar-smtp.mjs
```

Sem nenhum meio configurado, o sistema continua funcionando: as mensagens ficam na fila (`ticket_email_outbox`) e saem quando houver como enviar — nada se perde. Abrir a tela de suporte tenta despachar o que estiver pendente.

### Recebimento de respostas

Cada chamado tem um endereço próprio, no formato `comercial+t1000-<token>@mg.absolutionsconsultoria.com.br`. Quem responde não digita isso: é o `Reply-To` da notificação. Responder ao e-mail já basta, e a resposta vira mensagem pública do chamado.

O caminho é `POST /api/email/entrada`, atendido em `src/server.ts` antes do roteador — não é uma página, não tem sessão e precisa devolver um status que o provedor entenda.

**O domínio de entrada é diferente do domínio da caixa.** O MX de `absolutionsconsultoria.com.br` aponta para a KingHost, onde ficam as caixas de verdade; quem recebe e chama o webhook é o Mailgun, que só enxerga o próprio domínio. Por isso `support_inboxes.dominio_entrada` guarda para onde a resposta é roteada, separado do endereço que aparece para o cliente.

Rota a criar no Mailgun (Receiving → Create Route):

| Campo | Valor |
|---|---|
| Expression | `match_recipient(".*@mg.absolutionsconsultoria.com.br")` |
| Action | `forward("https://www.absolutionsconsultoria.com.br/api/email/entrada")` |

Variáveis:

| Variável | Descrição |
|---|---|
| `MAILGUN_SIGNING_KEY` | chave **de assinatura de webhook**, não a de API |
| `WEBHOOK_EMAIL_SEGREDO` | mesmo valor gravado em `app_segredos` |

**Por que não usa a service_role key.** O webhook chega sem sessão, e o caminho óbvio seria dar a ele a chave de serviço — que ignora todas as políticas de RLS do projeto inteiro, para uma única operação. Em vez disso ele usa a chave publishable e prova quem é com um segredo compartilhado, conferido dentro do Postgres contra um sha256 guardado em `app_segredos` (tabela com RLS e nenhuma política: invisível pela API). Se o ambiente da Railway vazar, o pior caso é alguém postar resposta em um chamado cujo token já teria que conhecer.

Para trocar o segredo:

```sql
select public.definir_segredo('webhook_email', 'novo-valor');
```

O que o webhook descarta em silêncio, respondendo 200 para o Mailgun não reentregar: mensagem repetida (mesmo `Message-Id`), autorresposta de férias, retorno de `mailer-daemon`, eco da própria caixa e resposta que só tem citação. Assinatura inválida devolve 401; endereço sem token válido devolve 406, que faz o Mailgun desistir. Falha de banco devolve 500, e aí ele reentrega depois — nada se perde.

Assim que a resposta é registrada, o aviso para a equipe sai na hora, pelo mesmo webhook. Esperar alguém abrir a tela de suporte derrotaria o propósito da notificação.

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
