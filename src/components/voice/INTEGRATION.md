# `<nx-voice>`: integración

Dictar al formulario. Un botón circular con el micrófono que reconoce con la Web Speech API del
navegador (o, sin ella o con `engine="server"`, graba y le pide el texto al servidor de la app) y
entrega lo que entendió a un `<nx-paste-fill>` (que reparte los datos) o a un `<input>`/`<textarea>`
(donde se dicta en el cursor con la puntuación dicha).

Archivos: `voice.ts` (el elemento), `logic.ts` (puro, va con el elemento: atributos, resultados de
`SpeechRecognition`, errores, volumen, atajo), `voice-text.ts` (puro, **chunk aparte**: puntuación
dictada, órdenes e inserción en el cursor; se carga al dictar en un campo), `voice-server.ts`
(**chunk aparte**: `MediaRecorder`, el `POST` y la lectura de la respuesta, más sus funciones puras;
se carga con `engine="server"`), `types.ts`, `voice.css`. No se tocó ningún otro componente:
`<nx-paste-fill>` se usa por su API pública (`fill(text)` y `undo()`).

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Voice", { tag: "nx-voice", props: ["for", "endpoint", "engine", "hold", "hotkey", "maxSeconds", "silence", "commands", "layout", "locale", "labels", "disabled"] }],
```

Todas son propiedades: `for`, `endpoint`, `engine`, `hotkey`, `layout`, `locale` reflejan el atributo
del mismo nombre; `hold` y `disabled` son booleanos; `maxSeconds` ↔ `max-seconds` y `silence` son
números acotados; `commands` es `true` salvo `commands="false"`; `labels` acepta el objeto o su JSON.
**`endpoint` ya está en `URL_PROPS`** (recibe el audio): no hace falta agregarlo.

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que importa
estáticamente, `import()` fuera; los chunks, cada uno con lo suyo).

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/voice.js`: elemento + `logic.ts` + núcleo (`Base`, `boolAttr`, `define`, `safeEndpoint`, `mergeLabels`, `resolveLocale`) | **5,84 KB** (5 981 B) | 6 KB |
| Chunk `voice-text-*.js` (puntuación dictada, órdenes, inserción en el cursor; `foldText`) | **1,59 KB** (1 633 B) | 1,75 KB |
| Chunk `voice-server-*.js` (`MediaRecorder`, `POST`, `readLines`/`lineData`, formato y lectura de líneas) | **1,55 KB** (1 584 B) | 1,75 KB |
| `dist/voice.css` | **1,11 KB** (1 138 B) | 1,5 KB |

El encargo pedía ≤ 6 KB de JS; la primera versión, con todo en la entrada, medía 7,25 KB. Para
bajar: el marcado como plantilla constante (textos con `textContent`), los atributos reflejados con un
`defineProperty` por propiedad (como `<nx-signature>`), y **dos chunks con `import()`**: el dictado en
un campo (solo si `for` apunta a un `<input>`/`<textarea>`) y la grabación para el servidor (solo con
`engine="server"` o sin la API del navegador). Por eso **esas funciones puras no se exportan desde
`nx32-elements/voice`** (lo arrastrarían a la entrada) sino desde `nx32-elements` (ver «Otros archivos a tocar»).

Para `scripts/size.mjs`:

```js
  ["dist/voice.js", 6 * 1024, "voice + núcleo (ESM; el dictado en un campo y el servidor con import())"],
  [lazy("voice-text"), 1.75 * 1024, "dictado en un campo de nx-voice: puntuación, órdenes, cursor (se carga al dictar en un campo)"],
  [lazy("voice-server"), 1.75 * 1024, "grabación y transcripción con servidor de nx-voice (se carga con engine=\"server\")"],
  // …
  ["dist/voice.css", 1.5 * 1024, "voice (CSS)"],
```

(`lazy()` busca `voice-text-*.js` y `voice-server-*.js`: los nombres llevan el prefijo para no
confundirse con un chunk compartido de `src/core/text.ts`.)

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "voice", label: "Dictar", href: "#/voice", icon: "mic", section: "Componentes", badge: "Nuevo" },
```

`mic` no está entre los íconos generados: agregar `"mic"` a la lista de `scripts/gen-icons.mjs` y
regenerar `src/icons/lucide.ts` (o, sin tocarlos, usar `keyboard`).

En `PAGES`: `"#/voice": { template: "page-voice", mount: mountVoiceDemo },` con
`import { mountVoiceDemo } from "./demo-voice";` e `import "./pages/voice.css";`. La plantilla está en
`gallery/pages/voice.html` para pegarla en `gallery/index.html`.

La demo registra `/demo/voice/transcribe` (el «servidor» de transcripción: un texto fijo o la frase
que se está simulando, con `{partial}` y `{text}` en NDJSON) y `/demo/voice/fill` (el `endpoint` del
`<nx-paste-fill>` del pedido: entiende cantidad, producto, calibre, cliente, entrega y observaciones,
que el extractor local de paste-fill no sabe leer) con `addDemoRoute`. «Probar sin micrófono» instala
mientras dura una `SpeechRecognition` de mentira y reemplaza `navigator.mediaDevices.getUserMedia` por
un audio sintético (un oscilador con un pulso por palabra, que mueve el anillo); al terminar la toma
devuelve los originales.

## Solid

En `src/solid/index.tsx`: agregar `<Voice>` al comentario de cabecera, y

```tsx
import "../components/voice/index";
import type { NxVoice } from "../components/voice/voice";
import type { VoiceEndDetail, VoiceEngine, VoiceErrorDetail, VoiceLabels, VoiceLayout, VoiceTextDetail } from "../components/voice/types";

export type { NxVoice, VoiceEndDetail, VoiceEngine, VoiceErrorDetail, VoiceLabels, VoiceLayout, VoiceTextDetail };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<VoiceLabels>` a la unión.
    }
    interface ExplicitAttributes {
      // `for`, `endpoint`, `hotkey`, `layout`, `locale` ya existen.
      engine: VoiceEngine | undefined;
      "max-seconds": string | undefined;
      silence: string | undefined;
      commands: "false" | undefined;
    }
    interface ExplicitBoolAttributes {
      // `disabled` ya existe. (`hold` también está en ExplicitAttributes como texto, de otro
      // componente: aquí va como booleano, son espacios distintos.)
      hold: boolean;
    }
    interface CustomEvents {
      "nx-voice-start": CustomEvent<Record<string, never>>;
      "nx-voice-partial": CustomEvent<{ text: string }>;
      "nx-voice-text": CustomEvent<VoiceTextDetail>;
      "nx-voice-end": CustomEvent<VoiceEndDetail>;
      "nx-voice-error": CustomEvent<VoiceErrorDetail>;
      "nx-voice-unavailable": CustomEvent<Record<string, never>>;
    }
    interface IntrinsicElements {
      "nx-voice": HTMLAttributes<NxVoice>;
    }
```

El envoltorio (al final del archivo):

```tsx
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
```

(El elemento no tiene hijos del autor: arma su botón y su transcripción al conectarse. En SSR sale
vacío y se arma al hidratar. `nx-voice-unavailable` se emite al conectarse: un `on:` de Solid ya está
puesto para entonces.)

## README

````md
## `<nx-voice>`

**Dictar al formulario.** En bodega, en campo o manejando el montacargas: «veinte láminas calibre
catorce para Ferretería El Tornillo, entrega el viernes» y el formulario se llena.

- **Reconocimiento:** la Web Speech API del navegador (`SpeechRecognition`), en el idioma del
  `locale` (es-CO por defecto), con los parciales en gris mientras se habla y el final en negro. Sin
  ella, o con `engine="server"`, graba con `MediaRecorder` (WebM/Ogg con Opus, MP4 en Safari) y hace
  `POST {endpoint}` con el audio (`FormData`: `audio`, `lang`); el servidor responde `{text}`, texto
  plano, o NDJSON/SSE con `{partial}` y `{text}`. Sin ninguna de las dos, **el botón no aparece** y
  `nx-voice-unavailable` avisa una vez: el formulario sigue igual.
- **Cómo se habla:** tocar para hablar (otro toque o 2 s de silencio terminan) o `hold`: mientras se
  mantiene el botón o la barra espaciadora (con guantes o ruido). `hotkey="Alt+V"` para toda la página,
  sin chocar con el toque de Alt de `<nx-keytips>`. Escape cancela.
- **Feedback:** el anillo alrededor del botón sigue el volumen real (`AnalyserNode` sobre el mismo
  micrófono); con movimiento reducido, un punto que toma el color del acento. «Escuchando…»,
  «Procesando…» y los errores con qué hacer: sin permiso, «No te entendí», «Sin conexión».
- **Entrega:** a un `<nx-paste-fill>` le pasa el texto a `fill(text)` y muestra «Llené 4 campos ·
  Deshacer». En un `<input>`/`<textarea>` escribe en el cursor (o sobre lo seleccionado), con
  `input` y `change`: los signos dichos («coma», «punto y aparte», «nueva línea», «signo de
  interrogación»…), mayúscula al empezar la frase, el «¿» de apertura, y «borrar eso» / «borra la
  última palabra» (`commands="false"` las apaga). Sin `for`, solo el evento `nx-voice-text`
  (cancelable).
- **Privacidad:** el micrófono se apaga siempre al terminar, al ocultar la pestaña, al desconectar el
  elemento y a los `max-seconds` (30), con todas las pistas detenidas y el `AudioContext` cerrado.
  Nunca graba en segundo plano. **La voz de Chrome y Edge se reconoce en los servidores de Google o
  Microsoft** (el audio sale del equipo); `engine="server"` usa el servidor propio de la app aunque el
  navegador tenga la API. `endpoint` solo del mismo origen (o de `allowOrigins`).

```html
<nx-voice for="pedido-fill" hotkey="Alt+V"></nx-voice>
<nx-paste-fill id="pedido-fill" fields='[{"name":"cantidad","kind":"number"}]'>
  <form>…</form>
</nx-paste-fill>

<textarea id="novedades"></textarea>
<nx-voice for="novedades" hold layout="stacked"></nx-voice>

<nx-voice for="pedido-fill" engine="server" endpoint="/api/voz"></nx-voice>
```

| | |
|---|---|
| Propiedades / atributos | `for`, `endpoint`, `engine` (`auto`, `browser`, `server`), `hold`, `hotkey`, `max-seconds` (30), `silence` (ms, 2000), `commands` (`"false"` las apaga), `layout` (`inline`, `stacked`), `locale`, `labels`, `disabled` · solo lectura: `state` (`idle`, `asking`, `listening`, `processing`, `error`, `unavailable`), `supported`, `text` |
| Métodos | `start()`, `stop()`, `cancel()` |
| Eventos | `nx-voice-start`, `nx-voice-partial` `{text}`, `nx-voice-text` `{text, confidence, final}` (cancelable), `nx-voice-end` `{text, canceled}`, `nx-voice-error` `{code, message}` (`not-allowed`, `no-speech`, `network`, `no-mic`, `server`, `failed`), `nx-voice-unavailable` |
| Funciones | `applyDictation(valor, inicio, fin, dicho, {orders?, last?})` → `{value, caret, range}`, `parseDictation(dicho)`, `pickVoiceMime(isTypeSupported)`, `parseVoiceLine(línea)`, `voiceFileName(tipo)`, `parseVoiceHotkey("Alt+V")`, `voiceHotkeyMatches(atajo, evento)`, `speechTranscript(resultados)`, `voiceLevel(bytes)`, `voiceErrorCode(error)`, `VOICE_LABELS`, `VOICE_MIMES` |
````

## Otros archivos a tocar

- `src/index.ts` → estas tres líneas (las funciones de los chunks se exportan desde aquí, no desde
  `nx32-elements/voice`, para que su entrada no las cargue):

  ```ts
  export * from "./components/voice/index";
  export { applyDictation, parseDictation } from "./components/voice/voice-text";
  export { VOICE_MIMES, parseVoiceLine, pickVoiceMime, voiceFileName } from "./components/voice/voice-server";
  ```

  Nombres revisados contra lo exportado hoy: `NxVoice`, `VOICE_LABELS`, `VOICE_MIMES`,
  `applyDictation`, `parseDictation`, `parseVoiceHotkey`, `parseVoiceLine`, `pickVoiceMime`,
  `speechTranscript`, `voiceErrorCode`, `voiceFileName`, `voiceHotkeyMatches`, `voiceHotkeyText`,
  `voiceLevel` y los tipos `Voice*`, `DictationEdit`, `DictationToken` son nuevos. `record` y
  `transcribe` de `voice-server.ts` no se exportan (son del elemento).
- `src/styles/nx32-elements.css` → `@import "../components/voice/voice.css";`
- `vite.config.ts` → `voice: "src/components/voice/index.ts",`
- `scripts/build-css.mjs` → `"voice": "src/components/voice/voice.css",`
- `package.json` → `"./voice": { "types": "./dist/types/components/voice/index.d.ts", "import": "./dist/voice.js" }`
  y `"./voice.css": "./dist/voice.css"`. `sideEffects` ya cubre los chunks con hash.
- `README.md` → la sección de arriba.
- `test/ssr-import.test.ts` importa `src/index.ts`: con las líneas de arriba cubre también este
  componente (`test/voice.logic.test.ts` ya prueba que su índice importa sin DOM).

## Decisiones

- **Dos chunks para cumplir los 6 KB** (ver «Peso»). El dictado en un campo se carga en la primera
  entrega a un `<input>`/`<textarea>` (después queda en caché); la grabación para el servidor, al
  empezar con ese motor, en paralelo con el permiso del micrófono.
- **El medidor abre su propio `getUserMedia` también con la API del navegador** (el encargo lo pide:
  «sobre el mismo `getUserMedia`»). La API del navegador abre el micrófono por su cuenta; el nuestro es
  solo para el anillo y se apaga con todo lo demás. Si `getUserMedia` no existe, la API del navegador
  dicta igual y el anillo queda quieto. Un permiso negado en `getUserMedia` es el error `not-allowed`
  sin llegar a arrancar el reconocimiento. El `AudioContext` se crea dentro del gesto (antes del
  primer `await`) para que no quede suspendido.
- **Silencio:** con la API del navegador cuenta el tiempo desde el último resultado (parcial o final);
  con el servidor, desde el último cuadro del medidor por encima del umbral (0,08 en la escala de
  `voiceLevel`). Sin haber oído nada, a los 8 s se deja de escuchar («No te entendí»). Con `hold` no
  hay corte por silencio: solo soltar o el tope. Con el servidor y sin medidor (sin `AudioContext`),
  tampoco: solo el botón o el tope.
- **`continuous`:** encendido (el silencio lo maneja el componente con `silence`), salvo en Android,
  donde Chrome repite los resultados en modo continuo: allí una frase por toma y el motor termina
  solo. Los resultados se reconstruyen completos en cada evento (no solo los nuevos), así un motor
  que reescribe uno no duplica palabras.
- **Tras `stop()`** el micrófono se apaga en el acto y se espera el final del navegador hasta 4 s; si
  no llega, se entrega lo que haya. Si solo hubo parciales, se entregan con `final: false`.
- **Ocultar la pestaña termina** la toma y entrega lo dicho (no la descarta); desconectar el elemento
  **cancela** (no entrega). Pidiendo permiso, ocultar o soltar el botón cancela (con `hold`, la
  primera vez el navegador puede mostrar su aviso de permiso mientras se mantiene el botón: esa toma
  se cancela y la siguiente ya funciona).
- **Un solo micrófono a la vez:** empezar otro `<nx-voice>` detiene el que escuchaba.
- **Atajo:** `code` para letras y dígitos (Alt+V en un Mac da «√»), modificadores exactos, y si hay
  un `<nx-keytips>` abierto (Alt mantenido) la letra es de él. No se detiene la propagación: así
  `<nx-keytips>` ve la V y no toma el Alt que se suelta como un toque. Con `hold`, se escucha mientras
  se mantiene y cualquier tecla que se suelte termina.
- **`hold` y el clic:** el puntero y la barra espaciadora manejan la toma; el clic que siguen
  generando se ignora (con puntero por `detail`, con la barra por los 400 ms tras soltar). Enter
  (clic sin puntero) alterna, para quien no puede mantener una tecla.
- **Accesibilidad:** el botón cambia `aria-pressed` y su nombre («Dictar» / «Dejar de escuchar»),
  lleva `aria-keyshortcuts` con el atajo y `aria-describedby` hacia el estado. La transcripción visible
  **no** es región viva; hay una aparte (`aria-live="polite"`) que anuncia una sola vez al terminar:
  «Dictado: …» más el resumen de paste-fill, o el error.
- **«Pidiendo permiso» aparece a los 300 ms** (una animación con retraso en CSS): con el permiso ya
  dado, `getUserMedia` responde enseguida y el aviso no parpadea.
- **Español hablado** (solo al dictar en un campo; a paste-fill va el texto tal cual): «punto» y
  «coma» después de un artículo o una preposición («el punto de venta», «la coma decimal», «estado de
  coma») o antes de «de» son palabras. Al dictar «signo de interrogación» (o de exclamación) se pone el
  «¿» al comienzo de la frase si no lo tiene; con «abre interrogación» explícito no se duplica. La
  mayúscula va al comienzo del campo y tras `.`, `?`, `!`, `…` o salto de línea; nunca se bajan las
  mayúsculas que trae el motor (nombres propios). Lo que el motor ya puntúa (Safari) queda como vino.
- **«Borrar eso»** quita lo dictado antes en la misma toma o, si la toma no trae nada antes, la toma
  anterior en ese campo **solo si el cursor sigue justo después de ella** (si la persona movió el
  cursor o escribió, no se borra nada). El «¿» agregado por la pregunta cuenta como parte de lo
  dictado.
- **Escritura en el campo:** con el setter nativo de `value` (React y compañía vigilan la instancia),
  el cursor queda al final de lo dictado, y `input` + `change`. El foco no se mueve al campo (con
  `hold` y la barra, el foco tiene que seguir en el botón para la siguiente toma).
- **La entrega a paste-fill** usa cualquier elemento con `fill(text)` (y `undo()` para «Deshacer»):
  «Llené {n} campos» cuenta `values` del detalle que devuelve `fill`. Con 0 campos, «No encontré
  datos para el formulario», sin deshacer.
- **Servidor:** el audio va como `File` (`voz.webm`, `voz.ogg` o `voz.m4a`) con `lang`; JSON se lee
  entero (aunque venga con saltos de línea), NDJSON/SSE línea a línea con `readLines`, y `text/plain`
  como el texto. `{error}` o un HTTP de error es `server`; un `{text: ""}`, `no-speech`.
- **La demo:** el extractor local de paste-fill no entiende un pedido de bodega (solo sacaba la
  fecha de «20 láminas galvanizadas calibre 14 para Ferretería El Tornillo, entrega el viernes»), así
  que el `<nx-paste-fill>` del pedido tiene `endpoint="/demo/voice/fill"`, un «servidor» que entiende
  cantidad, producto, calibre, cliente y observaciones, como lo haría el backend de la app. Las frases
  simuladas van como las entrega Chrome: sin puntuación y con los números en cifras.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el micrófono real, ni la Web Speech API de Chrome,
  Edge o Safari, ni cómo se ve (el anillo con el volumen, el punto con movimiento reducido, el giro de
  «Procesando…», `layout="stacked"`, el modo oscuro), ni axe/contraste, ni Playwright.
- Todo lo del navegador está simulado en happy-dom: `SpeechRecognition`, `getUserMedia`,
  `AudioContext`/`AnalyserNode` y `MediaRecorder` son de mentira en `test/voice.dom.test.ts`. Falta ver
  en un navegador real: que Chrome acepte el `getUserMedia` del medidor a la vez que su reconocimiento
  (lo normal es que sí), el comportamiento de `continuous` en Chrome de escritorio con pausas largas,
  el error `network` sin conexión, el `no-speech` del motor frente a nuestros 8 s, y el `aborted` que
  llega al cancelar.
- `MediaRecorder` real: que `stop()` entregue el último `dataavailable` antes de detener las pistas
  (se llama en ese orden y hay un tope de 1,5 s), y el formato que elige cada navegador (Safari: MP4).
- El umbral de voz (0,08) y el tiempo del silencio con un micrófono real en una bodega con ruido: con
  ruido constante el corte por silencio del servidor puede no llegar y termina el tope (`hold` es la
  recomendación para ese caso).
- La simulación de la galería (API de mentira y audio sintético con `createMediaStreamDestination`)
  no se ejecutó; tampoco `engine="server"` con el `MediaRecorder` real sobre ese audio.
- `setPointerCapture` y el menú contextual de mantener presionado en un teléfono
  (`-webkit-touch-callout: none`, `touch-action: none`).
- La página de la galería no está enlazada (falta `gallery/main.ts`/`index.html`, ver «Nav»).
