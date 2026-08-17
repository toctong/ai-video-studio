/** 去掉把「大纲文档字数」误写成「全文/成书字数」的收尾套话 */
export function scrubOutlineLengthConfusion(raw: string): string {
  let text = String(raw || '');
  const junkLine =
    /^(?:全文|本稿|本文|大纲(?:全文|文档)?)\s*约?\s*[\d,，.]+?\s*字[，。,.！!]*(?:符合[^。\n]*)?[。.]?\s*$/gm;
  text = text.replace(junkLine, '');
  text = text.replace(
    /\n*(?:以上)?(?:大纲)?(?:全文|本稿)?约\s*[\d,，.]+\s*字[，。,.]*\s*(?:符合(?:长线)?连载大纲要求)?[。.]?\s*$/g,
    '',
  );
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
