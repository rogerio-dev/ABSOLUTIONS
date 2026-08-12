import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KanbanColumn = { id: string; label: string };

function Column({
  column,
  count,
  children,
}: {
  column: KanbanColumn;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface/60 p-3 transition-colors",
        isOver && "border-primary/60 bg-surface",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{column.label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Card({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "cursor-grab rounded-md border border-border bg-card p-3 text-left shadow-sm transition-shadow hover:border-primary/40",
        isDragging && "z-50 opacity-90 shadow-glow",
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
}: {
  columns: readonly KanbanColumn[];
  items: T[];
  columnOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onMove: (item: T, columnId: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const over = event.over?.id;
    if (!over) return;
    const item = items.find((i) => i.id === event.active.id);
    if (!item || columnOf(item) === over) return;
    onMove(item, String(over));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colItems = items.filter((i) => columnOf(i) === col.id);
          return (
            <Column key={col.id} column={col} count={colItems.length}>
              {colItems.map((item) => (
                <Card key={item.id} id={item.id}>
                  {renderCard(item)}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}
