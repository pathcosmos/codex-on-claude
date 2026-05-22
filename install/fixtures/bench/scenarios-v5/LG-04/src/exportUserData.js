import db from './db.js';
import { uploadJson } from './s3.js';

export async function exportUserData(req, res) {
  const userId = req.params.userId;
  const requester = req.user;
  if (!requester) return res.status(401).send('login required');

  const user = await db.users.findById(userId);
  const orders = await db.orders.find({ user_id: userId });
  const support = await db.supportTickets.find({ email: user.email });
  const audit = await db.auditLogs.find({ actor_id: userId });

  const bundle = { user, orders, support, audit, generatedAt: new Date().toISOString() };
  const url = await uploadJson(`exports/${userId}.json`, bundle, { publicRead: true });
  await db.exportEvents.insert({ userId, requesterId: requester.id, url });
  res.json({ url });
}