/** `<Inbox>` para SolidJS: envuelve `<nx-inbox>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/inbox/index";
import type { NxInbox } from "../components/inbox/inbox";
import type { InboxDecisionDetail, InboxItem, InboxLabels } from "../components/inbox/types";

export type { NxInbox, InboxDecisionDetail, InboxItem, InboxLabels };

export interface InboxProps extends JSX.HTMLAttributes<NxInbox> {
  items: InboxItem[];
  heading?: string;
  /** Milisegundos para deshacer (7000); 0 registra al instante. */
  undo?: number;
  requireReason?: boolean;
  /** Ids marcados para decidir en lote. */
  selected?: string[];
  /** Id del elemento abierto en el detalle. */
  active?: string | null;
  locale?: string;
  labels?: Partial<InboxLabels>;
  /** Cancelable: la decisión no se aplica. */
  onDecide?: (e: CustomEvent<InboxDecisionDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se registra en el backend. */
  onCommit?: (e: CustomEvent<InboxDecisionDetail>) => void;
  onUndo?: (e: CustomEvent<InboxDecisionDetail>) => void;
  onActive?: (e: CustomEvent<{ id: string; item: InboxItem }>) => void;
}

export function Inbox(props: InboxProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "heading", "undo", "requireReason", "selected", "active", "locale", "labels", "onDecide", "onCommit", "onUndo", "onActive"]);
  return (
    <nx-inbox
      {...rest}
      prop:items={local.items}
      prop:selected={local.selected}
      prop:active={local.active}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      bool:require-reason={!!local.requireReason}
      on:nx-inbox-decide={(e) => local.onDecide?.(e)}
      on:nx-inbox-commit={(e) => local.onCommit?.(e)}
      on:nx-inbox-undo={(e) => local.onUndo?.(e)}
      on:nx-inbox-active={(e) => local.onActive?.(e)}
    />
  );
}
