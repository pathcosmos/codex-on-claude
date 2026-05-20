// HTTP handler. Validates inputs, delegates to service.
import { fetchOrder } from "./service.js";

export async function handler(req, res) {
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "missing id" });
  try {
    const order = await fetchOrder(id);
    res.json(order);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
