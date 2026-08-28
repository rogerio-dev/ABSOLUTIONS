# Marca AB Solutions

O gerador da identidade. **Os arquivos ficam em [`../public/marca/`](../../public/marca)** — de lá o servidor os entrega, e a tela **Marketing** do sistema baixa exatamente os mesmos arquivos que estão no repositório, sem cópia paralela para desencontrar.

Kit completo: logotipo, ícones e paleta. É esta pasta que você manda para uma gráfica, uma agência, um parceiro ou quem for montar uma apresentação.

Comece por **`manual-da-marca.png`** — uma página com as versões, o respiro obrigatório, o tamanho mínimo e o que não fazer.

## Logotipo

Tudo em `logo/`, em **SVG** e **PNG**. Fundo transparente nos dois.

| Arquivo | Quando usar |
|---|---|
| `ab-solutions-fundo-escuro` | **Padrão.** Sobre o azul-noite da marca ou qualquer fundo escuro |
| `ab-solutions-fundo-claro` | Sobre branco ou claro. O ciano vem escurecido para manter contraste |
| `ab-solutions-branco` | Uma cor só, tudo branco. Sobre foto, cor chapada, vídeo |
| `ab-solutions-preto` | Uma cor só, tudo preto. Gravação, carimbo, bordado, jornal, fax |
| `ab-solutions-vertical-fundo-escuro` | Empilhada, para espaço quadrado ou estreito |
| `ab-solutions-vertical-fundo-claro` | A mesma, sobre claro |
| `simbolo-cor` | Só o losango com o AB. Avatar, marca d'água, carimbo |
| `simbolo-fundo-claro` / `simbolo-branco` / `simbolo-preto` | O símbolo nas demais versões |

**Use o SVG sempre que puder.** Ele não perde qualidade em nenhum tamanho — de cartão de visita a fachada. O PNG existe para onde o SVG não entra: WhatsApp, alguns campos de upload, versões antigas do Office.

### As letras são curvas, não texto

Nenhum arquivo depende da fonte Sora estar instalada. Isso importa mais do que parece: um SVG com texto vivo vira Arial na máquina de quem abrir, e aí não é mais a sua marca — é outra coisa parecida. Convertido em curvas, o desenho é idêntico em qualquer computador, gráfica ou PowerPoint.

O efeito colateral é que **o nome não pode ser reescrito**. Para mudar qualquer texto, é no gerador.

## Ícones

Em `favicon/`.

| Arquivo | Onde entra |
|---|---|
| `favicon.svg` | Navegadores atuais. Nítido em qualquer densidade de tela |
| `favicon.ico` | Windows, atalho, barra de tarefas, navegador antigo. Traz 16, 32 e 48 px dentro |
| `favicon-16/32/48/64.png` | Onde pedirem um tamanho específico |
| `apple-touch-icon.png` | 180 px. iPhone e iPad, quando salvam o site na tela inicial |
| `icone-192.png` e `icone-512.png` | Android e instalação como aplicativo |
| `icone-maskable-512.png` | Android moderno, que recorta o ícone em círculo, quadrado ou gota. Por isso o símbolo vem menor e o fundo sangra até a borda — o recorte come até 20% de cada lado |

## Paleta

Em `paleta/`, no formato que cada um precisa:

- **`paleta.png`** — cartela visual com nome, hex, RGB e para que serve cada cor. É o que se manda para um designer
- **`paleta.txt`** — a mesma coisa em texto, para colar em e-mail ou briefing
- **`paleta.json`** — para consumir em código
- **`paleta.css`** — variáveis prontas para usar em qualquer página

| Cor | Hex | Papel |
|---|---|---|
| Ciano | `#22D3EE` | Destaque. Traço do símbolo, palavra Solutions, botões |
| Azul | `#3B82F6` | Secundária. Gradientes e apoio |
| Azul-noite | `#060B18` | Fundo. É o preto da marca — preto puro nunca é usado |
| Azul-profundo | `#0E1730` | Superfície. Cartões e blocos sobre o fundo |
| Branco-gelo | `#E6EDF7` | Texto sobre fundo escuro |
| Cinza-azulado | `#9DB0C9` | Texto secundário e legendas |

Sobre fundo claro, o ciano `#22D3EE` some. Use `#0E7490` no lugar, e `#0B1220` como tinta do texto.

**Tipografia:** Sora (títulos, 700/800) e Inter (corpo, 400/600). Ambas são gratuitas no Google Fonts.

## Regerando tudo

```bash
python marca/gerar-marca.py
```

As peças são código, não arquivo de editor gráfico. Trocar uma cor, uma proporção ou um texto do manual é mexer em `gerar-marca.py` e rodar de novo — nada sai do lugar sem alguém ver o diff, e as versões nunca divergem entre si.

Precisa de `fonttools` (`pip install fonttools`), das fontes em `marketing/fonts/` e do `@resvg/resvg-js` em `marketing/node_modules/`. As duas últimas vêm de `cd marketing && npm install && node gerar-assets.js`.

## Isto aqui e a pasta `marketing/`

São coisas diferentes, e vale não misturar:

- **`marca/`** é a identidade: os arquivos-fonte da marca, para qualquer uso
- **`marketing/`** são peças prontas para publicar — post de Instagram, capa de LinkedIn, story, imagem de compartilhamento do site
