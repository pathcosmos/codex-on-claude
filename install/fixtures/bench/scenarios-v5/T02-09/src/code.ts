// Feature flag
export function isEnabled(flag: string, ctx: any): boolean {
  try {
    // BUG (default_returned_on_error): on error returns false BUT some flags need to default-on for safety
    const result = evaluate(flag, ctx);
    return result;
  } catch (e) {
    return false;
  }
}
function evaluate(_f: string, _c: any) { throw new Error('not impl'); }
