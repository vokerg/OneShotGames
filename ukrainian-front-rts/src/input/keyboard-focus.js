/** Keep gameplay shortcuts out of text fields, native controls and consumed events. */
export function shouldIgnoreBattlefieldKey(event) {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.altKey) return true;
  const target = event.target;
  if (target?.isContentEditable) return true;
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(target?.tagName ?? '').toUpperCase()) ||
    (String(target?.tagName ?? '').toUpperCase() === 'BUTTON' && (!event.key || [' ', 'Spacebar', 'Enter'].includes(event.key)));
}
