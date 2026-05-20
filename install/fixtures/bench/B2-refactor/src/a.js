import { getUser } from "./userlib.js";

export function greet(id) {
  const u = getUser(id);
  return `hi ${u.name}`;
}
