/** `<nx-inbox>`: tipos. */
import type { ImpactItem, ImpactTone } from "../dialog/types";

/** Algo que espera una decisión. Es JSON: el backend lo manda tal cual (BDUI). */
export interface InboxItem {
  id: string;
  /** «OC-2291 · Aceros del Caribe» */
  title: string;
  /** «Lámina HR 3 mm × 40» */
  subtitle?: string;
  /** Quién lo pide (se pintan sus iniciales). */
  requester?: string;
  amount?: number;
  /** Moneda ISO («COP») o un símbolo («$»). */
  currency?: string;
  /** Fecha ISO («2026-09-24»). */
  date?: string;
  /** Marcas cortas: «Urgente», «Sobre presupuesto». */
  tags?: (string | { label: string; tone?: ImpactTone })[];
  /** Datos del detalle. */
  facts?: { label: string; value: string }[];
  /** Qué pasa si se aprueba: una lista, o una URL que lo transmite (el protocolo de `nxConfirm`,
   *  POST `{id, data}`). Un `block` impide aprobarlo. */
  impact?: ImpactItem[] | string;
  /** El documento completo. */
  href?: string;
  /** Datos para la app: viajan en los eventos. */
  data?: unknown;
}

export type InboxDecision = "approve" | "reject";

export interface InboxDecisionDetail {
  decision: InboxDecision;
  ids: string[];
  items: InboxItem[];
  /** El motivo del rechazo, si se escribió. */
  reason?: string;
}

/** Cómo terminó una decisión: se registró, se deshizo, o la app la canceló (`nx-inbox-decide`). */
export type InboxOutcome = "commit" | "undo" | "cancel";

/** El impacto de un ítem, a medida que llega. */
export interface InboxImpact {
  items: ImpactItem[];
  notes: string[];
  block: string | null;
  error: string | null;
  done: boolean;
}

export interface InboxLabels {
  heading: string;
  approve: string;
  reject: string;
  reason: string;
  sendReject: string;
  cancel: string;
  /** «Aprobado: {title}» */
  approvedOne: string;
  /** «{n} aprobados» */
  approvedMany: string;
  rejectedOne: string;
  rejectedMany: string;
  /** «· 1 bloqueado no se aprobó» */
  skippedOne: string;
  /** «· {n} bloqueados no se aprobaron» */
  skipped: string;
  blocked: string;
  impact: string;
  loading: string;
  error: string;
  open: string;
  requester: string;
  date: string;
  selectedOne: string;
  /** «{n} seleccionados» */
  selected: string;
  empty: string;
  /** «Decidiste {n} en {time}» */
  stats: string;
  reasonRequired: string;
  keyMove: string;
  keySelect: string;
  keyApprove: string;
  keyReject: string;
  keyUndo: string;
}
