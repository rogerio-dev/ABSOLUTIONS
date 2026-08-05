# Material de marketing — AB Solutions

Peças prontas em PNG, todas geradas a partir do mesmo código, com a tipografia e as cores oficiais do site.

## O que tem aqui

| Arquivo | Tamanho | Para que serve |
|---|---|---|
| `avatar-perfil.png` | 1024×1024 | Foto de perfil do WhatsApp Business, LinkedIn e Instagram. Enquadrado com margem para sobreviver ao recorte circular desses apps. |
| `capa-linkedin.png` | 1584×396 | Capa da página da empresa no LinkedIn. |
| `post-processo-gratis.png` | 1080×1080 | Post da oferta do primeiro processo gratuito. |
| `story-processo-gratis.png` | 1080×1920 | Mesma oferta em formato story, para Instagram e status do WhatsApp. |
| `post-servicos.png` | 1080×1080 | Post apresentando os serviços. |
| `logo-horizontal-fundo-escuro.png` | 800×300 | Assinatura com fundo transparente, para usar sobre fundos escuros. |
| `logo-horizontal-fundo-claro.png` | 800×300 | Mesma assinatura com letras e traço escurecidos, para fundos claros — propostas, documentos, apresentações. |
| `simbolo.png` | 1024×1024 | Só o símbolo, fundo transparente. Marca d'água, carimbo, ícone. |

Fora desta pasta, o script também gera `public/img/og-cover.png` (1200×630) — a imagem que aparece quando o link do site é compartilhado no WhatsApp, LinkedIn ou Facebook. Ela fica em `public/` porque as meta tags do site apontam para lá.

## Regerando as peças

Todo o material é código, não arquivo de edição. Para mudar um texto, uma cor ou um tamanho, edite `gerar-assets.js` e rode:

```bash
npm install
node gerar-assets.js
```

As fontes Sora e Inter são baixadas automaticamente na primeira execução, para a renderização usar exatamente a mesma tipografia do site. Elas ficam em `marketing/fonts/` e estão fora do controle de versão.

## Por que assim, e não em um editor de imagem

Manter as peças como código garante que a marca, as cores e os textos fiquem sempre iguais aos do site — se o telefone mudar, você troca em um lugar e regera tudo. Também evita depender de arquivo de projeto de editor gráfico e permite versionar as mudanças junto com o resto.

## Identidade

- Fundo: `#060b18` · Superfície: `#0e1730`
- Destaque: `#22d3ee` (ciano) · Secundária: `#3b82f6` (azul)
- Texto: `#e6edf7` · Texto secundário: `#9db0c9`
- Títulos: Sora 700/800 · Corpo: Inter 400/600
- Símbolo: losango interrompido nas duas arestas da direita, com o "AB" avançando além do vértice. A abertura é proposital — é a letra que fecha a forma.
