/** Back-up buyer waitlist (キャンセル待ち). Pure helpers — no Firestore, no React. */
export type Waiter = { account: string; at: string; lineUid?: string; itemIds?: string[] };

/** A row without itemIds is a legacy join: it covers every item on the claim. */
export const waiterCovers = (w: Waiter, itemId: string) => !w.itemIds || w.itemIds.includes(itemId);

/** Back-up accounts for one item, in join order. */
export const waitersFor = (waiters: Waiter[] | undefined, itemId: string) =>
  (waiters || []).filter((w) => waiterCovers(w, itemId));

export type Promotion = {
  winner: Waiter;
  /** Items the winner takes: the free items they queued for. */
  itemIds: string[];
  /** Remaining back-ups that queued for those items; they carry over to the new booking, order kept. */
  moved: Waiter[];
  /** Everyone else stays on the cancelled claim. */
  left: Waiter[];
};

/**
 * Next back-up for a cancelled claim: first in line who queued for at least one item that is free.
 * `free` = item ids on the claim no booked/picked-up claim holds. Null when nobody can be promoted.
 */
export function planPromotion(
  claim: { itemIds: string[]; waiters?: Waiter[] }, free: string[],
): Promotion | null {
  const rows = claim.waiters || [];
  const freeSet = new Set(free.filter((id) => claim.itemIds.includes(id)));
  for (let i = 0; i < rows.length; i++) {
    const w = rows[i];
    const itemIds = [...freeSet].filter((id) => waiterCovers(w, id));
    if (!itemIds.length) continue;
    const rest = rows.filter((_, j) => j !== i);
    const moved: Waiter[] = [];
    const left: Waiter[] = [];
    for (const r of rest) {
      const mine = itemIds.filter((id) => waiterCovers(r, id));
      if (mine.length) moved.push({ ...r, itemIds: mine });
      else left.push(r);
    }
    return { winner: w, itemIds, moved, left };
  }
  return null;
}
