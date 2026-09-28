import { describe, expect, it } from "vitest";
import { clampVoice, cleanVoiceEngine, cleanVoiceLayout, parseVoiceHotkey, speechTranscript, voiceErrorCode, voiceHotkeyMatches, voiceHotkeyText, voiceLevel } from "../src/components/voice/logic";
import { VOICE_MIMES, parseVoiceLine, pickVoiceMime, voiceFileName } from "../src/components/voice/voice-server";
import { applyDictation, parseDictation } from "../src/components/voice/voice-text";

/** Dictar en un campo vacío (o con `before` y el cursor al final). */
const say = (spoken: string, before = "", opts: Parameters<typeof applyDictation>[4] = {}) => applyDictation(before, before.length, before.length, spoken, opts).value;

describe("importar sin DOM (SSR)", () => {
  it("el índice del componente no lanza en Node", async () => {
    const mod = await import("../src/components/voice/index");
    expect(mod.VOICE_LABELS.dictate).toBe("Dictar");
    expect(typeof mod.NxVoice).toBe("function");
  });
});

describe("parseDictation", () => {
  it("separa el texto de los signos y las órdenes", () => {
    expect(parseDictation("hola coma cómo estás signo de interrogación")).toEqual([
      { t: "text", v: "hola" },
      { t: "mark", v: "," },
      { t: "text", v: "cómo estás" },
      { t: "mark", v: "?" },
    ]);
    expect(parseDictation("uno borrar eso dos borra la última palabra")).toEqual([
      { t: "text", v: "uno" },
      { t: "order", v: "that" },
      { t: "text", v: "dos" },
      { t: "order", v: "word" },
    ]);
  });

  it("lo largo gana: «punto y coma», «punto y aparte», «dos puntos»", () => {
    const marks = (s: string) => parseDictation(s).filter((t) => t.t === "mark").map((t) => t.v);
    expect(marks("a punto y coma b")).toEqual([";"]);
    expect(marks("a punto y aparte b")).toEqual([".\n"]);
    expect(marks("a punto y seguido b")).toEqual(["."]);
    expect(marks("a dos puntos b")).toEqual([":"]);
    expect(marks("a puntos suspensivos")).toEqual(["…"]);
    expect(marks("a nueva línea b nuevo renglón c salto de línea d nuevo párrafo")).toEqual(["\n", "\n", "\n", "\n\n"]);
    expect(marks("a punto final")).toEqual(["."]);
    expect(marks("abre paréntesis x cierra paréntesis")).toEqual(["(", ")"]);
    expect(marks("abre interrogación x cierra interrogación abrir signo de exclamación y cerrar exclamación")).toEqual(["¿", "?", "¡", "!"]);
    expect(marks("signo de admiración")).toEqual(["!"]);
  });

  it("sin tildes ni mayúsculas, y solo palabras enteras", () => {
    expect(parseDictation("Hola COMA Nueva Linea")).toEqual([{ t: "text", v: "Hola" }, { t: "mark", v: "," }, { t: "mark", v: "\n" }]);
    // «comas», «puntos», «coman», «apuntó»: no son signos.
    for (const s of ["dos comas", "tres puntos", "que coman", "apuntó todo", "puntual"]) expect(parseDictation(s)).toEqual([{ t: "text", v: s }]);
  });

  it("«punto» y «coma» como sustantivos no son signos", () => {
    for (const s of ["el punto de venta", "un punto", "a punto de salir", "la coma decimal", "estado de coma", "este punto"]) {
      expect(parseDictation(s).some((t) => t.t === "mark")).toBe(false);
    }
  });

  it("sin órdenes (`orders=false`), «borrar eso» es texto", () => {
    expect(parseDictation("borrar eso", false)).toEqual([{ t: "text", v: "borrar eso" }]);
  });

  it("vacío, espacios y basura", () => {
    expect(parseDictation("")).toEqual([]);
    expect(parseDictation("   ")).toEqual([]);
    expect(parseDictation(null as unknown as string)).toEqual([]);
    expect(parseDictation(undefined as unknown as string)).toEqual([]);
  });

  it("texto en NFD (tildes combinadas) se entiende igual", () => {
    expect(parseDictation("nueva línea".normalize("NFD"))).toEqual([{ t: "mark", v: "\n" }]);
  });
});

describe("applyDictation: puntuación y mayúsculas", () => {
  it("mayúscula al inicio, signos pegados a la palabra, ¿ al comienzo de la pregunta", () => {
    expect(say("hola coma cómo estás signo de interrogación")).toBe("¿Hola, cómo estás?");
    expect(say("qué bien signo de exclamación")).toBe("¡Qué bien!");
    expect(say("abre interrogación viene mañana cierra interrogación")).toBe("¿Viene mañana?");
  });

  it("punto y aparte, nueva línea y mayúscula en la frase siguiente", () => {
    expect(say("primera línea punto y aparte segunda línea")).toBe("Primera línea.\nSegunda línea");
    expect(say("uno punto dos")).toBe("Uno. Dos");
    expect(say("uno nueva línea dos")).toBe("Uno\nDos");
    expect(say("uno dos puntos tres")).toBe("Uno: tres");
    expect(say("uno punto y coma dos")).toBe("Uno; dos");
    expect(say("espera puntos suspensivos listo")).toBe("Espera… Listo");
  });

  it("una novedad de entrega dictada de corrido", () => {
    expect(say("descargar por la puerta 3 coma con montacargas punto y aparte quién recibe en la portería signo de interrogación")).toBe(
      "Descargar por la puerta 3, con montacargas.\n¿Quién recibe en la portería?",
    );
  });

  it("paréntesis", () => {
    expect(say("vidrio abre paréntesis frágil cierra paréntesis")).toBe("Vidrio (frágil)");
  });

  it("sigue el contexto de lo que ya había antes del cursor", () => {
    expect(say("bien", "Hola.")).toBe("Hola. Bien");
    expect(say("bien", "Hola,")).toBe("Hola, bien");
    expect(say("bien", "Hola ")).toBe("Hola bien");
    expect(say("bien", "Hola\n")).toBe("Hola\nBien");
    expect(say("coma y más", "Hola")).toBe("Hola, y más");
    // La pregunta empieza en la frase que ya estaba.
    expect(say("mañana signo de interrogación", "Listo. Vienes")).toBe("Listo. ¿Vienes mañana?");
    // Ya tenía el de apertura.
    expect(say("mañana signo de interrogación", "¿Vienes")).toBe("¿Vienes mañana?");
  });

  it("respeta las mayúsculas que trae el motor y no baja nada", () => {
    expect(say("para Ferretería El Tornillo", "Pedido")).toBe("Pedido para Ferretería El Tornillo");
  });

  it("el signo que ya trae el motor (Safari) queda como vino", () => {
    expect(say("Hola, cómo estás?")).toBe("Hola, cómo estás?");
  });
});

describe("applyDictation: el cursor y la selección", () => {
  it("en medio del texto, con los espacios justos", () => {
    const v = "Entregar el viernes";
    expect(applyDictation(v, 11, 11, "próximo")).toEqual({ value: "Entregar el próximo viernes", caret: 19, range: [11, 19] });
    // Sin espacio después del cursor: se agrega uno para no pegar las palabras.
    expect(applyDictation("holamundo", 4, 4, "querido")).toEqual({ value: "hola querido mundo", caret: 12, range: [4, 12] });
    // Antes de un signo, nada.
    expect(applyDictation("Hola.", 4, 4, "a todos").value).toBe("Hola a todos.");
  });

  it("reemplaza lo seleccionado", () => {
    expect(applyDictation("hola mundo", 5, 10, "amigo")).toEqual({ value: "hola amigo", caret: 10, range: [5, 10] });
    // Una selección al revés o fuera de rango se acota.
    expect(applyDictation("hola", 10, 2, "x").value).toBe("hola x");
    expect(applyDictation("hola", -5, 2, "x").value).toBe("X la");
    expect(applyDictation("hola", NaN, NaN, "x").value).toBe("hola x");
  });

  it("al comienzo de un campo vacío o nulo", () => {
    expect(applyDictation("", 0, 0, "listo")).toEqual({ value: "Listo", caret: 5, range: [0, 5] });
    expect(applyDictation(null as unknown as string, 0, 0, "listo").value).toBe("Listo");
    expect(applyDictation("x", 1, 1, "")).toEqual({ value: "x", caret: 1, range: null });
  });
});

describe("applyDictation: órdenes", () => {
  it("«borrar eso» quita lo dictado antes en la misma toma", () => {
    expect(say("hola mundo borrar eso adiós")).toBe("Adiós");
    expect(say("uno coma dos borrar eso tres", "Lista:")).toBe("Lista: tres");
  });

  it("«borrar eso» solo quita el dictado anterior si el cursor sigue ahí", () => {
    const first = applyDictation("Hola.", 5, 5, "adiós");
    expect(first).toEqual({ value: "Hola. Adiós", caret: 11, range: [5, 11] });
    expect(applyDictation(first.value, 11, 11, "borrar eso", { last: first.range })).toEqual({ value: "Hola.", caret: 5, range: null });
    // El cursor se movió: no borra nada.
    expect(applyDictation(first.value, 3, 3, "borrar eso", { last: first.range }).value).toBe("Hola. Adiós");
    // Sin dictado anterior: nada.
    expect(applyDictation("Hola.", 5, 5, "borrar eso").value).toBe("Hola.");
    // Un rango que no cuadra con el valor no rompe.
    expect(applyDictation("ab", 2, 2, "borrar eso", { last: [5, 2] }).value).toBe("ab");
  });

  it("«borrar eso» quita también el ¿ que agregó la pregunta", () => {
    const q = applyDictation("Listo. Vienes", 13, 13, "signo de interrogación");
    expect(q.value).toBe("Listo. ¿Vienes?");
    expect(q.range).toEqual([7, 15]);
  });

  it("«borra la última palabra» quita la palabra antes del cursor", () => {
    expect(say("borra la última palabra viernes", "Entrega el martes")).toBe("Entrega el viernes");
    expect(say("borrar la última palabra", "Uno\ndos")).toBe("Uno\n");
    expect(say("borra la última palabra", "")).toBe("");
  });

  it("con `orders: false` las órdenes se escriben", () => {
    expect(say("hola borrar eso", "", { orders: false })).toBe("Hola borrar eso");
  });
});

describe("applyDictation: rendimiento", () => {
  it("un dictado largo (20 000 palabras con signos) en tiempo lineal", () => {
    const words = Array.from({ length: 20_000 }, (_, i) => (i % 10 === 9 ? "coma" : i % 25 === 24 ? "punto" : `palabra${i}`)).join(" ");
    const t0 = performance.now();
    const out = applyDictation("", 0, 0, words);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(out.value.startsWith("Palabra0 palabra1")).toBe(true);
    expect(out.value).toContain("palabra8,");
  });
});

describe("speechTranscript", () => {
  const r = (t: string, isFinal: boolean, confidence?: number) => Object.assign([{ transcript: t, confidence }], { isFinal });
  it("junta lo definitivo y lo parcial, con la confianza media", () => {
    expect(speechTranscript([r("veinte láminas", true, 0.9), r(" calibre", true, 0.7), r(" catorce para", false)])).toEqual({ final: "veinte láminas calibre", interim: "catorce para", confidence: 0.8 });
  });
  it("Chrome da 0 cuando no sabe la confianza: queda `null`", () => {
    expect(speechTranscript([r("hola", true, 0)]).confidence).toBeNull();
    expect(speechTranscript([r("hola", false, 0.9)]).confidence).toBeNull();
  });
  it("vacíos y basura", () => {
    expect(speechTranscript(null)).toEqual({ final: "", interim: "", confidence: null });
    expect(speechTranscript([r("  ", true, 1), [] as unknown as ReturnType<typeof r>])).toEqual({ final: "", interim: "", confidence: null });
    expect(speechTranscript([r("x", true, 7)]).confidence).toBe(1);
  });
});

describe("voiceErrorCode", () => {
  it("errores del reconocimiento y del micrófono", () => {
    expect(voiceErrorCode("not-allowed")).toBe("not-allowed");
    expect(voiceErrorCode("service-not-allowed")).toBe("not-allowed");
    expect(voiceErrorCode("NotAllowedError")).toBe("not-allowed");
    expect(voiceErrorCode("no-speech")).toBe("no-speech");
    expect(voiceErrorCode("no-match")).toBe("no-speech");
    expect(voiceErrorCode("network")).toBe("network");
    expect(voiceErrorCode("audio-capture")).toBe("no-mic");
    expect(voiceErrorCode("NotFoundError")).toBe("no-mic");
    expect(voiceErrorCode("NotReadableError")).toBe("no-mic");
    expect(voiceErrorCode("language-not-supported")).toBe("failed");
    expect(voiceErrorCode(undefined)).toBe("failed");
    expect(voiceErrorCode("aborted")).toBeNull();
  });
});

describe("voiceLevel", () => {
  it("silencio, voz y saturación", () => {
    expect(voiceLevel(new Uint8Array(256).fill(128))).toBe(0);
    const voice = Uint8Array.from({ length: 256 }, (_, i) => 128 + (i % 2 ? 16 : -16));
    expect(voiceLevel(voice)).toBeCloseTo(0.5, 2);
    expect(voiceLevel(Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
    expect(voiceLevel(new Uint8Array(0))).toBe(0);
    expect(voiceLevel(null as unknown as Uint8Array)).toBe(0);
  });
});

describe("atajo de página", () => {
  const ev = (key: string, code: string, mods: Partial<Record<"altKey" | "ctrlKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({ key, code, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...mods });
  it("lee el atajo", () => {
    expect(parseVoiceHotkey("Alt+V")).toEqual({ key: "v", alt: true, ctrl: false, shift: false, meta: false });
    expect(parseVoiceHotkey("ctrl + shift + d")).toEqual({ key: "d", alt: false, ctrl: true, shift: true, meta: false });
    expect(parseVoiceHotkey("Cmd+Option+Space")).toEqual({ key: " ", alt: true, ctrl: false, shift: false, meta: true });
    expect(parseVoiceHotkey("F2")).toEqual({ key: "f2", alt: false, ctrl: false, shift: false, meta: false });
    expect(parseVoiceHotkey("Hyper+V")).toBeNull();
    expect(parseVoiceHotkey("Alt+")).toBeNull();
    expect(parseVoiceHotkey("")).toBeNull();
    expect(parseVoiceHotkey(null)).toBeNull();
    expect(parseVoiceHotkey("constructor+v")).toBeNull();
  });
  it("compara por la tecla física y los modificadores exactos", () => {
    const hk = parseVoiceHotkey("Alt+V");
    expect(voiceHotkeyMatches(hk, ev("v", "KeyV", { altKey: true }))).toBe(true);
    // Alt+V en un Mac: la tecla dice «√».
    expect(voiceHotkeyMatches(hk, ev("√", "KeyV", { altKey: true }))).toBe(true);
    expect(voiceHotkeyMatches(hk, ev("v", "KeyV"))).toBe(false);
    expect(voiceHotkeyMatches(hk, ev("v", "KeyV", { altKey: true, ctrlKey: true }))).toBe(false);
    expect(voiceHotkeyMatches(hk, ev("b", "KeyB", { altKey: true }))).toBe(false);
    // Solo Alt (lo de <nx-keytips>) no es el atajo.
    expect(voiceHotkeyMatches(hk, ev("Alt", "AltLeft", { altKey: true }))).toBe(false);
    expect(voiceHotkeyMatches(parseVoiceHotkey("Ctrl+1"), ev("!", "Digit1", { ctrlKey: true }))).toBe(true);
    expect(voiceHotkeyMatches(parseVoiceHotkey("F2"), ev("F2", "F2"))).toBe(true);
    expect(voiceHotkeyMatches(parseVoiceHotkey("Ctrl+Space"), ev(" ", "Space", { ctrlKey: true }))).toBe(true);
    expect(voiceHotkeyMatches(null, ev("v", "KeyV"))).toBe(false);
  });
  it("el texto para mostrar y para aria-keyshortcuts", () => {
    expect(voiceHotkeyText(parseVoiceHotkey("alt+v")!)).toBe("Alt+V");
    expect(voiceHotkeyText(parseVoiceHotkey("shift+ctrl+f2")!)).toBe("Control+Shift+F2");
    expect(voiceHotkeyText(parseVoiceHotkey("meta+space")!)).toBe("Meta+Space");
  });
});

describe("atributos", () => {
  it("motor, disposición y números acotados", () => {
    expect(cleanVoiceEngine("server")).toBe("server");
    expect(cleanVoiceEngine("browser")).toBe("browser");
    expect(cleanVoiceEngine("whisper")).toBe("auto");
    expect(cleanVoiceEngine(null)).toBe("auto");
    expect(cleanVoiceLayout("stacked")).toBe("stacked");
    expect(cleanVoiceLayout("grid")).toBe("inline");
    expect(clampVoice("45", 30, 1, 300)).toBe(45);
    expect(clampVoice("9000", 30, 1, 300)).toBe(300);
    expect(clampVoice("0", 30, 1, 300)).toBe(1);
    expect(clampVoice("mucho", 30, 1, 300)).toBe(30);
    expect(clampVoice(null, 30, 1, 300)).toBe(30);
    expect(clampVoice("", 30, 1, 300)).toBe(30);
  });
});

describe("grabación para el servidor", () => {
  it("elige el primer formato que el navegador graba", () => {
    expect(pickVoiceMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickVoiceMime((t) => t.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
    expect(pickVoiceMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickVoiceMime(() => false)).toBe("");
    // Un navegador que lanza en vez de decir que no.
    expect(
      pickVoiceMime((t) => {
        if (t.includes("webm")) throw new Error("no");
        return true;
      }),
    ).toBe("audio/ogg;codecs=opus");
    expect(VOICE_MIMES[0]).toBe("audio/webm;codecs=opus");
  });
  it("el nombre del archivo según el formato", () => {
    expect(voiceFileName("audio/webm;codecs=opus")).toBe("voz.webm");
    expect(voiceFileName("audio/ogg")).toBe("voz.ogg");
    expect(voiceFileName("audio/mp4")).toBe("voz.m4a");
    expect(voiceFileName("")).toBe("voz.webm");
  });
  it("lee las líneas del servidor", () => {
    expect(parseVoiceLine('{"partial":" veinte "}')).toEqual({ partial: "veinte" });
    expect(parseVoiceLine('{"text":" veinte láminas ","confidence":0.8}')).toEqual({ text: "veinte láminas", confidence: 0.8 });
    expect(parseVoiceLine('{"text":"x","confidence":87}')).toEqual({ text: "x", confidence: 0.87 });
    expect(parseVoiceLine('{"text":"x","confidence":"alta"}')).toEqual({ text: "x", confidence: null });
    expect(parseVoiceLine('{"text":"x","confidence":-1}')).toEqual({ text: "x", confidence: null });
    expect(parseVoiceLine('{"error":"cuota agotada"}')).toEqual({ error: "cuota agotada" });
    expect(parseVoiceLine('{"error":true}')).toEqual({ error: "error" });
    for (const bad of [null, "", "[DONE]", "no es json", "5", "null", '{"otra":1}', '"texto"']) expect(parseVoiceLine(bad)).toBeNull();
  });
});
