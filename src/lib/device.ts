/** Rough device class, used to pick settings that will not exhaust a phone's memory. */
export function isLowMemoryDevice(): boolean {
  const nav = globalThis.navigator as
    | (Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } })
    | undefined;
  if (!nav) return false;
  const mobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  return mobile || lowMemory;
}
