/**
 * `<nx-recurrence>`: tipos. La regla es la RRULE de iCalendar (RFC 5545) en forma de objeto, más la
 * extensión para festivos que la RRULE no tiene (`X-NX-HOLIDAYS`).
 */

export type RecurrenceFreq = "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/**
 * Qué pasa con una fecha que cae en festivo. `skip`: no va (se quita antes de `BYSETPOS`, así «el
 * último día hábil» es el último que no es sábado, domingo ni festivo). `before` / `after`: se corre
 * al día hábil (lunes a viernes, no festivo) anterior o siguiente.
 */
export type RecurrenceHolidayMode = "skip" | "before" | "after";

/** Un día de `BYDAY`: `day` 0 lunes … 6 domingo; `n` el ordinal (`-1` el último, `0` todos). */
export interface RecurrenceWeekday {
  day: number;
  n: number;
}

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Cada cuántos períodos (`INTERVAL`), ≥ 1. */
  interval: number;
  byDay: RecurrenceWeekday[];
  /** 1–31, o negativos desde el final (`-1` el último día del mes). */
  byMonthDay: number[];
  /** 1–12. */
  byMonth: number[];
  /** 0–23 y 0–59: las horas son todas las combinaciones. Sin horas, la regla es de días enteros. */
  byHour: number[];
  byMinute: number[];
  bySetPos: number[];
  /** `DTSTART`: la fecha local desde la que cuenta (ISO, «2026-09-28»). */
  start: string;
  /** Minutos del día de `DTSTART`; solo lo usa `HOURLY` (en las demás, la hora va en `byHour`). */
  startTime?: number;
  /** `UNTIL`: el último día posible, incluido (ISO, fecha local). */
  until?: string;
  /** `COUNT`: cuántas veces en total desde `start` (las que se saltan por festivo no cuentan). */
  count?: number;
  holidays?: RecurrenceHolidayMode;
}

/** Una fecha que resulta de la regla. */
export interface RecurrenceOccurrence {
  date: Date;
  /** El día local en ISO («2026-10-30»). */
  day: string;
  /** Minutos del día, o `null` si la regla es de días enteros. */
  time: number | null;
  /** Si se corrió por festivo, el día en que caía. */
  movedFrom?: string;
}

/** Festivos: una función por año (como `colombiaHolidays`) o una lista de fechas ISO. `null`, ninguno. */
export type RecurrenceHolidays = ((year: number) => Iterable<string>) | Iterable<string> | null;

/** Lo que devuelve el intérprete: la regla, o lo que no entendió. */
export interface RecurrenceParse {
  rule: RecurrenceRule | null;
  /** Las palabras que no entendió («quincenal los»); con ellas, `rule` es `null`. */
  unknown?: string;
}

export interface RecurrenceParseOptions {
  /** Desde cuándo (ISO): el `DTSTART` por defecto y la referencia de «el lunes» o «el 31 de diciembre». Por defecto, hoy. */
  start?: string;
  /** `en…` lee inglés básico; lo demás, español. */
  locale?: string;
}

/** `toJSON()` del elemento (y lo que envía el <form> con `value-format="json"`). */
export interface RecurrenceValue {
  rrule: string;
  text: string;
  holidays: RecurrenceHolidayMode | null;
  /** Las próximas fechas en hora local, «2026-10-30T17:00» (o «2026-10-30» si es de días enteros). */
  next: string[];
}

export interface RecurrenceChangeDetail {
  /** La RRULE (lo mismo que `rrule`: la convención de los campos de la librería). */
  value: string;
  rrule: string;
  text: string;
  next: Date[];
}

export interface RecurrenceErrorDetail {
  message: string;
}

export type RecurrenceValueFormat = "rrule" | "json";

export interface RecurrenceLabels {
  placeholder: string;
  /** Mientras no hay nada escrito. */
  hint: string;
  /** «no entiendo "{text}"». */
  unknown: string;
  required: string;
  /** La regla no da ninguna fecha («el 31 de febrero»). */
  none: string;
  next: string;
  /** «{from} → {to}, por festivo»: la fecha corrida. */
  moved: string;
  manual: string;
  freq: string;
  hourly: string;
  daily: string;
  weekly: string;
  monthly: string;
  yearly: string;
  every: string;
  /** Unidades de «Cada N …», separadas por «|»: horas, días, semanas, meses, años. */
  units: string;
  days: string;
  monthDay: string;
  /** «El día» (5, 20) y «El» (último viernes). */
  onDay: string;
  onThe: string;
  /** Ordinales para «El …», separados por «|»: primer, segundo, tercer, cuarto, último. */
  ordinals: string;
  /** «día» (el último día) y «día hábil» en el selector de «El último …». */
  day: string;
  businessDay: string;
  month: string;
  time: string;
  /** «De» y «a» del horario por horas. */
  from: string;
  to: string;
  start: string;
  end: string;
  never: string;
  onDate: string;
  after: string;
  times: string;
  holidays: string;
  holidaysIgnore: string;
  holidaysSkip: string;
  holidaysBefore: string;
  holidaysAfter: string;
}
