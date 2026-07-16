const BRACKETED_PASTE = /\u001b\[200~[\s\S]*?\u001b\[201~/gu;

export function isSubmissionInput(data: string): boolean {
  const commands = data.replace(BRACKETED_PASTE, '');
  return commands.includes('\r') || commands.includes('\n');
}

export function isApprovalDecisionInput(data: string): boolean {
  const commands = data.replace(BRACKETED_PASTE, '').trimStart();
  return /^[yYnNaAdDrRpP]/u.test(commands);
}
