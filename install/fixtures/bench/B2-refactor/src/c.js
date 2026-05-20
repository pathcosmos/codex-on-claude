import { getUser } from "./userlib.js";

export function format(id) {
  const u = getUser(id);
  return JSON.stringify(u);
}
