/**
 * Model text → JSON text. Models routinely wrap structured output in a
 * markdown code fence even when the prompt forbids it (live-fire: every
 * LeadAgent qualification failed on ```json fencing). Deterministic on
 * purpose: strips exactly one outer fence when the WHOLE text is fenced,
 * nothing else — no prose extraction, no repair.
 */
export function extractJsonText(raw: string): string {
  const fenced = raw.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  return (fenced ? fenced[1] : raw).trim();
}
