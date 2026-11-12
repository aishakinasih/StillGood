import { prisma } from "../lib/prisma.js";

export async function notifyUser(userId, type, message, orderId = null) {
  if (!userId) return null;
  return prisma.notification.create({
    data: { user_id: userId, order_id: orderId, type, message },
  });
}

export async function notifyOrderParties(order, type, message) {
  const store = await prisma.store.findUnique({ where: { id: order.store_id }, select: { owner_id: true } });
  const targets = [order.buyer_id, store?.owner_id].filter(Boolean);
  return Promise.all(targets.map((userId) => notifyUser(userId, type, message, order.id)));
}
