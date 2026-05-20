import { getUser } from "./userlib.js";

export async function whoami(req) {
  return getUser(req.userId);
}
