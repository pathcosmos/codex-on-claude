// Business logic. Calls repository, applies business rules.
import { loadOrder } from "./repository.js";

export async function fetchOrder(id) {
  const o = await loadOrder(id);
  if (o.status === "deleted") throw new Error("order deleted");
  return { id: o.id, total: o.amount * 1.1 };
}
