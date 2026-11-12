import { createRuntimeBase } from './01-runtime-base.ts';
import { createRuntimeModel } from './01-runtime-model.ts';
import { createRuntimeScheduler } from './01-runtime-scheduler.ts';
import { createRuntimeRestore } from './01-runtime-restore.ts';
import type { RuntimeOptions } from '../types/runtime.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 01 — createAkariRuntime: one runtime made of its parts in order: definitions, errors, values and assets
// (01-runtime-base.ts); the model and expression evaluation (01-runtime-model.ts); the event scheduler
// (01-runtime-scheduler.ts); restoring an executable, and the runtime it returns (01-runtime-restore.ts). Each part
// takes the parts before it.
// ────────────────────────────────────────────────────────────────────────
export function createAkariRuntime(options?: RuntimeOptions) {
  'use strict';
  const base = createRuntimeBase(options);
  const model = createRuntimeModel(base);
  const scheduler = createRuntimeScheduler(base, model);
  return createRuntimeRestore(base, model, scheduler);
}
