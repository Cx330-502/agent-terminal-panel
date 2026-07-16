import type { CompletionSoundMode } from './config';

export interface VisibilityState {
  viewVisible: boolean;
  windowFocused: boolean;
  isActiveSession: boolean;
}

export function isSessionVisible(state: VisibilityState): boolean {
  return state.viewVisible && state.windowFocused && state.isActiveSession;
}

export function shouldShowToast(enabled: boolean, visible: boolean): boolean {
  return enabled && !visible;
}

export function shouldPlayCompletionSound(
  mode: CompletionSoundMode,
  visible: boolean
): boolean {
  if (mode === 'always') return true;
  if (mode === 'whenHidden') return !visible;
  return false;
}
