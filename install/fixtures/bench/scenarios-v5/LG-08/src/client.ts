export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export async function getOrder(id: string) {
  const res = await fetch(`/orders/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`order lookup failed: ${res.status}`);
  const body = await res.json();
  return {
    id: body.id,
    status: body.status as OrderStatus,
    totalDollars: body.total / 100,
    createdAt: new Date(body.createdAt)
  };
}