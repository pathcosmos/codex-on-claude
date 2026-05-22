type Handler = (payload: unknown) => void;

const listeners = new Map<string, Handler[]>();

export function subscribe(topic: string, handler: Handler) {
  const list = listeners.get(topic) || [];
  list.push(handler);
  listeners.set(topic, list);
  return () => {
    list.filter(h => h !== handler);
  };
}

export function publish(topic: string, payload: unknown) {
  const list = listeners.get(topic) || [];
  for (const handler of list) {
    handler(payload);
  }
}

export function listenerCount(topic: string) {
  return (listeners.get(topic) || []).length;
}