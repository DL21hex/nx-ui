/** `<Kanban>` para SolidJS: envuelve `<nx-kanban>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/kanban/index";
import type { NxKanban } from "../components/kanban/kanban";
import type { KanbanCard, KanbanColumn, KanbanLabels, KanbanMoveDetail } from "../components/kanban/types";

export type { NxKanban, KanbanCard, KanbanColumn, KanbanLabels, KanbanMoveDetail };

export interface KanbanProps extends JSX.HTMLAttributes<NxKanban> {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  heading?: string;
  /** Milisegundos para deshacer un movimiento (7000); 0 registra al instante. */
  undo?: number;
  /** Cargando: columnas con tarjetas de relleno. */
  busy?: boolean;
  locale?: string;
  labels?: Partial<KanbanLabels>;
  /** Cancelable: la tarjeta vuelve a su lugar. */
  onMove?: (e: CustomEvent<KanbanMoveDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se registra en el backend. */
  onCommit?: (e: CustomEvent<KanbanMoveDetail>) => void;
  onUndo?: (e: CustomEvent<KanbanMoveDetail>) => void;
  onAdd?: (e: CustomEvent<{ column: string }>) => void;
  /** Cancelable: no se sigue el `href` de la tarjeta. */
  onOpen?: (e: CustomEvent<{ card: KanbanCard }>) => void;
}

export function Kanban(props: KanbanProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "cards", "heading", "undo", "busy", "locale", "labels", "onMove", "onCommit", "onUndo", "onAdd", "onOpen"]);
  return (
    <nx-kanban
      {...rest}
      prop:columns={local.columns}
      prop:cards={local.cards}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      bool:busy={!!local.busy}
      on:nx-kanban-move={(e) => local.onMove?.(e)}
      on:nx-kanban-commit={(e) => local.onCommit?.(e)}
      on:nx-kanban-undo={(e) => local.onUndo?.(e)}
      on:nx-kanban-add={(e) => local.onAdd?.(e)}
      on:nx-kanban-open={(e) => local.onOpen?.(e)}
    />
  );
}
