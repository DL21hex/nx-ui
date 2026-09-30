/** `<Jobs>` para SolidJS: envuelve `<nx-jobs>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/jobs/index";
import type { NxJobs } from "../components/jobs/jobs";
import type { Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels } from "../components/jobs/types";

export type { NxJobs, Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels };

export interface JobsProps extends Omit<JSX.HTMLAttributes<NxJobs>, "onChange" | "onError"> {
  /** Lista (`?active=1`), lanzar (`POST`), cada trabajo (`/{id}`), `/{id}/cancel`, `/{id}/retry`. */
  endpoint: string;
  /** SSE o NDJSON con los eventos de todos los trabajos. Sin él, sondeo. */
  stream?: string;
  /** Segundos entre consultas sin stream (3). */
  poll?: number;
  /** Notificación del sistema al terminar con la pestaña oculta (pide permiso al lanzar). */
  notify?: boolean;
  /** La píldora (tenue) también sin trabajos. */
  always?: boolean;
  /** Cuántos terminados quedan en «Recientes» (10). */
  recent?: number;
  locale?: string;
  labels?: Partial<JobsLabels>;
  disabled?: boolean;
  onChange?: (e: CustomEvent<{ jobs: Job[] }>) => void;
  onDone?: (e: CustomEvent<{ job: Job }>) => void;
  onError?: (e: CustomEvent<JobsErrorDetail>) => void;
  onOpenChange?: (e: CustomEvent<{ open: boolean }>) => void;
}

export function Jobs(props: JobsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "stream", "poll", "notify", "always", "recent", "locale", "labels", "disabled", "onChange", "onDone", "onError", "onOpenChange"]);
  return (
    <nx-jobs
      {...rest}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:stream={local.stream}
      attr:poll={local.poll === undefined ? undefined : String(local.poll)}
      attr:recent={local.recent === undefined ? undefined : String(local.recent)}
      attr:locale={local.locale}
      bool:notify={!!local.notify}
      bool:always={!!local.always}
      bool:disabled={!!local.disabled}
      on:nx-jobs-change={(e) => local.onChange?.(e)}
      on:nx-jobs-done={(e) => local.onDone?.(e)}
      on:nx-jobs-error={(e) => local.onError?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e as CustomEvent<{ open: boolean }>)}
    />
  );
}
