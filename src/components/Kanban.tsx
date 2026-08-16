import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KanbanColumn = { id: string; label: string };

/** Cor de acento por coluna, na ordem em que elas aparecem. */
const ACENTOS = [
  "bg-slate-400",
  "bg-sky-400",
  "bg-primary",
  "bg-amber-400",
  "bg-emerald-400",
] as const;

function Column({
  column,
  indice,
  count,
  arrastando,
  children,
}: {
  column: KanbanColumn;
  indice: number;
  count: number;
  arrastando: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[19rem] shrink-0 flex-col rounded-xl border bg-surface/40 transition-colors",
        isOver ? "border-primary/60 bg-surface" : "border-border",
        arrastando && !isOver && "border-dashed",
      )}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", ACENTOS[indice % ACENTOS.length])} />
        <span className="text-sm font-semibold">{column.label}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="flex min-h-24 flex-col gap-2 p-2 pt-1">
        {count === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
            {arrastando ? "Solte aqui" : "Nada por aqui"}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Card({
  id,
  arrastavel,
  onClick,
  children,
}: {
  id: string;
  arrastavel: boolean;
  onClick?: (() => void) | undefined;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: !arrastavel });
  return (
    <div
      ref={setNodeRef}
      {...(arrastavel ? listeners : {})}
      {...attributes}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        arrastavel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "opacity-40",
      )}
    >
      {children}
    </div>
  );
}

export function Kanban<T extends { id: string }>({
  columns,
  items,
  columnOf,
  renderCard,
  onMove,
  onCardClick,
  podeArrastar = true,
}: {
  columns: readonly KanbanColumn[];
  items: T[];
  columnOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onMove: (item: T, columnId: string) => void;
  onCardClick?: (item: T) => void;
  podeArrastar?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [ativo, setAtivo] = useState<T | null>(null);

  function aoIniciar(event: DragStartEvent) {
    setAtivo(items.find((i) => i.id === event.active.id) ?? null);
  }

  function aoTerminar(event: DragEndEvent) {
    setAtivo(null);
    const destino = event.over?.id;
    if (!destino) return;
    const item = items.find((i) => i.id === event.active.id);
    if (!item || columnOf(item) === destino) return;
    onMove(item, String(destino));
  }

  return (
    <DndContext sensors={sensors} onDragStart={aoIniciar} onDragEnd={aoTerminar} onDragCancel={() => setAtivo(null)}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col, indice) => {
          const daColuna = items.filter((i) => columnOf(i) === col.id);
          return (
            <Column key={col.id} column={col} indice={indice} count={daColuna.length} arrastando={!!ativo}>
              {daColuna.map((item) => (
                <Card
                  key={item.id}
                  id={item.id}
                  arrastavel={podeArrastar}
                  onClick={onCardClick ? () => onCardClick(item) : undefined}
                >
                  {renderCard(item)}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>

      {/* O cartão acompanha o cursor durante o arraste */}
      <DragOverlay dropAnimation={null}>
        {ativo ? (
          <div className="w-[17rem] rotate-2 rounded-lg border border-primary/60 bg-card p-3 shadow-xl">
            {renderCard(ativo)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
