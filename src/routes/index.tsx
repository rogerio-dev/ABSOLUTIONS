import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Particles } from "@/components/site/particles";
import { BpmnDiagram } from "@/components/site/bpmn";
import { Reveal } from "@/components/site/reveal";
import { useSession } from "@/lib/auth";

const SITE = "https://www.absolutionsconsultoria.com.br";
const TELEFONE = "(61) 92003-5859";
const WHATSAPP =
  "https://wa.me/5561920035859?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20AB%20Solutions%20e%20gostaria%20de%20falar%20sobre%20um%20projeto%20Fluig.";
const WHATSAPP_OFERTA = "https://wa.me/5561920035859?text=Ol%C3%A1!%20Quero%20garantir%20meu%20processo%20Fluig%20gratuito.";
const WHATSAPP_ERP = "https://wa.me/5561920035859?text=Ol%C3%A1!%20Quero%20integrar%20o%20Fluig%20com%20meu%20ERP%20TOTVS.";

const TITULO = "AB Solutions | Especialistas em TOTVS Fluig e Integrações ERP";
const DESCRICAO =
  "Consultoria especializada em TOTVS Fluig: BPM, workflows, formulários, portais e integrações com RM, Protheus e Datasul. Fale com um especialista.";

const perguntas = [
  {
    p: "O que é o TOTVS Fluig e por que minha empresa precisa dele?",
    r: "O TOTVS Fluig é a plataforma de produtividade e BPM da TOTVS que centraliza processos, documentos e portais em um só lugar. Com ele, sua empresa automatiza aprovações, elimina papel e planilhas paralelas e ganha rastreabilidade completa dos processos.",
  },
  {
    p: "Vocês integram o Fluig com quais ERPs?",
    r: "Somos especializados em integrações do Fluig com toda a linha TOTVS: RM, Protheus e Datasul — via REST, SOAP e datasets. Também integramos com sistemas de terceiros quando o projeto exige.",
  },
  {
    p: "Quanto tempo leva um projeto de automação no Fluig?",
    r: "Depende da complexidade do processo. Automações pontuais podem ficar prontas em poucas semanas; projetos com múltiplas integrações ao ERP são planejados em entregas incrementais, para que sua equipe veja valor desde as primeiras semanas.",
  },
  {
    p: "Vocês atendem empresas de qualquer região?",
    r: "Sim. Atuamos de forma remota em todo o Brasil, com reuniões online, entregas contínuas e comunicação direta pelo WhatsApp.",
  },
  {
    p: "Já tenho Fluig implantado. Vocês dão sustentação e evolução?",
    r: "Sim. Além de novos projetos, oferecemos sustentação, correção de processos existentes, melhoria de performance e evolução contínua da sua plataforma Fluig.",
  },
  {
    p: "O processo gratuito é grátis mesmo? Qual é a condição?",
    r: "É grátis de verdade — e a condição está às claras: o processo é desenvolvido 100% com recursos nativos do Fluig, sem integrações com ERP, com complexidade simples (até 5 etapas) e limitado a 1 por empresa, que precisa já ter o Fluig licenciado. Se depois quiser integrar o processo ao RM, Protheus ou Datasul, aí sim vira um projeto pago.",
  },
];

const servicos = [
  {
    t: "BPM & Workflows",
    d: "Modelagem e automação de processos de negócio: aprovações, solicitações, compras, RH e financeiro — com rastreabilidade de ponta a ponta.",
    icone: "M4 6h6v6H4zM14 12h6v6h-6zM10 9h7M17 9v3",
  },
  {
    t: "Formulários & Datasets",
    d: "Formulários inteligentes com validações, regras de negócio e datasets conectados ao seu ERP — dados sempre corretos, sem digitação dupla.",
    icone: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h5",
  },
  {
    t: "Portais & Widgets",
    d: "Portais corporativos e widgets sob medida no Fluig: intranets, centrais de serviços e painéis que sua equipe realmente usa.",
    icone: "M3 5h18v11H3zM3 9h18M8 20h8M12 16v4",
  },
  {
    t: "Integrações com ERP",
    d: "Fluig conversando de verdade com RM, Protheus e Datasul: REST, SOAP e datasets sincronizados, com tratamento de erros e segurança.",
    icone: "M9 12h6M6 9v6M18 9v6",
  },
  {
    t: "Sustentação & Evolução",
    d: "Seu Fluig já está no ar? Assumimos a sustentação, corrigimos processos problemáticos e evoluímos a plataforma com segurança.",
    icone: "M12 3l7 4v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V7l7-4zM9 12l2 2 4-4",
  },
  {
    t: "Consultoria & Treinamento",
    d: "Capacitamos sua equipe para tirar o máximo do Fluig: boas práticas, governança de processos e autonomia para o dia a dia.",
    icone: "M12 14l9-5-9-5-9 5 9 5zM5 11.5V16c0 1.7 3.1 3 7 3s7-1.3 7-3v-4.5",
  },
];

const erps = [
  {
    tag: "TOTVS RM",
    t: "Fluig + RM",
    d: "Aprovações de RH, folha, férias e movimentações integradas direto ao RM. Dados de colaboradores sempre sincronizados nos seus workflows.",
  },
  {
    tag: "TOTVS Protheus",
    t: "Fluig + Protheus",
    d: "Compras, financeiro e faturamento com aprovações no Fluig e efetivação automática no Protheus — fim do vai-e-vem de e-mails.",
  },
  {
    tag: "TOTVS Datasul",
    t: "Fluig + Datasul",
    d: "Processos industriais e logísticos amarrados ao Datasul, com integrações resilientes e visibilidade total do fluxo.",
  },
];

const etapas = [
  { n: "01", t: "Diagnóstico", d: "Entendemos seu processo atual, as dores da equipe e o cenário do seu ERP. Sem compromisso." },
  { n: "02", t: "Proposta clara", d: "Escopo, prazos e investimento definidos por escrito. Você sabe exatamente o que será entregue." },
  { n: "03", t: "Construção iterativa", d: "Desenvolvimento em ciclos curtos com homologação da sua equipe a cada entrega." },
  { n: "04", t: "Go-live & suporte", d: "Publicação assistida, treinamento dos usuários e suporte próximo no pós-implantação." },
];

const menu = [
  { href: "#oferta", texto: "Processo grátis", destaque: true },
  { href: "#servicos", texto: "Serviços" },
  { href: "#integracoes", texto: "Integrações" },
  { href: "#processo", texto: "Como trabalhamos" },
  { href: "#faq", texto: "FAQ" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      {
        name: "keywords",
        content:
          "TOTVS Fluig, consultoria Fluig, BPM, workflow, integração RM, integração Protheus, integração Datasul, automação de processos",
      },
      { name: "author", content: "AB Solutions" },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: `${SITE}/` },
      { property: "og:site_name", content: "AB Solutions" },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:image", content: `${SITE}/img/og-cover.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AB Solutions | Especialistas em TOTVS Fluig" },
      { name: "twitter:description", content: DESCRICAO },
      { name: "twitter:image", content: `${SITE}/img/og-cover.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ProfessionalService",
          name: "AB Solutions",
          description:
            "Consultoria especializada em TOTVS Fluig: BPM, workflows, formulários, portais e integrações com os ERPs RM, Protheus e Datasul.",
          url: `${SITE}/`,
          telephone: "+55-61-92003-5859",
          areaServed: "BR",
          priceRange: "$$",
          knowsAbout: ["TOTVS Fluig", "BPM", "Workflow", "TOTVS RM", "TOTVS Protheus", "TOTVS Datasul"],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: perguntas.map((q) => ({
            "@type": "Question",
            name: q.p,
            acceptedAnswer: { "@type": "Answer", text: q.r },
          })),
        }),
      },
    ],
  }),
  component: Home,
});

function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[1.28rem] ${className}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="h-[2.5em] w-auto shrink-0">
        <path
          d="M71 27 L50 6 L6 50 L50 94 L71 74"
          fill="none"
          stroke="oklch(0.79 0.132 204)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x="64" y="67" textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="46" fontWeight="700" fill="#fff">
          AB
        </text>
      </svg>
      <span className="font-display text-[1em] font-extrabold tracking-tight text-primary">Solutions</span>
    </span>
  );
}

function IconeWhatsApp({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.1-.7l.4-.5c.1-.1.1-.3.2-.4v-.4L9.6 7.7c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6a10 10 0 0 0 4 3.5c.5.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.3z"
      />
    </svg>
  );
}

const btnPrimario =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:shadow-primary/40";
const btnFantasma =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 font-semibold text-foreground transition hover:border-primary hover:text-primary";

function Home() {
  const { session } = useSession();
  const [menuAberto, setMenuAberto] = useState(false);
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 10);
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ===== Cabeçalho ===== */}
      <header
        id="topo"
        className={`fixed inset-x-0 top-0 z-50 backdrop-blur-lg transition ${
          rolou ? "border-b border-border bg-background/90" : "border-b border-transparent bg-background/70"
        }`}
      >
        <div className="mx-auto flex w-[min(1140px,100%-2rem)] items-center justify-between py-3">
          <a href="#topo" aria-label="AB Solutions — início" className="text-white">
            <Marca />
          </a>

          <nav aria-label="Navegação principal">
            <button
              type="button"
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={menuAberto}
              onClick={() => setMenuAberto((v) => !v)}
              className="flex h-11 w-11 flex-col items-center justify-center gap-[5px] lg:hidden"
            >
              <span className={`h-0.5 w-6 rounded bg-foreground transition ${menuAberto ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`h-0.5 w-6 rounded bg-foreground transition ${menuAberto ? "opacity-0" : ""}`} />
              <span className={`h-0.5 w-6 rounded bg-foreground transition ${menuAberto ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </button>

            <ul
              className={`absolute inset-x-0 top-full flex-col gap-0 border-b border-border bg-background/97 px-5 pb-5 backdrop-blur-lg transition-transform lg:static lg:flex lg:translate-y-0 lg:flex-row lg:items-center lg:gap-6 lg:border-0 lg:bg-transparent lg:p-0 ${
                menuAberto ? "flex translate-y-0" : "flex -translate-y-[130%] lg:translate-y-0"
              }`}
            >
              {menu.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setMenuAberto(false)}
                    className={`flex min-h-[46px] items-center text-base transition lg:text-[0.95rem] ${
                      item.destaque ? "font-semibold text-primary hover:text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.texto}
                  </a>
                </li>
              ))}
              <li className="mt-2 lg:mt-0">
                <a
                  href={WHATSAPP}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setMenuAberto(false)}
                  className="flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground lg:w-auto lg:py-2"
                >
                  Fale conosco
                </a>
              </li>
              <li className="mt-2 lg:mt-0">
                <Link
                  to={session ? "/painel" : "/auth"}
                  onClick={() => setMenuAberto(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-primary lg:w-auto lg:py-2"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
                  </svg>
                  {session ? "Painel" : "Acesso"}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main>
        {/* ===== Topo ===== */}
        <section className="bg-grid relative flex items-center overflow-hidden pt-24" aria-label="Apresentação">
          <Particles />
          <div className="relative z-10 mx-auto w-[min(1140px,100%-2rem)] max-w-[60rem] py-16 sm:py-24">
            <Reveal as="p" className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-sm text-muted-foreground">
              <span className="pulso-ponto inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              Especialistas em TOTVS Fluig
            </Reveal>
            <Reveal delay={100}>
              <h1 className="text-[clamp(2.1rem,5vw,3.4rem)] font-extrabold leading-[1.1]">
                Automatize seus processos com quem <span className="text-gradient">vive Fluig</span> todos os dias
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-5 max-w-[640px] text-[clamp(1rem,2vw,1.2rem)] text-muted-foreground">
                Workflows, formulários, portais e integrações do TOTVS Fluig com <strong className="text-foreground">RM</strong>,{" "}
                <strong className="text-foreground">Protheus</strong> e <strong className="text-foreground">Datasul</strong>. Menos
                papel, menos retrabalho — mais controle e produtividade para o seu negócio.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={WHATSAPP} target="_blank" rel="noopener" className={btnPrimario}>
                  <IconeWhatsApp /> Falar com um especialista
                </a>
                <a href="#servicos" className={btnFantasma}>
                  Conhecer os serviços
                </a>
              </div>
            </Reveal>
            <Reveal delay={400}>
              <ul className="mt-12 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:gap-10">
                {[
                  ["100%", "foco em Fluig"],
                  ["RM · Protheus · Datasul", "integrações TOTVS"],
                  ["Brasil inteiro", "atendimento remoto"],
                ].map(([forte, fraco]) => (
                  <li key={fraco} className="flex flex-wrap items-baseline gap-2 sm:flex-col sm:gap-0.5">
                    <strong className="font-display text-base text-foreground">{forte}</strong>
                    <span className="text-sm text-muted-foreground">{fraco}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ===== Oferta ===== */}
        <section id="oferta" className="mx-auto w-[min(1140px,100%-2rem)] pb-14 sm:pb-20">
          <Reveal>
            <div className="relative grid gap-8 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-surface to-surface-2 p-6 shadow-2xl sm:p-10 lg:grid-cols-[1.15fr_1fr]">
              <div>
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                  <span className="pulso-ponto inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  Oferta de entrada — vagas limitadas por mês
                </p>
                <h2 className="text-[clamp(1.6rem,3.5vw,2.3rem)] font-extrabold">
                  Seu primeiro processo no Fluig, <span className="text-gradient">100% grátis</span>
                </h2>
                <p className="mt-4 max-w-[480px] text-muted-foreground">
                  <strong className="text-foreground">Sem pegadinha:</strong> desenvolvemos um processo completo dentro da sua
                  plataforma Fluig, sem custo algum, para você conhecer a qualidade do nosso trabalho antes de investir 1 real.
                </p>
                <a href={WHATSAPP_OFERTA} target="_blank" rel="noopener" className={`${btnPrimario} mt-7 w-full sm:w-auto`}>
                  <IconeWhatsApp /> Quero meu processo grátis
                </a>
              </div>
              <div className="self-center border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0">
                <h3 className="mb-4 text-base font-semibold">Regras claras, sem letras miúdas:</h3>
                <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
                  {[
                    ["ok", "1 processo completo", " — workflow + formulário, modelado, desenvolvido e publicado em produção"],
                    ["ok", "100% recursos nativos do Fluig", " — feito por quem é especialista na plataforma"],
                    ["ok", "Treinamento de uso incluído", " para sua equipe começar a usar no mesmo dia"],
                    ["regra", "Sem integrações com ERP", " — conexões com RM, Protheus ou Datasul fazem parte dos nossos projetos pagos"],
                    ["regra", "1 processo por empresa", ", de complexidade simples (até 5 etapas de fluxo)"],
                    ["regra", "Sua empresa precisa já ter o Fluig licenciado", " e ambiente disponível"],
                  ].map(([tipo, forte, resto]) => (
                    <li key={forte} className="flex gap-3">
                      <span
                        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] ${
                          tipo === "ok" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      >
                        {tipo === "ok" ? "✓" : "!"}
                      </span>
                      <span>
                        <strong className="text-foreground">{forte}</strong>
                        {resto}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ===== Serviços ===== */}
        <section id="servicos" className="py-14 sm:py-20">
          <div className="mx-auto w-[min(1140px,100%-2rem)]">
            <Reveal>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-primary">O que fazemos</p>
              <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold">
                Serviços especializados em <span className="text-gradient">TOTVS Fluig</span>
              </h2>
              <p className="mt-3 mb-9 max-w-[620px] text-muted-foreground">
                Do desenho do processo à integração com seu ERP — cuidamos de tudo.
              </p>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {servicos.map((s, i) => (
                <Reveal key={s.t} delay={i * 60}>
                  <article className="panel h-full p-6 transition hover:-translate-y-1 hover:border-primary/45">
                    <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                      <svg viewBox="0 0 24 24" className="h-7 w-7">
                        <path d={s.icone} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="mb-2 font-display text-lg font-semibold">{s.t}</h3>
                    <p className="text-sm text-muted-foreground">{s.d}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Integrações ===== */}
        <section id="integracoes" className="bg-surface/40 py-14 sm:py-20">
          <div className="mx-auto w-[min(1140px,100%-2rem)]">
            <Reveal>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-primary">Ecossistema TOTVS</p>
              <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold">
                Seu ERP integrado ao Fluig, <span className="text-gradient">sem gambiarras</span>
              </h2>
              <p className="mt-3 mb-9 max-w-[620px] text-muted-foreground">
                Conectamos o Fluig à linha TOTVS que sua empresa já usa — com arquitetura sólida, credenciais seguras e
                monitoramento.
              </p>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {erps.map((e, i) => (
                <Reveal key={e.t} delay={i * 60}>
                  <article className="panel h-full bg-gradient-to-br from-surface to-surface-2 p-7 transition hover:-translate-y-1 hover:border-primary/50">
                    <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                      {e.tag}
                    </span>
                    <h3 className="mb-2 font-display text-xl font-semibold">{e.t}</h3>
                    <p className="text-sm text-muted-foreground">{e.d}</p>
                  </article>
                </Reveal>
              ))}
            </div>
            <Reveal>
              <div className="mt-10 text-center">
                <a href={WHATSAPP_ERP} target="_blank" rel="noopener" className={btnPrimario}>
                  Quero integrar meu ERP
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===== Diferenciais ===== */}
        <section className="py-14 sm:py-20">
          <div className="mx-auto grid w-[min(1140px,100%-2rem)] items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="min-w-0">
              <Reveal>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-primary">Por que a AB Solutions</p>
                <h2 className="text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold">Especialistas, não generalistas</h2>
                <p className="mt-3 text-muted-foreground">
                  Fluig não é "mais um item" no nosso portfólio — é o nosso foco. Isso muda tudo na qualidade da entrega.
                </p>
                <ul className="mt-6 flex flex-col gap-4">
                  {[
                    ["Foco total em Fluig", " — dominamos a plataforma a fundo: eventos, datasets, widgets, APIs e seus limites reais."],
                    ["Boas práticas de verdade", " — código versionado, seguro e documentado. Nada de solução que só o \"criador\" entende."],
                    ["Entregas incrementais", " — você vê valor em semanas, não em meses. Cada entrega é validada com sua equipe."],
                    ["Comunicação direta", " — fale com quem executa o projeto, sem camadas de intermediários."],
                  ].map(([forte, resto]) => (
                    <li key={forte} className="flex gap-3 text-muted-foreground">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-xs text-primary" aria-hidden="true">
                        ✓
                      </span>
                      <span>
                        <strong className="text-foreground">{forte}</strong>
                        {resto}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <div className="min-w-0">
              <Reveal delay={120}>
                <BpmnDiagram />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ===== Processo ===== */}
        <section id="processo" className="bg-surface/40 py-14 sm:py-20">
          <div className="mx-auto w-[min(1140px,100%-2rem)]">
            <Reveal>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-primary">Como trabalhamos</p>
              <h2 className="mb-9 text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold">
                Do primeiro contato ao processo <span className="text-gradient">rodando em produção</span>
              </h2>
            </Reveal>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {etapas.map((e, i) => (
                <Reveal key={e.n} delay={i * 60} as="li">
                  <div className="panel h-full p-6 transition hover:-translate-y-1 hover:border-primary/40">
                    <span className="text-gradient mb-2 block font-display text-3xl font-extrabold">{e.n}</span>
                    <h3 className="mb-2 font-display text-lg font-semibold">{e.t}</h3>
                    <p className="text-sm text-muted-foreground">{e.d}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section id="faq" className="py-14 sm:py-20">
          <div className="mx-auto w-[min(820px,100%-2rem)]">
            <Reveal>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-primary">Dúvidas frequentes</p>
              <h2 className="mb-8 text-[clamp(1.6rem,3.5vw,2.4rem)] font-bold">Perguntas que ouvimos todo dia</h2>
            </Reveal>
            <div className="flex flex-col gap-3">
              {perguntas.map((q) => (
                <details key={q.p} className="panel group overflow-hidden open:border-primary/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-semibold transition hover:text-primary">
                    {q.p}
                    <span className="shrink-0 text-2xl text-primary transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="px-4 pb-4 text-sm text-muted-foreground">{q.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Chamada final ===== */}
        <section id="contato" className="relative overflow-hidden bg-surface/40 py-20 text-center">
          <div className="bg-grid absolute inset-0" aria-hidden="true" />
          <div className="relative z-10 mx-auto w-[min(1140px,100%-2rem)]">
            <Reveal>
              <h2 className="mx-auto max-w-[700px] text-[clamp(1.7rem,4vw,2.6rem)] font-extrabold">
                Pronto para tirar seus processos do papel?
              </h2>
              <p className="mx-auto mt-4 mb-8 max-w-[540px] text-muted-foreground">
                Conte pra gente o que você precisa automatizar. Respondemos rápido — e a primeira conversa não custa nada.
              </p>
              <a href={WHATSAPP} target="_blank" rel="noopener" className={btnPrimario}>
                <IconeWhatsApp /> Chamar no WhatsApp — {TELEFONE}
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ===== Rodapé ===== */}
      <footer className="border-t border-border pt-12">
        <div className="mx-auto grid w-[min(1140px,100%-2rem)] gap-8 pb-10 lg:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Marca className="text-[1.15rem] text-white" />
            <p className="mt-3 max-w-[320px] text-sm text-muted-foreground">
              Especialistas em TOTVS Fluig e integrações com RM, Protheus e Datasul.
            </p>
          </div>
          <nav aria-label="Links do rodapé" className="flex flex-col gap-2">
            {menu.slice(1).map((item) => (
              <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition hover:text-primary">
                {item.texto}
              </a>
            ))}
          </nav>
          <div>
            <a href={WHATSAPP} target="_blank" rel="noopener" className="text-sm text-muted-foreground transition hover:text-primary">
              WhatsApp: {TELEFONE}
            </a>
          </div>
        </div>
        <div className="mx-auto flex w-[min(1140px,100%-2rem)] flex-col gap-1 border-t border-border py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} AB Solutions. Todos os direitos reservados.</p>
          <p className="opacity-70">
            Fluig, RM, Protheus e Datasul são produtos e marcas da TOTVS S.A. A AB Solutions é uma consultoria independente.
          </p>
        </div>
      </footer>

      {/* ===== WhatsApp flutuante ===== */}
      <a
        href={WHATSAPP}
        target="_blank"
        rel="noopener"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25d366] text-white shadow-xl shadow-[#25d366]/40 transition hover:scale-105"
      >
        <IconeWhatsApp size={28} />
      </a>
    </div>
  );
}
