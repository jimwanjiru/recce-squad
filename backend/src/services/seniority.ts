// Ordering only: never derives or overwrites a recorded rank from an identifier.
export function compareSeniority(
  a: { id: string; forceNumber: string },
  b: { id: string; forceNumber: string },
  coForceNumber = process.env.CO_FORCE_NUMBER || "",
) {
  const ac = !!coForceNumber && a.forceNumber === coForceNumber,
    bc = !!coForceNumber && b.forceNumber === coForceNumber;
  if (ac !== bc) return ac ? -1 : 1;
  const an = /^\d+$/.test(a.forceNumber),
    bn = /^\d+$/.test(b.forceNumber);
  if (an && bn) {
    const x = BigInt(a.forceNumber),
      y = BigInt(b.forceNumber);
    if (x !== y) return x < y ? -1 : 1;
  } else if (an !== bn) return an ? -1 : 1;
  return a.forceNumber.localeCompare(b.forceNumber) || a.id.localeCompare(b.id);
}
