/**
 * 兼容复制：优先 Clipboard API，失败则回退 textarea + execCommand。
 * 覆盖 HTTP / iframe / 权限拒绝等场景，尽量保证能复制成功。
 */
export async function copyText(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  if (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // 继续走回退
    }
  }

  return copyTextFallback(value);
}

function copyTextFallback(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'readonly');
  // iOS / 部分 WebView 需要可见可选中区域
  ta.style.cssText =
    'position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:0;outline:0;box-shadow:none;background:transparent;opacity:0;z-index:-1;';
  document.body.appendChild(ta);

  const selection = document.getSelection();
  const previous =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }

  document.body.removeChild(ta);

  if (previous && selection) {
    selection.removeAllRanges();
    try {
      selection.addRange(previous);
    } catch {
      // ignore
    }
  }

  return ok;
}
