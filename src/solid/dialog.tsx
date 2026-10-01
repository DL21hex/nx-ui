/** `<Dialog>` para SolidJS: envuelve `<nx-dialog>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { createEffect, splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/dialog/index";
import type { NxDialog } from "../components/dialog/dialog";
import type { BadgeTone } from "../components/badge/types";
import type { CloseReason, DialogAction, DialogActionDetail, DialogCloseDetail, DialogLabels, DialogMode, DialogNavDetail, DialogSize } from "../components/dialog/types";

export type { NxDialog, CloseReason, DialogAction, DialogActionDetail, DialogCloseDetail, DialogLabels, DialogMode, DialogNavDetail, DialogSize };

export interface DialogProps extends Omit<JSX.HTMLAttributes<NxDialog>, "onClose"> {
  /** Controlado: abre y cierra con la señal (y avisa en `onOpenChange`). */
  open?: boolean;
  heading?: string;
  description?: string;
  mode?: DialogMode;
  size?: DialogSize;
  persistent?: boolean;
  /** Entrada de historial al abrir («atrás» cierra). `""` = la URL actual. */
  url?: string;
  /** Cambios sin guardar: al cerrar pide confirmación. Se marca solo al escribir; `false` al guardar. */
  dirty?: boolean;
  labels?: Partial<DialogLabels>;
  /** Cabecera de una ficha: el estado en una píldora al lado del título, y su tono. */
  badge?: string;
  badgeTone?: BadgeTone;
  /** Una imagen (URL) o un nombre, del que salen las iniciales. */
  avatar?: string;
  /** Pasar de registro sin cerrar: `"prev next"`, `"next"`, `"prev"` o `""`. */
  nav?: string;
  /** El menú «Más» de la cabecera. */
  actions?: DialogAction[];
  onNav?: (e: CustomEvent<DialogNavDetail>) => void;
  onAction?: (e: CustomEvent<DialogActionDetail>) => void;
  onOpenChange?: (e: CustomEvent<{ open: boolean; value?: string; reason?: CloseReason }>) => void;
  /** Cancelable: `e.preventDefault()` lo deja abierto. */
  onClose?: (e: CustomEvent<DialogCloseDetail>) => void;
  children?: JSX.Element;
}

export function Dialog(props: DialogProps): JSX.Element {
  const [local, rest] = splitProps(props, ["open", "heading", "description", "mode", "size", "persistent", "url", "dirty", "labels", "badge", "badgeTone", "avatar", "nav", "actions", "onNav", "onAction", "onOpenChange", "onClose", "children"]);
  let el: NxDialog | undefined;
  createEffect(() => {
    const want = !!local.open;
    if (el && want !== el.open) {
      if (want) void el.show();
      else el.close(undefined, "api");
    }
  });
  return (
    <nx-dialog
      {...rest}
      ref={(e: NxDialog) => (el = e)}
      attr:heading={local.heading}
      attr:description={local.description}
      attr:mode={local.mode}
      attr:size={local.size}
      attr:url={local.url}
      bool:persistent={!!local.persistent}
      prop:dirty={local.dirty}
      prop:labels={local.labels}
      attr:badge={local.badge}
      attr:badge-tone={local.badgeTone}
      attr:avatar={local.avatar}
      attr:nav={local.nav}
      prop:actions={local.actions}
      on:nx-dialog-nav={(e) => local.onNav?.(e)}
      on:nx-dialog-action={(e) => local.onAction?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
      on:nx-dialog-close={(e) => local.onClose?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-dialog>
  );
}
