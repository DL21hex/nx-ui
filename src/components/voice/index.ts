import { define } from "../../core/define";
import { NxVoice } from "./voice";

define("nx-voice", NxVoice);

export { NxVoice, VOICE_LABELS } from "./voice";
export { parseVoiceHotkey, speechTranscript, voiceErrorCode, voiceHotkeyMatches, voiceHotkeyText, voiceLevel } from "./logic";
// El dictado en un campo (`applyDictation`, `parseDictation`) y la grabación para el servidor
// (`pickVoiceMime`, `parseVoiceLine`…) viven en chunks que el elemento carga al usarlos: se exportan
// desde `nx-ui` (el índice general, ver `INTEGRATION.md`), no desde aquí, para que `nx-ui/voice` no
// los arrastre.
export type { DictationToken } from "./voice-text";
export type {
  DictationEdit,
  VoiceEndDetail,
  VoiceEngine,
  VoiceErrorCode,
  VoiceErrorDetail,
  VoiceHotkey,
  VoiceLabels,
  VoiceLayout,
  VoiceServerLine,
  VoiceState,
  VoiceTextDetail,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-voice": NxVoice;
  }
  interface HTMLElementEventMap {
    "nx-voice-start": CustomEvent<Record<string, never>>;
    "nx-voice-partial": CustomEvent<{ text: string }>;
    "nx-voice-text": CustomEvent<import("./types").VoiceTextDetail>;
    "nx-voice-end": CustomEvent<import("./types").VoiceEndDetail>;
    "nx-voice-error": CustomEvent<import("./types").VoiceErrorDetail>;
    "nx-voice-unavailable": CustomEvent<Record<string, never>>;
  }
}
