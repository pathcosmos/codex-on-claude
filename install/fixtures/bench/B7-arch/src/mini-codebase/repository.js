// Data access. NOTE: retry logic currently lives here as an inline loop.
// The question for B7: should it live here, or in client.js (transport),
// or in service.js (use-case orchestration)?
import { httpGet } from "./client.js";

export async function loadOrder(id) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await httpGet(`/orders/${id}`);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
  throw lastErr;
}
