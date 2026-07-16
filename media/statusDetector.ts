import type { SessionStatus } from '../src/shared';
import { isApprovalDecisionInput, isSubmissionInput } from '../src/input';

export interface StatusUpdate {
  status: SessionStatus;
  attention: boolean;
  detail?: string;
}

type ScreenState = SessionStatus | 'idle' | 'unknown';

export class StatusDetector {
  private status: SessionStatus = 'running';
  private turnActive = false;
  private attentionSentForState = false;

  constructor(private readonly onUpdate: (update: StatusUpdate) => void) {}

  adoptStatus(status: SessionStatus): void {
    this.status = status;
    if (status !== 'running') this.turnActive = false;
    this.attentionSentForState = status !== 'running';
  }

  onInput(data: string): void {
    const submitted = isSubmissionInput(data);
    const decision = this.status === 'approval' && isApprovalDecisionInput(data);
    if (submitted || decision) {
      if (this.status !== 'approval' || this.turnActive) this.turnActive = true;
      this.emit('running', false);
      return;
    }
    if (this.status === 'completed' && containsPrintableText(data)) {
      this.emit('waiting', false);
    }
  }

  onScreen(screen: string, settled: boolean): void {
    const state = classifyScreen(screen);
    if (state === 'approval') {
      this.emit('approval', true);
      return;
    }
    if (state === 'waiting') {
      this.emit('waiting', true);
      return;
    }
    if (state === 'running') {
      this.turnActive = true;
      this.emit('running', false);
      return;
    }
    if (state !== 'idle' || !settled) return;
    if (this.turnActive) {
      this.turnActive = false;
      this.emit('completed', true);
    } else if (this.status !== 'completed') {
      this.emit('waiting', false);
    }
  }

  onSignal(screen: string, detail?: string): void {
    const state = classifyScreen(screen);
    if (state === 'approval') {
      this.emit('approval', true, detail);
      return;
    }
    if (state === 'waiting') {
      this.emit('waiting', true, detail);
      return;
    }
    if (this.turnActive) {
      this.turnActive = false;
      this.emit('completed', true, detail);
    }
  }

  currentStatus(): SessionStatus {
    return this.status;
  }

  private emit(status: SessionStatus, attention: boolean, detail?: string): void {
    const changed = this.status !== status;
    if (changed) {
      this.status = status;
      this.attentionSentForState = false;
    }
    const shouldSendAttention = attention && !this.attentionSentForState;
    if (!changed && !shouldSendAttention) return;
    if (shouldSendAttention) this.attentionSentForState = true;
    this.onUpdate({ status, attention: shouldSendAttention, detail });
  }
}

export function classifyScreen(screen: string): ScreenState {
  const normalized = screen.replace(/\u00a0/g, ' ');
  if (
    /Would you like to (?:run|grant|allow|make|approve)/i.test(normalized) ||
    /Do you want to (?:approve|allow|continue|proceed)/i.test(normalized) ||
    /Do you trust the contents of this directory/i.test(normalized) ||
    /Press enter to confirm or esc to cancel/i.test(normalized) ||
    /Yes, (?:proceed|grant|just this once)/i.test(normalized)
  ) {
    return 'approval';
  }
  if (
    /Question \d+\/\d+/i.test(normalized) ||
    /\d+ unanswered/i.test(normalized) ||
    /enter to submit answer/i.test(normalized) ||
    /Type your answer(?: \(optional\))?/i.test(normalized) ||
    /Plan mode prompt:/i.test(normalized) ||
    /Waiting for (?:your )?(?:input|answer|response)/i.test(normalized) ||
    /Press enter to continue/i.test(normalized) ||
    /Press enter to confirm or esc to go back/i.test(normalized)
  ) {
    return 'waiting';
  }
  if (
    /esc to interrupt/i.test(normalized) ||
    /[•●◦]\s+(?:Working|Thinking|Running|Reading|Searching|Editing|Reviewing|Planning|Analyzing|Executing)\b/i.test(
      normalized
    )
  ) {
    return 'running';
  }
  if (
    /(?:Type|Enter) (?:a |your )?(?:message|prompt)(?: to continue)?/i.test(normalized) ||
    /\bReady\b.*\bContext\s+\d+%\s+left/i.test(normalized) ||
    /^\s*›\s+\S.+$/m.test(normalized) ||
    /^\s*›\s*$/m.test(normalized) ||
    /\? for shortcuts\s+\d+% context left/i.test(normalized)
  ) {
    return 'idle';
  }
  return 'unknown';
}

function containsPrintableText(data: string): boolean {
  return [...data].some((character) => character >= ' ' && character !== '\u007f');
}
