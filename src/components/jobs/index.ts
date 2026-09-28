import { define } from "../../core/define";
import { NxJobs } from "./jobs";

define("nx-jobs", NxJobs);

export { NxJobs, JOBS_LABELS } from "./jobs";
export { cleanJob, cleanJobs, isJobActive, mergeJob, splitJobs, jobFraction, jobsFraction, jobPace, jobLeft, jobsDuration, jobsBackoff, jobsRetryAfter, jobsPollDelay, jobUrl, readJobsMemo } from "./logic";
export type { JobPace } from "./logic";
export type { Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-jobs": NxJobs;
  }
  interface HTMLElementEventMap {
    "nx-jobs-change": CustomEvent<{ jobs: import("./types").Job[] }>;
    "nx-jobs-done": CustomEvent<{ job: import("./types").Job }>;
    "nx-jobs-error": CustomEvent<import("./types").JobsErrorDetail>;
  }
}
