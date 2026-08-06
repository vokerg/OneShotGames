import { acquireBrowserStorage } from '../app/browser-capabilities.js';
import { installOnboardingHelp } from './onboarding-help.js';

const disposeOnboardingHelp = installOnboardingHelp({
  windowTarget: window,
  documentTarget: document,
  storage: acquireBrowserStorage(window),
});

window.addEventListener('pagehide', disposeOnboardingHelp, { once: true });
