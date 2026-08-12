export const STAGES = [
  { id: "novo", label: "Novo" },
  { id: "contatado", label: "Contatado" },
  { id: "reuniao_agendada", label: "Reunião agendada" },
  { id: "proposta", label: "Proposta" },
  { id: "negociacao", label: "Negociação" },
  { id: "ganho", label: "Ganho" },
  { id: "perdido", label: "Perdido" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const TASK_STATUS = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Em andamento" },
  { id: "review", label: "Revisão" },
  { id: "done", label: "Concluído" },
] as const;

export type TaskStatusId = (typeof TASK_STATUS)[number]["id"];

export const brl = (value?: number | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    value ?? 0,
  );

export const dt = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const d = (value?: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "—");

type MeetingLike = {
  titulo: string;
  descricao?: string | null;
  inicio: string;
  fim?: string | null;
  local?: string | null;
};

export function icsFor(meeting: MeetingLike) {
  const stamp = (v: string) => `${new Date(v).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const end = meeting.fim ?? new Date(new Date(meeting.inicio).getTime() + 60 * 60 * 1000).toISOString();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AB Solutions Consultoria//CRM//PT-BR",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@absolutionsconsultoria.com.br`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(meeting.inicio)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${meeting.titulo}`,
    `DESCRIPTION:${(meeting.descricao ?? "").replace(/\n/g, "\\n")}`,
    `LOCATION:${meeting.local ?? ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(meeting: MeetingLike) {
  const blob = new Blob([icsFor(meeting)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meeting.titulo.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
