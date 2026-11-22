/**
 * Put `text` on the clipboard, on every webview Skrin runs in. The async API
 * first (it needs no selection and leaves focus alone); where a webview refuses
 * it, a selected off-screen field and `execCommand('copy')`, which none refuse.
 * Returns whether either worked. Focus goes back to where it was, so a ring
 * that was on the Copy button stays there.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused: fall through to the selection route.
  }
  const before = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    before?.focus?.({ preventScroll: true });
  }
}
