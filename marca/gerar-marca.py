"""
Gera o kit de marca da AB Solutions.

Tudo aqui é código, não arquivo de editor gráfico. Mudar o telefone, uma cor ou
uma proporção é mexer em um lugar e rodar de novo — e nada sai do lugar sem
alguém ver o diff.

    python marca/gerar-marca.py

As letras do logotipo saem convertidas em curvas, não como <text>. Um SVG que
depende da fonte Sora instalada vira Arial na máquina do cliente, na gráfica ou
no PowerPoint de quem recebeu a proposta — e aí não é mais a marca. Convertido,
o desenho é o mesmo em qualquer lugar, para sempre.

Depende de: fonttools (curvas), @resvg/resvg-js em marketing/node_modules
(rasterização) e as fontes em marketing/fonts/ (baixadas por gerar-assets.js).
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
MARCA = RAIZ / "marca"
FONTES = RAIZ / "marketing" / "fonts"

# ---------------------------------------------------------------
# Paleta
# ---------------------------------------------------------------
# Os mesmos valores do site e dos e-mails. Se um dia divergirem, a marca
# começa a parecer duas empresas.
PALETA = [
    ("Ciano", "#22d3ee", "Destaque. Traço do símbolo, palavra Solutions, botões e links.", "principal"),
    ("Azul", "#3b82f6", "Secundária. Gradientes e apoio, nunca sozinha no lugar do ciano.", "principal"),
    ("Azul-noite", "#060b18", "Fundo. É o preto da marca — preto puro nunca é usado.", "fundo"),
    ("Azul-profundo", "#0e1730", "Superfície. Cartões e blocos sobre o fundo.", "fundo"),
    ("Branco-gelo", "#e6edf7", "Texto sobre fundo escuro.", "texto"),
    ("Cinza-azulado", "#9db0c9", "Texto secundário, legendas, apoio.", "texto"),
    ("Branco", "#ffffff", "As letras AB dentro do símbolo.", "texto"),
]

CIANO, AZUL, FUNDO, SUPERFICIE, TEXTO, TEXTO2 = (
    "#22d3ee", "#3b82f6", "#060b18", "#0e1730", "#e6edf7", "#9db0c9",
)
# Sobre fundo claro o ciano perde contraste; estas são as versões escurecidas.
CIANO_ESCURO = "#0e7490"
AZUL_ESCURO = "#1e3a8a"
TINTA = "#0b1220"

# ---------------------------------------------------------------
# Letras em curvas
# ---------------------------------------------------------------
_fontes: dict[str, TTFont] = {}


def _fonte(peso: str) -> TTFont:
    if peso not in _fontes:
        caminho = FONTES / f"Sora-{peso}.ttf"
        if not caminho.exists():
            sys.exit(
                f"Fonte ausente: {caminho}\n"
                "Rode antes: cd marketing && npm install && node gerar-assets.js"
            )
        _fontes[peso] = TTFont(caminho)
    return _fontes[peso]


def texto_em_curvas(
    frase: str, peso: str, tamanho: float, x: float, y: float,
    cor: str, ancora: str = "start", espacamento: float = 0.0,
) -> str:
    """
    Devolve um <path> com a frase desenhada como contorno.

    `y` é a linha de base, como em <text>. O eixo da fonte cresce para cima e o
    do SVG para baixo, daí a escala negativa em Y.
    """
    fonte = _fonte(peso)
    upm = fonte["head"].unitsPerEm
    escala = tamanho / upm
    cmap = fonte.getBestCmap()
    glifos = fonte.getGlyphSet()
    hmtx = fonte["hmtx"]

    largura = 0.0
    partes: list[str] = []
    for ch in frase:
        nome = cmap.get(ord(ch))
        if nome is None:
            continue
        caneta = SVGPathPen(glifos)
        glifos[nome].draw(caneta)
        d = caneta.getCommands()
        if d:
            partes.append(f'<path d="{d}" transform="translate({largura:.2f} 0)"/>')
        largura += hmtx[nome][0] + espacamento / escala

    total = largura * escala
    deslocamento = {"start": 0.0, "middle": -total / 2, "end": -total}[ancora]

    return (
        f'<g fill="{cor}" transform="translate({x + deslocamento:.2f} {y:.2f}) '
        f'scale({escala:.6f} {-escala:.6f})">{"".join(partes)}</g>'
    )


def largura_do_texto(frase: str, peso: str, tamanho: float, espacamento: float = 0.0) -> float:
    fonte = _fonte(peso)
    upm = fonte["head"].unitsPerEm
    cmap = fonte.getBestCmap()
    hmtx = fonte["hmtx"]
    soma = 0.0
    for ch in frase:
        nome = cmap.get(ord(ch))
        if nome is None:
            continue
        soma += hmtx[nome][0] * tamanho / upm + espacamento
    return soma


# ---------------------------------------------------------------
# Símbolo e assinatura
# ---------------------------------------------------------------
# Losango interrompido nas duas arestas da direita. A abertura é proposital:
# é o "AB" que fecha a forma, avançando além do vértice.
TRACO_SIMBOLO = "M71 27 L50 6 L6 50 L50 94 L71 74"


def simbolo(x: float, y: float, tamanho: float, cor_letras: str, cor_traco: str) -> str:
    e = tamanho / 100
    return (
        f'<g transform="translate({x} {y}) scale({e})">'
        f'<path d="{TRACO_SIMBOLO}" fill="none" stroke="{cor_traco}" stroke-width="5" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        + texto_em_curvas("AB", "Bold", 46, 64, 67, cor_letras, ancora="middle")
        + "</g>"
    )


def medidas_assinatura(altura: float) -> tuple[float, float, float]:
    """Largura total, tamanho da fonte e espaço entre símbolo e palavra."""
    fonte = altura / 2.5
    gap = altura * 0.09
    espaco = -fonte * 0.01
    return altura + gap + largura_do_texto("Solutions", "ExtraBold", fonte, espaco), fonte, gap


def assinatura(x: float, y: float, altura: float, cor_letras: str, cor_texto: str, cor_traco: str) -> str:
    _, fonte, gap = medidas_assinatura(altura)
    baseline = y + altura / 2 + fonte * 0.36
    return simbolo(x, y, altura, cor_letras, cor_traco) + texto_em_curvas(
        "Solutions", "ExtraBold", fonte, x + altura + gap, baseline, cor_texto,
        espacamento=-fonte * 0.01,
    )


def svg(largura: int, altura: int, conteudo: str, fundo: str | None = None) -> str:
    pintura = f'<rect width="{largura}" height="{altura}" fill="{fundo}"/>' if fundo else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{largura}" height="{altura}" '
        f'viewBox="0 0 {largura} {altura}">{pintura}{conteudo}</svg>'
    )


# ---------------------------------------------------------------
# Peças
# ---------------------------------------------------------------
def horizontal(cor_letras: str, cor_texto: str, cor_traco: str, fundo: str | None) -> str:
    """Assinatura deitada, com respiro de meia altura de símbolo em volta."""
    altura_simbolo = 200
    margem = altura_simbolo * 0.5
    largura_marca, _, _ = medidas_assinatura(altura_simbolo)
    w = int(largura_marca + margem * 2)
    h = int(altura_simbolo + margem * 2)
    return svg(w, h, assinatura(margem, margem, altura_simbolo, cor_letras, cor_texto, cor_traco), fundo)


def vertical(cor_letras: str, cor_texto: str, cor_traco: str, fundo: str | None) -> str:
    """Símbolo em cima, palavra embaixo. Para espaço quadrado ou estreito."""
    tam = 260
    fonte = tam / 2.6
    espaco = -fonte * 0.01
    largura_palavra = largura_do_texto("Solutions", "ExtraBold", fonte, espaco)
    margem = 70
    w = int(max(tam, largura_palavra) + margem * 2)
    h = int(tam + fonte * 1.5 + margem * 2)
    conteudo = simbolo((w - tam) / 2, margem, tam, cor_letras, cor_traco) + texto_em_curvas(
        "Solutions", "ExtraBold", fonte, w / 2, margem + tam + fonte * 1.05,
        cor_texto, ancora="middle", espacamento=espaco,
    )
    return svg(w, h, conteudo, fundo)


def so_simbolo(cor_letras: str, cor_traco: str, fundo: str | None, margem_pct: float = 0.12) -> str:
    lado = 1024
    tam = lado * (1 - margem_pct * 2)
    return svg(lado, lado, simbolo((lado - tam) / 2, (lado - tam) / 2, tam, cor_letras, cor_traco), fundo)


def favicon(lado: int = 100, raio: int = 22, sangria: bool = False) -> str:
    """
    Ícone quadrado. `sangria` gera a versão maskable: fundo até a borda e
    símbolo menor, porque o Android recorta o ícone em formatos variados e come
    até 20% de cada lado.
    """
    if sangria:
        tam = lado * 0.56
        pos = (lado - tam) / 2
        conteudo = (
            f'<rect width="{lado}" height="{lado}" fill="{FUNDO}"/>'
            + simbolo(pos, pos, tam, "#ffffff", CIANO)
        )
    else:
        r = raio * lado / 100
        tam = lado * 0.88
        pos = (lado - tam) / 2
        conteudo = (
            f'<rect width="{lado}" height="{lado}" rx="{r}" fill="{FUNDO}"/>'
            + simbolo(pos, pos, tam, "#ffffff", CIANO)
        )
    return svg(lado, lado, conteudo)


def folha_de_paleta() -> str:
    """Cartela com as cores, o nome, o hex, o RGB e para que serve cada uma."""
    largura, alto_linha, topo = 1400, 132, 210
    altura = topo + alto_linha * len(PALETA) + 70

    partes = [f'<rect width="{largura}" height="{altura}" fill="{FUNDO}"/>']
    partes.append(assinatura(70, 56, 96, "#ffffff", CIANO, CIANO))
    partes.append(texto_em_curvas("Paleta oficial", "ExtraBold", 34, 70, 190, TEXTO))

    for i, (nome, hexa, uso, _) in enumerate(PALETA):
        y = topo + i * alto_linha
        r, g, b = (int(hexa[j : j + 2], 16) for j in (1, 3, 5))
        borda = ' stroke="#2a3a56" stroke-width="2"' if hexa in (FUNDO, SUPERFICIE) else ""
        partes.append(f'<rect x="70" y="{y}" width="150" height="100" rx="14" fill="{hexa}"{borda}/>')
        partes.append(texto_em_curvas(nome, "ExtraBold", 30, 254, y + 40, TEXTO))
        partes.append(texto_em_curvas(uso, "Bold", 21, 254, y + 76, TEXTO2))
        partes.append(texto_em_curvas(hexa.upper(), "ExtraBold", 28, largura - 70, y + 40, CIANO, ancora="end"))
        partes.append(
            texto_em_curvas(f"RGB {r} {g} {b}", "Bold", 21, largura - 70, y + 76, TEXTO2, ancora="end")
        )

    return svg(largura, altura, "".join(partes))


def folha_da_marca() -> str:
    """Uma página com o essencial: versões, área de proteção e o que não fazer."""
    largura, altura = 1600, 2180
    p = [f'<rect width="{largura}" height="{altura}" fill="{FUNDO}"/>']

    def titulo(texto: str, y: float) -> None:
        p.append(texto_em_curvas(texto, "ExtraBold", 30, 80, y, CIANO))
        p.append(f'<rect x="80" y="{y + 18}" width="{largura - 160}" height="2" fill="#1e2b45"/>')

    def legenda(texto: str, x: float, y: float) -> None:
        p.append(texto_em_curvas(texto, "Bold", 20, x, y, TEXTO2))

    p.append(assinatura(80, 70, 120, "#ffffff", CIANO, CIANO))
    p.append(texto_em_curvas("Manual rápido da marca", "ExtraBold", 40, 80, 268, TEXTO))
    p.append(
        texto_em_curvas(
            "Consultoria TOTVS Fluig  ·  absolutionsconsultoria.com.br", "Bold", 22, 80, 306, TEXTO2
        )
    )

    titulo("Assinatura principal", 400)
    p.append(assinatura(80, 440, 110, "#ffffff", CIANO, CIANO))
    legenda("Sobre fundo escuro. É a versão padrão.", 80, 596)

    titulo("Sobre fundo claro", 680)
    p.append(f'<rect x="80" y="716" width="{largura - 160}" height="180" rx="16" fill="#ffffff"/>')
    p.append(assinatura(120, 750, 110, TINTA, CIANO_ESCURO, CIANO_ESCURO))
    legenda("O ciano escurece para manter contraste sobre branco.", 80, 930)

    titulo("Uma cor só", 1010)
    p.append(f'<rect x="80" y="1046" width="700" height="170" rx="16" fill="#ffffff"/>')
    p.append(assinatura(120, 1078, 105, TINTA, TINTA, TINTA))
    p.append(f'<rect x="820" y="1046" width="700" height="170" rx="16" fill="{SUPERFICIE}"/>')
    p.append(assinatura(860, 1078, 105, "#ffffff", "#ffffff", "#ffffff"))
    legenda("Gravação, carimbo, fax, bordado, jornal. Sem meio-tom.", 80, 1250)

    # A moldura tracejada precisa de folga própria: se ela encostar no título de
    # cima ou na legenda de baixo, a página passa a ensinar o contrário do que diz.
    titulo("Área de proteção e tamanho mínimo", 1330)
    marca_y, marca_altura = 1420, 110
    guarda = marca_altura * 0.5
    p.append(
        f'<rect x="{140 - guarda}" y="{marca_y - guarda}" '
        f'width="{medidas_assinatura(marca_altura)[0] + guarda * 2}" '
        f'height="{marca_altura + guarda * 2}" '
        f'rx="8" fill="none" stroke="{CIANO}" stroke-width="2" stroke-dasharray="8 8" opacity="0.55"/>'
    )
    p.append(assinatura(140, marca_y, marca_altura, "#ffffff", CIANO, CIANO))
    legenda("Nada entra na moldura tracejada: o respiro é metade da altura do símbolo.", 80, 1640)

    p.append(assinatura(140, 1690, 34, "#ffffff", CIANO, CIANO))
    legenda("Mínimo legível: 24 mm de largura em papel, 120 px em tela.", 80, 1780)

    titulo("O que não fazer", 1860)
    itens = [
        "Não trocar as cores do símbolo nem preencher o losango.",
        "Não fechar a abertura do losango — é o gesto da marca.",
        "Não redigitar o nome: as letras são curvas, não texto em Sora.",
        "Não distorcer, inclinar, contornar nem aplicar sombra.",
        "Não usar sobre foto sem uma faixa sólida por trás.",
    ]
    for i, item in enumerate(itens):
        y = 1920 + i * 40
        p.append(f'<circle cx="90" cy="{y - 6}" r="4" fill="#f43f5e"/>')
        p.append(texto_em_curvas(item, "Bold", 21, 108, y, TEXTO))

    return svg(largura, altura, "".join(p))


# ---------------------------------------------------------------
# Escrita
# ---------------------------------------------------------------
def main() -> None:
    for sub in ("logo", "favicon", "paleta"):
        (MARCA / sub).mkdir(parents=True, exist_ok=True)

    svgs: dict[str, str] = {
        # Assinatura deitada
        "logo/ab-solutions-fundo-escuro.svg": horizontal("#ffffff", CIANO, CIANO, None),
        "logo/ab-solutions-fundo-claro.svg": horizontal(TINTA, CIANO_ESCURO, CIANO_ESCURO, None),
        "logo/ab-solutions-branco.svg": horizontal("#ffffff", "#ffffff", "#ffffff", None),
        "logo/ab-solutions-preto.svg": horizontal("#000000", "#000000", "#000000", None),
        # Empilhada
        "logo/ab-solutions-vertical-fundo-escuro.svg": vertical("#ffffff", CIANO, CIANO, None),
        "logo/ab-solutions-vertical-fundo-claro.svg": vertical(TINTA, CIANO_ESCURO, CIANO_ESCURO, None),
        # Só o símbolo
        "logo/simbolo-cor.svg": so_simbolo("#ffffff", CIANO, None),
        "logo/simbolo-fundo-claro.svg": so_simbolo(TINTA, CIANO_ESCURO, None),
        "logo/simbolo-branco.svg": so_simbolo("#ffffff", "#ffffff", None),
        "logo/simbolo-preto.svg": so_simbolo("#000000", "#000000", None),
        # Ícones
        "favicon/favicon.svg": favicon(),
        "favicon/icone-maskable.svg": favicon(sangria=True),
        # Cartelas
        "paleta/paleta.svg": folha_de_paleta(),
        "manual-da-marca.svg": folha_da_marca(),
    }

    for nome, conteudo in svgs.items():
        (MARCA / nome).write_text(conteudo, encoding="utf-8")
    print(f"{len(svgs)} arquivos SVG escritos")

    # Paleta em formatos que se usa sem abrir imagem
    (MARCA / "paleta" / "paleta.json").write_text(
        json.dumps(
            {
                "marca": "AB Solutions",
                "cores": [
                    {
                        "nome": n,
                        "hex": h,
                        "rgb": [int(h[i : i + 2], 16) for i in (1, 3, 5)],
                        "papel": grupo,
                        "uso": u,
                    }
                    for n, h, u, grupo in PALETA
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    css = ["/* Paleta AB Solutions. Gerado por marca/gerar-marca.py. */", ":root {"]
    apelidos = {
        "Ciano": "ciano", "Azul": "azul", "Azul-noite": "fundo", "Azul-profundo": "superficie",
        "Branco-gelo": "texto", "Cinza-azulado": "texto-suave", "Branco": "branco",
    }
    for nome, hexa, uso, _ in PALETA:
        css.append(f"  /* {uso} */")
        css.append(f"  --ab-{apelidos[nome]}: {hexa};")
    css += ["", "  /* Versões escurecidas, para uso sobre fundo claro */",
            f"  --ab-ciano-escuro: {CIANO_ESCURO};", f"  --ab-azul-escuro: {AZUL_ESCURO};",
            f"  --ab-tinta: {TINTA};", "}", ""]
    (MARCA / "paleta" / "paleta.css").write_text("\n".join(css), encoding="utf-8")

    linhas = ["AB Solutions — paleta oficial", ""]
    for nome, hexa, uso, _ in PALETA:
        r, g, b = (int(hexa[i : i + 2], 16) for i in (1, 3, 5))
        linhas.append(f"{nome:<16} {hexa.upper()}   RGB {r:>3} {g:>3} {b:>3}   {uso}")
    linhas += ["", "Sobre fundo claro, use as versões escurecidas:",
               f"Ciano escuro     {CIANO_ESCURO.upper()}", f"Azul escuro      {AZUL_ESCURO.upper()}",
               f"Tinta            {TINTA.upper()}", "",
               "Tipografia: Sora (títulos, 700/800) · Inter (corpo, 400/600)", ""]
    (MARCA / "paleta" / "paleta.txt").write_text("\n".join(linhas), encoding="utf-8")
    print("paleta em json, css e txt")

    rasterizar()
    montar_ico()


PNGS = [
    # (svg de origem, arquivo de saída, largura em px)
    ("logo/ab-solutions-fundo-escuro.svg", "logo/ab-solutions-fundo-escuro.png", 2000),
    ("logo/ab-solutions-fundo-claro.svg", "logo/ab-solutions-fundo-claro.png", 2000),
    ("logo/ab-solutions-branco.svg", "logo/ab-solutions-branco.png", 2000),
    ("logo/ab-solutions-preto.svg", "logo/ab-solutions-preto.png", 2000),
    ("logo/ab-solutions-vertical-fundo-escuro.svg", "logo/ab-solutions-vertical-fundo-escuro.png", 1200),
    ("logo/ab-solutions-vertical-fundo-claro.svg", "logo/ab-solutions-vertical-fundo-claro.png", 1200),
    ("logo/simbolo-cor.svg", "logo/simbolo-cor.png", 1024),
    ("logo/simbolo-fundo-claro.svg", "logo/simbolo-fundo-claro.png", 1024),
    ("logo/simbolo-branco.svg", "logo/simbolo-branco.png", 1024),
    ("logo/simbolo-preto.svg", "logo/simbolo-preto.png", 1024),
    ("favicon/favicon.svg", "favicon/favicon-16.png", 16),
    ("favicon/favicon.svg", "favicon/favicon-32.png", 32),
    ("favicon/favicon.svg", "favicon/favicon-48.png", 48),
    ("favicon/favicon.svg", "favicon/favicon-64.png", 64),
    ("favicon/favicon.svg", "favicon/apple-touch-icon.png", 180),
    ("favicon/favicon.svg", "favicon/icone-192.png", 192),
    ("favicon/favicon.svg", "favicon/icone-512.png", 512),
    ("favicon/icone-maskable.svg", "favicon/icone-maskable-512.png", 512),
    ("paleta/paleta.svg", "paleta/paleta.png", 1400),
    ("manual-da-marca.svg", "manual-da-marca.png", 1600),
]


def rasterizar() -> None:
    """Converte cada SVG em PNG usando o resvg que já está em marketing/."""
    # .cjs porque o package.json do projeto declara "type": "module".
    script = MARCA / ".rasterizar.cjs"
    script.write_text(
        "const { Resvg } = require(%s);\n"
        "const fs = require('fs');\n"
        "for (const [origem, destino, largura] of JSON.parse(process.argv[2])) {\n"
        "  const svg = fs.readFileSync(origem, 'utf8');\n"
        "  const r = new Resvg(svg, { fitTo: { mode: 'width', value: largura } });\n"
        "  fs.writeFileSync(destino, r.render().asPng());\n"
        "}\n"
        "console.log('png:', JSON.parse(process.argv[2]).length);\n"
        % json.dumps(str((RAIZ / "marketing" / "node_modules" / "@resvg" / "resvg-js").as_posix())),
        encoding="utf-8",
    )
    tarefas = [[str((MARCA / o).as_posix()), str((MARCA / d).as_posix()), w] for o, d, w in PNGS]
    r = subprocess.run(
        ["node", str(script), json.dumps(tarefas)], capture_output=True, text=True, cwd=str(MARCA)
    )
    script.unlink(missing_ok=True)
    if r.returncode != 0:
        sys.exit(f"falha ao rasterizar:\n{r.stderr[:600]}")
    print(r.stdout.strip())


def montar_ico() -> None:
    """
    Empacota 16, 32 e 48 px em um favicon.ico.

    O .ico não morreu: é o que o Windows usa em atalho e barra de tarefas, e o
    que navegador antigo procura antes de olhar o SVG.
    """
    from PIL import Image

    origem = MARCA / "favicon" / "favicon-64.png"
    imagens = [Image.open(origem).resize((n, n), Image.LANCZOS) for n in (48, 32, 16)]
    imagens[0].save(
        MARCA / "favicon" / "favicon.ico", format="ICO",
        sizes=[(48, 48), (32, 32), (16, 16)], append_images=imagens[1:],
    )
    print("favicon.ico com 16, 32 e 48 px")


if __name__ == "__main__":
    if shutil.which("node") is None:
        sys.exit("node não encontrado no PATH")
    os.chdir(RAIZ)
    main()
