# AB Solutions — Site Institucional

Site da **AB Solutions**, consultoria especializada em **TOTVS Fluig** e integrações com os ERPs **RM, Protheus e Datasul**.

## Stack

- **Front-end**: HTML5 + CSS3 + JavaScript puro (sem frameworks — carregamento rápido e SEO máximo)
- **Back-end**: Node.js + Express (serve os arquivos estáticos com compressão gzip e cabeçalhos de segurança/cache)
- **Deploy**: pronto para Railway (ou qualquer host Node)

## Rodando localmente

```bash
npm install
npm start
```

Acesse `http://localhost:3000`.

## Deploy na Railway

1. Suba o projeto para um repositório no GitHub.
2. Na Railway: **New Project → Deploy from GitHub repo** e selecione o repositório.
3. A Railway detecta o `package.json` automaticamente e roda `npm start`. A porta já é lida de `process.env.PORT` — nenhuma configuração extra é necessária.
4. Em **Settings → Networking**, gere o domínio público (ou conecte seu domínio próprio).
5. Mantenha o **auto deploy ligado** (Settings → *Enable* em "Auto deploy"). Sem isso, o botão *Redeploy* apenas reconstrói o commit já publicado e o código novo nunca vai ao ar.

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | não | Definida automaticamente pela Railway. Localmente cai em `3000`. |
| `CANONICAL_HOST` | não | Domínio oficial, ex.: `www.absolutionsconsultoria.com.br`. Quando definida, qualquer acesso por outro endereço (como o `*.up.railway.app`) é redirecionado com 301 para ela, evitando conteúdo duplicado no Google. **Só defina depois que o domínio próprio estiver funcionando** — antes disso, você perderia o acesso de preview pelo endereço da Railway. |

## Domínio

O domínio oficial é **`https://www.absolutionsconsultoria.com.br`**, apontado para a Railway por um CNAME no `www` (DNS no HostGator).

> **Atenção:** o registro `A` do domínio raiz (`@`) aponta para o HostGator e **não deve ser alterado** — o registro `MX` do e-mail resolve através dele. Apontar a raiz para a Railway derrubaria o e-mail do domínio. Por isso o site usa `www`, com redirecionamento 301 da raiz para `www` configurado no cPanel.

Se algum dia o domínio mudar, os pontos a atualizar são:

- `public/index.html` — tag `<link rel="canonical">`, metas `og:url`, `og:image`, `twitter:image` e o `url` do JSON-LD
- `public/robots.txt` — linha do `Sitemap`
- `public/sitemap.xml` — tag `<loc>`

## Pendências

- **Números do hero**: os destaques da seção inicial (“100% foco em Fluig” etc.) são editáveis em `public/index.html` — ajuste conforme a realidade da empresa (anos de experiência, nº de projetos etc.).
- **Redes sociais**: quando tiver LinkedIn/Instagram, adicione as URLs no array `sameAs` do JSON-LD e no rodapé.
- **Google Search Console**: após publicar, cadastre o site e envie o `sitemap.xml` — acelera a indexação.
- **Cache dos assets**: `styles.css` e `main.js` são referenciados com um sufixo `?v=X.Y.Z` no HTML. Sempre que alterar CSS ou JS, **incremente essa versão** nos `<link>`/`<script>` de `index.html` e `404.html` — senão visitantes recorrentes continuam vendo a versão antiga em cache (o servidor manda cache de 7 dias).

## Estrutura

```
├── server.js            # Servidor Express
├── package.json
├── marketing/           # Peças em PNG e o gerador delas (ver README próprio)
└── public/
    ├── index.html       # Página única (landing)
    ├── 404.html
    ├── favicon.svg
    ├── robots.txt
    ├── sitemap.xml
    ├── css/styles.css
    ├── js/main.js       # Partículas, reveal on scroll, menu mobile
    └── img/             # Imagens (og-cover.png vai aqui)
```

## Contato

WhatsApp Business: **(61) 92003-5859** — todos os CTAs do site apontam para `https://wa.me/5561920035859` com mensagem pré-preenchida.
