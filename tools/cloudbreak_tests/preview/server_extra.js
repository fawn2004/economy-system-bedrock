// Extra pieces for the preview run (the real eco code touches more of the API).
const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : any()), apply: () => any(), construct: () => any() });
export const EnchantmentTypes = { get: () => any() };
