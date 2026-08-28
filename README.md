# AB Solutions

Site institucional, CRM interno e portal do cliente — **uma única aplicação**, um domínio, um deploy.

## Como está organizado

| Rota | O que é | Acesso |
|---|---|---|
| `/` | Site institucional: serviços, oferta do processo gratuito, FAQ | público |
| `/auth` | Login e cadastro | público |
| `/painel`, `/funil`, `/clientes`, `/contratos`, `/projetos`, `/agenda`, `/equipe` | CRM interno | equipe |
| `/marketing` | Central da marca: logotipo, ícones, paleta e peças prontas | equipe |
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

As tabelas têm Row Level Security ativo, com quatro perfis:

| Perfil | Função de guarda | Alcance |
|---|---|---|
| **admin** | `is_staff()` + `has_role('admin')` | tudo, mais acessos e a visão de suporte por analista |
| **interno** | `is_staff()` | CRM completo e atendimento de chamados |
| **analista** | `is_suporte()` | só o suporte: fila, chamados, SLA. O CRM não aparece |
| **cliente** | `my_client_id()` | os próprios registros, e atividades apenas quando marcadas como visíveis |

`is_suporte()` cobre admin, interno e analista; `is_staff()` cobre só admin e interno. Toda política do módulo de suporte usa a primeira, e tudo que é CRM usa a segunda. O analista lê `clients` e `profiles` porque precisa do nome da empresa e de quem atende no chamado — e só isso: funil, contratos, projetos e contatos continuam atrás de `is_staff()`, e devolvem zero linha para ele.

As funções de autorização têm execução revogada para `anon` e `public`, e só administradores gerenciam papéis. O primeiro cadastro vira administrador por gatilho; os seguintes dependem de liberação.

Migrações em `supabase/migrations/`.

## Autenticação

E-mail e senha via Supabase. O botão "Continuar com Google" usa o OAuth nativo do Supabase — exige habilitar o provedor em **Authentication → Providers** no painel. Sem isso, o botão retorna erro e apenas o login por senha funciona.


## Suporte: fila e responsáveis

### Situações

| Situação | No banco | O que significa | SLA |
|---|---|---|---|
| Novo | `novo` | chegou, ninguém tocou | correndo |
| Aberto | `em_atendimento` | está comigo, em análise | correndo |
| Pendente | `aguardando_cliente` | esperando retorno do solicitante | **pausado** |
| Em espera | `em_espera` | parado por outra área interna | correndo |
| Resolvido | `resolvido` | problema resolvido | encerrado |
| Fechado | `fechado` | encerrado definitivamente | encerrado |

**Pendente pausa o relógio; Em espera não.** A diferença não é detalhe: quando a bola está com o cliente, o tempo não é nosso; quando a bola está com outra área nossa, é. O tempo parado em Pendente volta a empurrar o prazo de resolução no momento em que o cliente responde — e responder já devolve o chamado para Aberto, sem ninguém precisar lembrar.

A resposta e a situação saem no mesmo gesto: o botão de envio diz **Enviar como Aberto** (ou Pendente, Em espera, Resolvido), e o menu ao lado troca a escolha. Separar as duas coisas é como chamado fica marcado como aberto por uma semana esperando o cliente.

### Responsável

A fila mostra tudo, e o analista assume ao se colocar como responsável — pela tela do chamado ou pelo botão **Assumir** direto no cartão. Toda troca de responsável vira registro no histórico, então "quem pegou e largou este chamado" não depende da memória de quem estava por perto.

A tela de suporte tem três recortes, e um quarto para o admin:

- **Caixa geral** — abertos sem dono, o que precisa de alguém
- **Meus chamados** — o que eu assumi
- **Todos** — a fila inteira
- **Por analista** (admin) — carga do time: em aberto, fora do prazo, pendentes, em espera e resolvidos nos últimos 30 dias. Clicar em uma linha filtra a lista para aquele analista

### A tela não precisa de F5

A fila e a conversa se atualizam sozinhas pelo Realtime do Postgres. Fila que exige F5 é fila que atrasa: dois analistas pegam o mesmo chamado, a resposta do cliente fica meia hora invisível, o SLA corre sem ninguém ver.

As tabelas `tickets` e `ticket_messages` estão na publicação `supabase_realtime`, com `REPLICA IDENTITY FULL` — é o que faz a linha inteira ir no evento e permite ao Realtime aplicar RLS sobre o registro alterado.

**O Realtime respeita RLS**, e isso foi verificado: um analista autenticado recebe os eventos; um assinante anônimo, com o mesmo canal e a mesma chave publishable, não recebe nada.

WebSocket cai — rede corporativa bloqueia, proxy derruba, notebook dorme. Então o indicador **ao vivo** no topo da tela não é enfeite: quando o canal está no ar, a recarga automática fica em 2 minutos, só como rede de segurança; quando cai, aperta para 20 segundos e o rótulo muda. Sem esse aviso, quem olha uma fila parada não sabe se não há nada novo ou se a tela travou — e na dúvida recarrega, que é o hábito que o tempo real veio tirar.

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

### Formato das mensagens

Todo envio sai em `multipart/alternative`: HTML e texto puro na mesma mensagem. O texto não é enfeite — é o que aparece em leitor de tela, em relógio e em cliente que recusa HTML.

**O HTML é quase texto, e isso é a decisão principal.** A primeira versão era um cartão: fundo cinza, caixa branca com borda arredondada, rótulo colorido em caixa alta, tabelas aninhadas. O Gmail mandou para Promoções — e leu certo, porque aquilo tinha exatamente a forma de uma newsletter. O classificador olha estrutura, não intenção: tabela aninhada com cor de fundo, borda arredondada, botão e cabeçalho colorido somam pontos para Promoções; e-mail que parece carta escrita por gente vai para Principal.

O modelo atual é uma coluna só, sem cor de fundo, sem cartão, sem borda, sem tabela, sem imagem. Só tipografia.

O resto continua conservador porque cliente de e-mail corporativo é ambiente hostil:

- **estilo sempre inline.** O Outlook renderiza com o motor do Word: flexbox, grid e folha de estilo no `<head>` são descartados
- **nenhuma imagem, fonte externa ou rastreador.** Imagem é bloqueada por padrão e deixa buraco; recurso externo pesa no filtro. O rastreamento de abertura e a reescrita de link do Mailgun ficam desligados por chamada (`o:tracking=no`) — pixel e link mascarado são exatamente o que filtro corporativo procura, e aqui o ganho seria zero
- **fontes do sistema, 620px, tudo curto.** O corte do Gmail em 102KB nunca chega perto

**O remetente usa o domínio raiz**, não o subdomínio de envio:

```
EMAIL_REMETENTE=Suporte AB Solutions <suporte@absolutionsconsultoria.com.br>
MAILGUN_DOMINIO=mg.absolutionsconsultoria.com.br
```

O DKIM assina como `d=mg.absolutionsconsultoria.com.br`, e o DMARC do domínio está em alinhamento relaxado (sem `adkim=s`), então subdomínio e raiz alinham e a autenticação passa. O ganho é de leitura humana: `@absolutionsconsultoria.com.br` é reconhecível, `@mg.…` parece endereço de máquina. Se um dia o DMARC virar `adkim=s`, esta escolha para de funcionar e o remetente tem que voltar para o subdomínio.

As mensagens de um mesmo chamado carregam `References` e `In-Reply-To` apontando para uma raiz sintética (`<chamado-1000@absolutionsconsultoria.com.br>`). Gmail, Outlook e Apple Mail agrupam por ela, então a conversa vira uma thread só na caixa do cliente em vez de dez e-mails soltos com o mesmo assunto. O domínio dessa raiz é fixo no código, não vem do remetente: se viesse, trocar o endereço de envio partiria a conversa do cliente em duas no meio do chamado.

O texto puro separa as seções com uma régua de hífens. Isso serve ao caminho de volta: quando o cliente responde citando a mensagem inteira, é por esse marcador que a citação é reconhecida e removida antes de virar comentário.

**O que o código não resolve.** Colocação em Principal depende também de reputação, que um subdomínio novo ainda não tem, e de aprendizado por destinatário: o Gmail observa quem abre, responde e move de aba. Marcar "Mover para Principal" uma vez ensina aquela caixa. Cliente que responde por e-mail ensina mais rápido ainda, porque conversa respondida é o sinal mais forte que existe.

### Recebimento de respostas

Cada chamado tem um endereço próprio, no formato `comercial+t1000-<token>@mg.absolutionsconsultoria.com.br`. Quem responde não digita isso: é o `Reply-To` da notificação. Responder ao e-mail já basta, e a resposta vira mensagem pública do chamado.

O caminho é `POST /api/email/entrada`, atendido em `src/server.ts` antes do roteador — não é uma página, não tem sessão e precisa devolver um status que o provedor entenda.

**O domínio de entrada é diferente do domínio da caixa.** O MX de `absolutionsconsultoria.com.br` aponta para a KingHost, onde ficam as caixas de verdade; quem recebe e chama o webhook é o Mailgun, que só enxerga o próprio domínio. Por isso `support_inboxes.dominio_entrada` guarda para onde a resposta é roteada, separado do endereço que aparece para o cliente.

Rota no Mailgun (Receiving → Routes), já criada:

| Campo | Valor |
|---|---|
| Expression | `match_recipient(".*@mg.absolutionsconsultoria.com.br")` |
| Action | `forward("https://www.absolutionsconsultoria.com.br/api/email/entrada?k=<segredo>")` |
| Action | `stop()` |

Variáveis:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `WEBHOOK_EMAIL_SEGREDO` | sim | mesmo valor gravado em `app_segredos`, e o `k=` da URL da rota |
| `MAILGUN_SIGNING_KEY` | não | chave **de assinatura de webhook** (não a de API) |

A rota é autorizada de dois jeitos, e o primeiro que servir vale: assinatura HMAC do provedor, quando `MAILGUN_SIGNING_KEY` existe, ou o segredo na própria URL. A assinatura é o caminho forte — prova a origem e não se repete. O segredo na URL é mais fraco, porque a URL fica guardada na configuração do provedor e pode entrar em log, mas dispensa copiar uma segunda chave e o segredo já é necessário de todo jeito para falar com o banco. Sem nenhum dos dois, a rota responde 503 e recusa tudo.

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
