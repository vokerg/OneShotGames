export const ONBOARDING_TUTORIAL_RUNTIME_EVENT = 'fields-of-resolve:onboarding-tutorial-runtime';
export const AUTHORED_CAMPAIGN_RUNTIME_GLOBAL = '__fieldsOfResolveAuthoredCampaign';

function freezeMarker(marker) {
  if (!marker || typeof marker !== 'object') return null;
  return Object.freeze({
    id: String(marker.id ?? ''),
    topic: String(marker.topic ?? ''),
    title: String(marker.title ?? ''),
    prompt: String(marker.prompt ?? ''),
  });
}

export function normalizeTutorialRuntimeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const runtimeId = String(snapshot.runtimeId ?? '').trim();
  const tutorialId = String(snapshot.tutorialId ?? runtimeId).trim();
  const status = String(snapshot.status ?? 'inactive').trim();
  const activeStepId = snapshot.activeStepId == null ? null : String(snapshot.activeStepId).trim() || null;
  const marker = freezeMarker(snapshot.marker);
  if (!runtimeId || !tutorialId) return null;
  return Object.freeze({ runtimeId, tutorialId, status, activeStepId, marker });
}

export function readTutorialRuntimeSnapshot(windowTarget = globalThis.window) {
  const runtime = windowTarget?.[AUTHORED_CAMPAIGN_RUNTIME_GLOBAL];
  if (typeof runtime?.tutorialSnapshot !== 'function') return null;
  return normalizeTutorialRuntimeSnapshot(runtime.tutorialSnapshot());
}

export function dispatchTutorialRuntimeEvent(windowTarget, detail) {
  if (!windowTarget?.dispatchEvent) return false;
  const EventCtor = windowTarget.CustomEvent ?? globalThis.CustomEvent ?? globalThis.Event;
  if (typeof EventCtor !== 'function') return false;
  const event = new EventCtor(ONBOARDING_TUTORIAL_RUNTIME_EVENT, { detail });
  if (event.detail == null && detail !== undefined) {
    try {
      Object.defineProperty(event, 'detail', { value: detail });
    } catch {
      return false;
    }
  }
  windowTarget.dispatchEvent(event);
  return true;
}
