/**
 * Fluxo BPMN animado da seção "Especialistas, não generalistas".
 * O SVG escala pelo viewBox, então nunca estoura a largura do container.
 * As animações vivem em styles.css (bpmn-flow / bpmn-step).
 */
export function BpmnDiagram() {
  return (
    <figure className="panel m-0 p-5 shadow-2xl sm:p-7">
      <svg viewBox="0 0 400 220" role="img" aria-labelledby="bpmn-titulo bpmn-desc" className="block h-auto w-full">
        <title id="bpmn-titulo">Fluxo de um processo automatizado no Fluig</title>
        <desc id="bpmn-desc">
          A solicitação é aberta, segue para aprovação e, quando aprovada, é integrada automaticamente ao ERP.
        </desc>

        <defs>
          <marker
            id="bpmn-seta"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path className="bpmn-arrow" d="M0 0 L10 5 L0 10 z" />
          </marker>
        </defs>

        <path className="bpmn-flow" d="M45 48 H70" markerEnd="url(#bpmn-seta)" />
        <path className="bpmn-flow" d="M191 48 H216" markerEnd="url(#bpmn-seta)" />
        <path className="bpmn-flow" d="M277 71 V94" markerEnd="url(#bpmn-seta)" />
        <path className="bpmn-flow" d="M252 120 H216" markerEnd="url(#bpmn-seta)" />
        <path className="bpmn-flow" d="M156 143 V170" markerEnd="url(#bpmn-seta)" />

        <circle className="bpmn-event bpmn-step" cx="30" cy="48" r="14" />

        <rect className="bpmn-node bpmn-step bpmn-d1" x="72" y="26" width="118" height="44" rx="9" />
        <text className="bpmn-label" x="131" y="49">
          Solicitação
        </text>

        <rect className="bpmn-node bpmn-step bpmn-d2" x="218" y="26" width="118" height="44" rx="9" />
        <text className="bpmn-label" x="277" y="49">
          Aprovação
        </text>

        <polygon className="bpmn-node bpmn-step bpmn-d3" points="277,95 302,120 277,145 252,120" />
        <text className="bpmn-small" x="343" y="112">
          Aprovado?
        </text>
        <text className="bpmn-small" x="234" y="112">
          sim
        </text>

        <rect className="bpmn-node bpmn-step bpmn-d4" x="97" y="98" width="118" height="44" rx="9" />
        <text className="bpmn-label" x="156" y="121">
          Integração ERP
        </text>

        <circle className="bpmn-event bpmn-end bpmn-step bpmn-d5" cx="156" cy="188" r="15" />
      </svg>
      <figcaption className="mt-4 text-center text-sm text-muted-foreground">
        Da solicitação à baixa no ERP, sem ninguém digitar duas vezes.
      </figcaption>
    </figure>
  );
}
