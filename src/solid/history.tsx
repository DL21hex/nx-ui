/** `<History>` para SolidJS: envuelve `<nx-history>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/history/index";
import type { NxHistory } from "../components/history/history";
import type { HistoryActor, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryLabels, HistoryRevertDetail, HistoryValue } from "../components/history/types";

export type { NxHistory, HistoryActor, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryLabels, HistoryRevertDetail };

export interface HistoryProps extends JSX.HTMLAttributes<NxHistory> {
  /** El registro como está hoy. */
  record?: Record<string, unknown>;
  fields?: HistoryField[];
  events?: HistoryEvent[];
  /** URL que devuelve `{events, record?, more?}` y pagina con `?before=<id>`. */
  source?: string;
  /** Quién comenta y revierte desde aquí. */
  user?: HistoryActor;
  /** Milisegundos para deshacer una reversión (7000); 0 la registra al instante. */
  undo?: number;
  heading?: string;
  locale?: string;
  labels?: Partial<HistoryLabels>;
  /** Cancelable: la reversión no se aplica. */
  onRevert?: (e: CustomEvent<HistoryRevertDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se guarda en el backend. */
  onCommit?: (e: CustomEvent<HistoryCommitDetail>) => void;
  /** Cancelable: la nota no se agrega. */
  onComment?: (e: CustomEvent<{ text: string }>) => void;
  onTravel?: (e: CustomEvent<{ id: string | null; record: Record<string, HistoryValue> }>) => void;
}

export function History(props: HistoryProps): JSX.Element {
  const [local, rest] = splitProps(props, ["record", "fields", "events", "source", "user", "undo", "heading", "locale", "labels", "onRevert", "onCommit", "onComment", "onTravel"]);
  return (
    <nx-history
      {...rest}
      prop:record={local.record}
      prop:fields={local.fields}
      prop:events={local.events}
      prop:user={local.user}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      on:nx-history-revert={(e) => local.onRevert?.(e)}
      on:nx-history-commit={(e) => local.onCommit?.(e)}
      on:nx-history-comment={(e) => local.onComment?.(e)}
      on:nx-history-travel={(e) => local.onTravel?.(e)}
    />
  );
}
