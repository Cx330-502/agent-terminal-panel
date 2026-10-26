const BRACKETED_PASTE = /\u001b\[200~[\s\S]*?\u001b\[201~/gu;
/** Meta+Enter; Claude Code inserts a newline in its composer instead of submitting. */
export const META_ENTER = '\u001b\r';

export function isSubmissionInput(data: string): boolean {
  const commands = data.replace(BRACKETED_PASTE, '').replaceAll(META_ENTER, '');
  return commands.includes('\r') || commands.includes('\n');
}

export function isApprovalDecisionInput(data: string): boolean {
  const commands = data.replace(BRACKETED_PASTE, '').trimStart();
  return /^[yYnNaAdDrRpP]/u.test(commands);
}
