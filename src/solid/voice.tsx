/** `<Voice>` para SolidJS: envuelve `<nx-voice>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/voice/index";
import type { NxVoice } from "../components/voice/voice";
import type { VoiceEndDetail, VoiceEngine, VoiceErrorDetail, VoiceLabels, VoiceLayout, VoiceTextDetail } from "../components/voice/types";

export type { NxVoice, VoiceEndDetail, VoiceEngine, VoiceErrorDetail, VoiceLabels, VoiceLayout, VoiceTextDetail };

export interface VoiceProps extends Omit<JSX.HTMLAttributes<NxVoice>, "onError"> {
  /** El `id` de un `<nx-paste-fill>`, un `<input>` o un `<textarea>` que recibe lo dictado. */
  for?: string;
  /** Recibe `POST` con el audio (`FormData`: `audio`, `lang`) y responde el texto. */
  endpoint?: string;
  /** `auto` (por defecto), `browser` o `server`. */
  engine?: VoiceEngine;
  /** Mantener para hablar (el botón o la barra espaciadora). */
  hold?: boolean;
  /** Atajo de página, p. ej. «Alt+V». */
  hotkey?: string;
  /** Tope de una toma, en segundos (30). */
  maxSeconds?: number;
  /** Silencio que termina una toma, en ms (2000). */
  silence?: number;
  /** `false` apaga «borrar eso» y «borra la última palabra». */
  commands?: boolean;
  layout?: VoiceLayout;
  locale?: string;
  labels?: Partial<VoiceLabels>;
  disabled?: boolean;
  onStart?: (e: CustomEvent<Record<string, never>>) => void;
  onPartial?: (e: CustomEvent<{ text: string }>) => void;
  /** Cancelable: no se entrega a `for`. */
  onText?: (e: CustomEvent<VoiceTextDetail>) => void;
  onEnd?: (e: CustomEvent<VoiceEndDetail>) => void;
  onError?: (e: CustomEvent<VoiceErrorDetail>) => void;
  onUnavailable?: (e: CustomEvent<Record<string, never>>) => void;
}

export function Voice(props: VoiceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["for", "endpoint", "engine", "hold", "hotkey", "maxSeconds", "silence", "commands", "layout", "locale", "labels", "disabled", "onStart", "onPartial", "onText", "onEnd", "onError", "onUnavailable"]);
  return (
    <nx-voice
      {...rest}
      prop:labels={local.labels}
      attr:for={local.for}
      attr:endpoint={local.endpoint}
      attr:engine={local.engine}
      attr:hotkey={local.hotkey}
      attr:max-seconds={local.maxSeconds === undefined ? undefined : String(local.maxSeconds)}
      attr:silence={local.silence === undefined ? undefined : String(local.silence)}
      attr:commands={local.commands === false ? "false" : undefined}
      attr:layout={local.layout}
      attr:locale={local.locale}
      bool:hold={!!local.hold}
      bool:disabled={!!local.disabled}
      on:nx-voice-start={(e) => local.onStart?.(e)}
      on:nx-voice-partial={(e) => local.onPartial?.(e)}
      on:nx-voice-text={(e) => local.onText?.(e)}
      on:nx-voice-end={(e) => local.onEnd?.(e)}
      on:nx-voice-error={(e) => local.onError?.(e)}
      on:nx-voice-unavailable={(e) => local.onUnavailable?.(e)}
    />
  );
}
