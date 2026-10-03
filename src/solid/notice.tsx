/** `<Notice>` para SolidJS: envuelve `<nx-notice>`. Por qué `attr:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/notice/index";
import type { NxNotice } from "../components/notice/notice";
import type { NoticeActionDetail, NoticeTone } from "../components/notice/types";

export type { NxNotice, NoticeActionDetail, NoticeTone };

export interface NoticeProps extends JSX.HTMLAttributes<NxNotice> {
  tone?: NoticeTone;
  /** El texto, si no va como hijo. */
  text?: string;
  /** El botón de la acción («Renovar»). */
  action?: string;
  /** La acción como enlace. */
  actionHref?: string;
  onAction?: (e: CustomEvent<NoticeActionDetail>) => void;
  children?: JSX.Element;
}

export function Notice(props: NoticeProps): JSX.Element {
  const [local, rest] = splitProps(props, ["tone", "text", "action", "actionHref", "onAction", "children"]);
  return (
    <nx-notice
      {...rest}
      attr:tone={local.tone}
      attr:text={local.text}
      attr:action={local.action}
      attr:action-href={local.actionHref}
      on:nx-notice-action={(e) => e.target === e.currentTarget && local.onAction?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-notice>
  );
}
