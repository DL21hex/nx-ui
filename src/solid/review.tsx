/** `<Review>` para SolidJS: envuelve `<nx-review>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/review/index";
import type { NxReview } from "../components/review/review";
import type { ReviewChange, ReviewConfirmDetail, ReviewDirtyDetail, ReviewLabels, ReviewMode, ReviewOpenDetail } from "../components/review/types";

export type { NxReview, ReviewChange, ReviewConfirmDetail, ReviewDirtyDetail, ReviewLabels, ReviewMode, ReviewOpenDetail };

export interface ReviewProps extends Omit<JSX.HTMLAttributes<NxReview>, "onCancel"> {
  /** `significant` (por defecto), `always` o `never` (solo con `review()`). */
  mode?: ReviewMode;
  /** Desde qué porcentaje un monto es importante (20). */
  threshold?: number;
  /** Más de cuántos cambios se muestra aunque nada sea importante (5). */
  maxSilent?: number;
  /** `notice`: al enviar sin cambios, «No hay cambios que guardar» y no envía. */
  empty?: "notice";
  /** La base: el registro como se cargó (`{campo: valor}`, filas anidadas o planas). */
  initial?: Record<string, unknown> | null;
  /** `false`: después de guardar, la base no cambia. */
  rebase?: boolean;
  locale?: string;
  labels?: Partial<ReviewLabels>;
  disabled?: boolean;
  /** Cancelable: cancelarlo envía directo. */
  onOpen?: (e: CustomEvent<ReviewOpenDetail>) => void;
  onConfirm?: (e: CustomEvent<ReviewConfirmDetail>) => void;
  onCancel?: (e: CustomEvent<{ changes: ReviewChange[] }>) => void;
  onDirty?: (e: CustomEvent<ReviewDirtyDetail>) => void;
  children?: JSX.Element;
}

export function Review(props: ReviewProps): JSX.Element {
  const [local, rest] = splitProps(props, ["mode", "threshold", "maxSilent", "empty", "initial", "rebase", "locale", "labels", "disabled", "onOpen", "onConfirm", "onCancel", "onDirty", "children"]);
  return (
    <nx-review
      {...rest}
      prop:initial={local.initial}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:threshold={local.threshold === undefined ? undefined : String(local.threshold)}
      attr:max-silent={local.maxSilent === undefined ? undefined : String(local.maxSilent)}
      attr:empty={local.empty}
      attr:rebase={local.rebase === false ? "false" : undefined}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-review-open={(e) => local.onOpen?.(e)}
      on:nx-review-confirm={(e) => local.onConfirm?.(e)}
      on:nx-review-cancel={(e) => local.onCancel?.(e)}
      on:nx-review-dirty={(e) => local.onDirty?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-review>
  );
}
