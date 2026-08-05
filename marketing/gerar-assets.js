/*
 * Gera o material de marketing em PNG a partir de definições em SVG.
 * As peças saem em marketing/, exceto a imagem de compartilhamento,
 * que vai para public/img/og-cover.png porque o site aponta para ela.
 *
 *   npm install
 *   node gerar-assets.js
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const PROJETO = path.resolve(__dirname, '..');
const MKT = path.join(PROJETO, 'marketing');
const IMG = path.join(PROJETO, 'public', 'img');
fs.mkdirSync(MKT, { recursive: true });
fs.mkdirSync(IMG, { recursive: true });

/* As fontes do site não estão instaladas no sistema, então são baixadas
   uma vez e passadas explicitamente ao renderizador. */
const DIR_FONTES = path.join(__dirname, 'fonts');
const ARQ_FONTES = {
  'Sora-Bold.ttf': 'https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSe1mX-K.ttf',
  'Sora-ExtraBold.ttf': 'https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSfSmX-K.ttf',
  'Inter-Regular.ttf': 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  'Inter-SemiBold.ttf': 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf'
};

async function garantirFontes() {
  fs.mkdirSync(DIR_FONTES, { recursive: true });
  for (const [nome, url] of Object.entries(ARQ_FONTES)) {
    const destino = path.join(DIR_FONTES, nome);
    if (fs.existsSync(destino)) continue;
    process.stdout.write(`baixando ${nome}... `);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`falha ao baixar ${nome}: HTTP ${resp.status}`);
    fs.writeFileSync(destino, Buffer.from(await resp.arrayBuffer()));
    console.log('ok');
  }
}

const FONTES = Object.keys(ARQ_FONTES).map(f => path.join(DIR_FONTES, f));

const CIANO = '#22d3ee';
const AZUL = '#3b82f6';
const FUNDO = '#060b18';
const ESCURO = '#0e1730';

/* Símbolo: losango aberto à direita, o B avança além do vértice.
   Desenhado em uma caixa de 100x100 e escalado onde for usado. */
function simbolo(x, y, tamanho, corLetras = '#ffffff', corTraco = CIANO) {
  const e = tamanho / 100;
  return `<g transform="translate(${x} ${y}) scale(${e})">
    <path d="M71 27 L50 6 L6 50 L50 94 L71 74" fill="none" stroke="${corTraco}"
          stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="64" y="67" text-anchor="middle" font-family="Sora" font-size="46"
          font-weight="700" fill="${corLetras}">AB</text>
  </g>`;
}

/* Assinatura completa: símbolo + "Solutions", nas mesmas proporções do site */
function assinatura(x, y, alturaSimbolo, corLetras = '#ffffff', corTexto = CIANO, corTraco = CIANO) {
  const fonte = alturaSimbolo / 2.5;
  const gap = alturaSimbolo * 0.09;
  const baseline = y + alturaSimbolo / 2 + fonte * 0.36;
  return `${simbolo(x, y, alturaSimbolo, corLetras, corTraco)}
    <text x="${x + alturaSimbolo + gap}" y="${baseline}" font-family="Sora" font-size="${fonte}"
          font-weight="800" fill="${corTexto}" letter-spacing="${-fonte * 0.01}">Solutions</text>`;
}

function fundo(w, h) {
  return `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="${w}" y2="${h}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${FUNDO}"/>
        <stop offset="1" stop-color="${ESCURO}"/>
      </linearGradient>
      <radialGradient id="brilho" cx="0.75" cy="0.15" r="0.7">
        <stop offset="0" stop-color="${AZUL}" stop-opacity="0.30"/>
        <stop offset="1" stop-color="${AZUL}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="brilho2" cx="0.1" cy="0.9" r="0.6">
        <stop offset="0" stop-color="${CIANO}" stop-opacity="0.22"/>
        <stop offset="1" stop-color="${CIANO}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#brilho)"/>
    <rect width="${w}" height="${h}" fill="url(#brilho2)"/>`;
}

/* Losangos decorativos ao fundo, ecoando o símbolo da marca */
function ornamento(w, h, opacidade = 0.07) {
  let g = '';
  const pontos = [[w * 0.86, h * 0.72, 150], [w * 0.72, h * 0.18, 90], [w * 0.94, h * 0.36, 60]];
  for (const [cx, cy, t] of pontos) {
    g += `<rect x="${cx - t / 2}" y="${cy - t / 2}" width="${t}" height="${t}" fill="none"
            stroke="${CIANO}" stroke-width="3" opacity="${opacidade}"
            transform="rotate(45 ${cx} ${cy})"/>`;
  }
  return g;
}

const wpp = '(61) 92003-5859';
const site = 'absolutionsconsultoria.com.br';

const pecas = [];

/* 1. Imagem de compartilhamento — WhatsApp, LinkedIn, Facebook */
pecas.push({
  arquivo: path.join(IMG, 'og-cover.png'), w: 1200, h: 630,
  svg: (w, h) => `${fundo(w, h)}${ornamento(w, h)}
    ${assinatura(80, 62, 96)}
    <text x="80" y="290" font-family="Sora" font-size="66" font-weight="800" fill="#ffffff">Especialistas em</text>
    <text x="80" y="366" font-family="Sora" font-size="66" font-weight="800" fill="${CIANO}">TOTVS Fluig</text>
    <text x="80" y="440" font-family="Inter" font-size="30" fill="#9db0c9">Workflows, formulários, portais e integrações</text>
    <text x="80" y="482" font-family="Inter" font-size="30" fill="#9db0c9">com RM, Protheus e Datasul.</text>
    <rect x="80" y="530" width="360" height="60" rx="30" fill="${CIANO}"/>
    <text x="260" y="569" text-anchor="middle" font-family="Inter" font-size="26" font-weight="600" fill="#04121a">${wpp}</text>
    <text x="1120" y="569" text-anchor="end" font-family="Inter" font-size="24" fill="#8ea3bf">${site}</text>`
});

/* 2. Assinatura horizontal, fundo transparente, para uso sobre fundo escuro */
pecas.push({
  arquivo: path.join(MKT, 'logo-horizontal-fundo-escuro.png'), w: 800, h: 300, transparente: true,
  svg: () => assinatura(60, 70, 160)
});

/* 3. Assinatura horizontal para fundo claro: letras e traço escurecidos */
pecas.push({
  arquivo: path.join(MKT, 'logo-horizontal-fundo-claro.png'), w: 800, h: 300, transparente: true,
  svg: () => assinatura(60, 70, 160, '#0e1730', '#0b7f92', '#0e9cb8')
});

/* 4. Símbolo isolado, transparente */
pecas.push({
  arquivo: path.join(MKT, 'simbolo.png'), w: 1024, h: 1024, transparente: true,
  svg: () => simbolo(112, 112, 800)
});

/* 5. Avatar de perfil — WhatsApp Business, LinkedIn, Instagram.
   Recortado em círculo por esses apps, então o símbolo fica menor e
   centralizado pela tinta (que vai de 3,5 a 97 na caixa de 100), não pela caixa. */
pecas.push({
  arquivo: path.join(MKT, 'avatar-perfil.png'), w: 1024, h: 1024,
  svg: (w, h) => {
    const t = 620;
    const e = t / 100;
    const cx = 512 - ((3.5 + 97) / 2) * e;   // centraliza a tinta horizontalmente
    const cy = 512 - 50 * e;
    return `${fundo(w, h)}${simbolo(cx, cy, t)}`;
  }
});

/* 6. Capa do LinkedIn */
pecas.push({
  arquivo: path.join(MKT, 'capa-linkedin.png'), w: 1584, h: 396,
  svg: (w, h) => `${fundo(w, h)}${ornamento(w, h, 0.09)}
    ${assinatura(90, 96, 110)}
    <text x="90" y="286" font-family="Inter" font-size="30" fill="#9db0c9">Consultoria especializada em TOTVS Fluig e integrações com RM, Protheus e Datasul</text>
    <text x="90" y="336" font-family="Inter" font-size="26" font-weight="600" fill="${CIANO}">${wpp}  ·  ${site}</text>`
});

/* 7. Post quadrado — oferta do primeiro processo grátis */
pecas.push({
  arquivo: path.join(MKT, 'post-processo-gratis.png'), w: 1080, h: 1080,
  svg: (w, h) => `${fundo(w, h)}${ornamento(w, h, 0.08)}
    ${assinatura(80, 70, 88)}
    <rect x="80" y="240" width="470" height="54" rx="27" fill="${CIANO}" opacity="0.14"/>
    <text x="110" y="277" font-family="Inter" font-size="25" font-weight="600" fill="${CIANO}">VAGAS LIMITADAS POR MÊS</text>
    <text x="80" y="392" font-family="Sora" font-size="76" font-weight="800" fill="#ffffff">Seu primeiro</text>
    <text x="80" y="482" font-family="Sora" font-size="76" font-weight="800" fill="#ffffff">processo no Fluig</text>
    <text x="80" y="572" font-family="Sora" font-size="76" font-weight="800" fill="${CIANO}">100% grátis</text>
    <text x="80" y="660" font-family="Inter" font-size="30" fill="#9db0c9">Sem pegadinha: um processo completo dentro da sua</text>
    <text x="80" y="702" font-family="Inter" font-size="30" fill="#9db0c9">plataforma, para você ver a qualidade do trabalho</text>
    <text x="80" y="744" font-family="Inter" font-size="30" fill="#9db0c9">antes de investir 1 real.</text>
    <text x="80" y="828" font-family="Inter" font-size="27" fill="#8ea3bf">100% recursos nativos do Fluig  ·  sem integração com ERP</text>
    <text x="80" y="870" font-family="Inter" font-size="27" fill="#8ea3bf">1 por empresa  ·  até 5 etapas  ·  Fluig já licenciado</text>
    <rect x="80" y="930" width="480" height="76" rx="38" fill="${CIANO}"/>
    <text x="320" y="978" text-anchor="middle" font-family="Inter" font-size="30" font-weight="600" fill="#04121a">${wpp}</text>`
});

/* 8. Story vertical — mesma oferta, formato 9:16 */
pecas.push({
  arquivo: path.join(MKT, 'story-processo-gratis.png'), w: 1080, h: 1920,
  svg: (w, h) => `${fundo(w, h)}${ornamento(w, h, 0.08)}
    ${assinatura(80, 200, 96)}
    <rect x="80" y="440" width="470" height="54" rx="27" fill="${CIANO}" opacity="0.14"/>
    <text x="110" y="477" font-family="Inter" font-size="25" font-weight="600" fill="${CIANO}">VAGAS LIMITADAS POR MÊS</text>
    <text x="80" y="620" font-family="Sora" font-size="82" font-weight="800" fill="#ffffff">Seu primeiro</text>
    <text x="80" y="716" font-family="Sora" font-size="82" font-weight="800" fill="#ffffff">processo no</text>
    <text x="80" y="812" font-family="Sora" font-size="82" font-weight="800" fill="#ffffff">Fluig</text>
    <text x="80" y="908" font-family="Sora" font-size="82" font-weight="800" fill="${CIANO}">100% grátis</text>
    <text x="80" y="1030" font-family="Inter" font-size="34" fill="#9db0c9">Um processo completo dentro da sua</text>
    <text x="80" y="1078" font-family="Inter" font-size="34" fill="#9db0c9">plataforma, sem custo algum.</text>
    <text x="80" y="1200" font-family="Inter" font-size="29" fill="#8ea3bf">100% recursos nativos do Fluig</text>
    <text x="80" y="1248" font-family="Inter" font-size="29" fill="#8ea3bf">Sem integração com ERP</text>
    <text x="80" y="1296" font-family="Inter" font-size="29" fill="#8ea3bf">1 por empresa, até 5 etapas</text>
    <text x="80" y="1344" font-family="Inter" font-size="29" fill="#8ea3bf">Fluig já licenciado</text>
    <rect x="80" y="1440" width="520" height="86" rx="43" fill="${CIANO}"/>
    <text x="340" y="1495" text-anchor="middle" font-family="Inter" font-size="33" font-weight="600" fill="#04121a">${wpp}</text>
    <text x="80" y="1600" font-family="Inter" font-size="28" fill="#8ea3bf">${site}</text>`
});

/* 9. Cartão de apresentação dos serviços */
pecas.push({
  arquivo: path.join(MKT, 'post-servicos.png'), w: 1080, h: 1080,
  svg: (w, h) => {
    const itens = ['BPM e workflows', 'Formulários e datasets', 'Portais e widgets',
                   'Integração com RM, Protheus e Datasul', 'Sustentação e evolução', 'Consultoria e treinamento'];
    let lista = '';
    itens.forEach((t, i) => {
      const y = 470 + i * 82;
      lista += `<path d="M84 ${y - 9} L96 ${y + 3} L118 ${y - 19}" fill="none" stroke="${CIANO}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                <text x="146" y="${y + 3}" font-family="Inter" font-size="34" fill="#e6edf7">${t}</text>`;
    });
    return `${fundo(w, h)}${ornamento(w, h, 0.08)}
      ${assinatura(80, 70, 88)}
      <text x="80" y="292" font-family="Sora" font-size="70" font-weight="800" fill="#ffffff">O que fazemos</text>
      <text x="80" y="372" font-family="Sora" font-size="70" font-weight="800" fill="${CIANO}">em Fluig</text>
      ${lista}
      <rect x="80" y="940" width="480" height="76" rx="38" fill="${CIANO}"/>
      <text x="320" y="988" text-anchor="middle" font-family="Inter" font-size="30" font-weight="600" fill="#04121a">${wpp}</text>`;
  }
});

(async () => {
  await garantirFontes();
  console.log('');
  for (const p of pecas) {
    const corpo = typeof p.svg === 'function' ? p.svg(p.w, p.h) : p.svg;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}">${corpo}</svg>`;
    const r = new Resvg(svg, {
      font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: 'Inter' }
    });
    fs.writeFileSync(p.arquivo, r.render().asPng());
    const kb = Math.round(fs.statSync(p.arquivo).size / 1024);
    console.log(`${path.basename(p.arquivo).padEnd(36)} ${p.w}x${p.h}`.padEnd(52) + `${kb} KB`);
  }
  console.log(`\n${pecas.length} arquivos gerados.`);
})().catch(e => { console.error('\nErro:', e.message); process.exit(1); });
