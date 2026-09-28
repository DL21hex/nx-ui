/** `<nx-jobs>`: tipos. Todo es serializable en JSON (BDUI). */

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

/** Lo que dejó un trabajo al terminar. Los enlaces pasan por `safeHref` antes de pintarse. */
export interface JobResult {
  /** «Ir al registro»: el cierre, el lote de facturas, la importación. */
  href?: string;
  /** «Descargar»: el archivo que produjo (informe, errores, XML). */
  download?: { url: string; name?: string };
  /** Cuántas filas fallaron («12 filas con error»). */
  errors?: number;
  /** «Ver filas con error». */
  errorsHref?: string;
  /** Un texto del servidor («No se pudo firmar la factura 317: certificado vencido»). */
  message?: string;
}

/** Un trabajo tal como lo describe el servidor (`GET {endpoint}?active=1`, `GET {endpoint}/{id}`). */
export interface Job {
  id: string;
  type?: string;
  title: string;
  status: JobStatus;
  /** La etapa en curso («Validando», «Guardando»). */
  stage?: string;
  /** Unidades hechas y el total (sin `total`, la barra es indeterminada). */
  done?: number;
  total?: number;
  /** ISO 8601. */
  startedAt?: string;
  finishedAt?: string;
  /** Quién lo lanzó (un nombre). */
  by?: string;
  result?: JobResult;
  /** El número del último evento aplicado (el `seq` del stream o el `id:` de SSE): ordena los eventos. */
  seq?: number;
}

/** Un evento del stream (o una respuesta del sondeo): solo `id` es obligatorio. */
export type JobEvent = Partial<Job> & { id: string };

/** Lo que recibe `start()`: se manda tal cual en el `POST {endpoint}`. */
export interface JobSpec {
  type: string;
  title: string;
  params?: unknown;
}

export interface JobsErrorDetail {
  action: "load" | "start" | "cancel" | "retry" | "stream" | "poll";
  message: string;
  id?: string;
  status?: number;
}

export interface JobsLabels {
  /** Título del panel y nombre de la píldora sin trabajos. */
  heading: string;
  /** «{n} trabajo en curso» / «{n} trabajos en curso» */
  runningOne: string;
  runningMany: string;
  /** La píldora un rato después de terminar (y en el aviso). */
  doneFlash: string;
  failedFlash: string;
  canceledFlash: string;
  /** «{n} trabajos con error» */
  failedMany: string;
  empty: string;
  recent: string;
  queued: string;
  running: string;
  done: string;
  failed: string;
  canceled: string;
  /** «{done} de {total}» */
  of: string;
  /** «faltan ~{t}» a la vista; «faltan unos {t}» para el lector de pantalla. */
  left: string;
  leftLong: string;
  soon: string;
  started: string;
  finished: string;
  by: string;
  errorsOne: string;
  errorsMany: string;
  cancel: string;
  /** «¿Cancelar «{title}»? Lo ya guardado queda.» */
  confirmCancel: string;
  confirmYes: string;
  confirmNo: string;
  canceling: string;
  retry: string;
  retryErrors: string;
  download: string;
  viewErrors: string;
  open: string;
  dismiss: string;
  /** Anuncios (`aria-live`) y notificación del sistema. */
  liveDone: string;
  liveFailed: string;
  liveCanceled: string;
  /** El botón del aviso que abre el panel. */
  view: string;
  untitled: string;
  /** «No se pudo completar ({status})» */
  error: string;
}
