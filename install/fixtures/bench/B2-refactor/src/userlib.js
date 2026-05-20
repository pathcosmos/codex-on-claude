// Tiny user library — single export is the function that should be renamed.
export function getUser(id) {
  return { id, name: "user-" + id };
}
