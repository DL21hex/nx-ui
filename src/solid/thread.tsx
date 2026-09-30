/** `<Thread>` para SolidJS: envuelve `<nx-thread>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/thread/index";
import type { NxThread } from "../components/thread/thread";
import type { ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPostDetail, ThreadRef, ThreadUser } from "../components/thread/types";

export type { NxThread, ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPostDetail, ThreadRef, ThreadUser };

export interface ThreadProps extends Omit<JSX.HTMLAttributes<NxThread>, "onChange" | "onError"> {
  /** El registro («OC-2291»): de él cuelgan los comentarios, el borrador y lo leído. */
  record: string;
  /** `GET ?record=`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Sin él, todo es local (`comments`). */
  endpoint?: string;
  /** SSE o NDJSON con los cambios en vivo. */
  stream?: string;
  /** Sin `stream`: segundos entre consultas (30; `0` no sondea). */
  poll?: number;
  peopleSource?: string;
  refsSource?: string;
  refPatterns?: string[];
  /** Quien escribe desde aquí. Sin él, solo se lee. */
  me?: ThreadUser | null;
  anchors?: string[];
  /** `id` del `<nx-presence>` del que se lee quién está viendo. */
  presence?: string;
  comments?: ThreadComment[];
  readonly?: boolean;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<ThreadLabels>;
  onPost?: (e: CustomEvent<ThreadPostDetail>) => void;
  onChange?: (e: CustomEvent<{ comments: ThreadComment[] }>) => void;
  onMention?: (e: CustomEvent<ThreadMentionDetail>) => void;
  onError?: (e: CustomEvent<ThreadErrorDetail>) => void;
}

export function Thread(props: ThreadProps): JSX.Element {
  const [local, rest] = splitProps(props, ["record", "endpoint", "stream", "poll", "peopleSource", "refsSource", "refPatterns", "me", "anchors", "presence", "comments", "readonly", "disabled", "locale", "labels", "onPost", "onChange", "onMention", "onError"]);
  return (
    <nx-thread
      {...rest}
      prop:me={local.me}
      prop:anchors={local.anchors}
      prop:refPatterns={local.refPatterns}
      prop:comments={local.comments}
      prop:labels={local.labels}
      attr:record={local.record}
      attr:endpoint={local.endpoint}
      attr:stream={local.stream}
      attr:poll={local.poll === undefined ? undefined : String(local.poll)}
      attr:people-source={local.peopleSource}
      attr:refs-source={local.refsSource}
      attr:presence={local.presence}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      on:nx-thread-post={(e) => local.onPost?.(e)}
      on:nx-thread-change={(e) => local.onChange?.(e)}
      on:nx-thread-mention={(e) => local.onMention?.(e)}
      on:nx-thread-error={(e) => local.onError?.(e)}
    />
  );
}
