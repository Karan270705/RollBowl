import { Platform, AppState } from 'react-native';

export type StartupStage =
  | '00_JS_BUNDLE_INIT'
  | '01_ROOT_MOUNTED'
  | '02_SPLASH_PREVENTION_COMPLETED'
  | '03_FONT_LOADING_STARTED'
  | '04_FONT_LOADING_COMPLETED'
  | '05_SESSION_RESTORATION_STARTED'
  | '06_SESSION_RESTORATION_COMPLETED'
  | '07_ZUSTAND_SESSION_SYNCHRONIZED'
  | '08_PROFILE_FETCH_STARTED'
  | '09_PROFILE_FETCH_COMPLETED'
  | '10_PRIMARY_STALL_RESOLUTION_STARTED'
  | '11_PRIMARY_STALL_RESOLUTION_COMPLETED'
  | '12_ROUTE_DECISION_COMPLETED'
  | '13_SPLASH_HIDE_REQUESTED'
  | '14_FIRST_VISIBLE_SCREEN_RENDERED';

const STARTUP_STAGE_LABELS: Record<StartupStage, string> = {
  '00_JS_BUNDLE_INIT': '[STARTUP 00] JS bundle initialized',
  '01_ROOT_MOUNTED': '[STARTUP 01] Root layout mounted',
  '02_SPLASH_PREVENTION_COMPLETED': '[STARTUP 02] Splash prevention completed',
  '03_FONT_LOADING_STARTED': '[STARTUP 03] Font loading started',
  '04_FONT_LOADING_COMPLETED': '[STARTUP 04] Font loading completed',
  '05_SESSION_RESTORATION_STARTED': '[STARTUP 05] Supabase session restoration started',
  '06_SESSION_RESTORATION_COMPLETED': '[STARTUP 06] Supabase session restoration completed',
  '07_ZUSTAND_SESSION_SYNCHRONIZED': '[STARTUP 07] Zustand session synchronized',
  '08_PROFILE_FETCH_STARTED': '[STARTUP 08] User profile fetch started',
  '09_PROFILE_FETCH_COMPLETED': '[STARTUP 09] User profile fetch completed',
  '10_PRIMARY_STALL_RESOLUTION_STARTED': '[STARTUP 10] Primary stall resolution started',
  '11_PRIMARY_STALL_RESOLUTION_COMPLETED': '[STARTUP 11] Primary stall resolution completed',
  '12_ROUTE_DECISION_COMPLETED': '[STARTUP 12] Route decision completed',
  '13_SPLASH_HIDE_REQUESTED': '[STARTUP 13] Splash hide requested',
  '14_FIRST_VISIBLE_SCREEN_RENDERED': '[STARTUP 14] First visible screen rendered',
};

const getNowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const START_TIME_MS = getNowMs();
let isColdStart = true;
const loggedStages = new Set<StartupStage>();

export interface StartupLogContext {
  userId?: string | null;
  sessionLoading?: boolean;
  profileLoading?: boolean;
  primaryStallId?: string | null;
  pathname?: string;
  details?: Record<string, any>;
}

export function logStartupStage(stage: StartupStage, ctx: StartupLogContext = {}) {
  if (loggedStages.has(stage)) {
    return; // Ensure each stage is logged once per cold start to avoid spam
  }
  loggedStages.add(stage);

  const elapsedMs = Math.round(getNowMs() - START_TIME_MS);
  const label = STARTUP_STAGE_LABELS[stage] || `[STARTUP] ${stage}`;

  console.log(label, JSON.stringify({
    elapsedMs,
    userId: ctx.userId ?? null,
    sessionLoading: ctx.sessionLoading ?? false,
    profileLoading: ctx.profileLoading ?? false,
    primaryStallId: ctx.primaryStallId ?? null,
    pathname: ctx.pathname || '/',
    platform: Platform.OS,
    appState: AppState.currentState,
    isColdStart,
    ...ctx.details,
  }, null, 2));
}

export function logStartupError(stage: string, error: any, ctx: StartupLogContext = {}) {
  const elapsedMs = Math.round(getNowMs() - START_TIME_MS);
  console.warn('[STARTUP ERROR]', JSON.stringify({
    stage,
    elapsedMs,
    message: error?.message || String(error),
    code: error?.code,
    details: error?.details,
    stack: error?.stack,
    platform: Platform.OS,
    appState: AppState.currentState,
    isColdStart,
    ...ctx,
  }, null, 2));
}

export function resetColdStartFlagForTesting() {
  isColdStart = false;
  loggedStages.clear();
}

// Immediately log stage 00 upon JS evaluation
logStartupStage('00_JS_BUNDLE_INIT');
