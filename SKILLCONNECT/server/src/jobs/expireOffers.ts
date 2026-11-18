import type { PrismaClient } from "../generated/prisma/index.js";
import { createNotification } from "../modules/notifications/notifications.service.js";

/**
 * Idempotent job marking PENDING offers past expiresAt as EXPIRED.
 */
export async function runExpireOffersJob(
  prisma: PrismaClient,
  nowUtc: Date = new Date()
): Promise<number> {
  const expired = await prisma.serviceOffer.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: nowUtc },
    },
    include: {
      providerProfile: { select: { userId: true } },
    },
  });

  let count = 0;
  for (const offer of expired) {
    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.serviceOffer.updateMany({
        where: { id: offer.id, status: "PENDING" },
        data: { status: "EXPIRED", respondedAt: nowUtc },
      });
      if (res.count === 0) return false;

      await createNotification(tx, {
        userId: offer.customerUserId,
        type: "OFFER_EXPIRED",
        title: "Offer expired",
        body: `Offer for ${offer.serviceName} has expired.`,
        data: { conversationId: offer.conversationId, offerId: offer.id },
      });
      await createNotification(tx, {
        userId: offer.providerProfile.userId,
        type: "OFFER_EXPIRED",
        title: "Offer expired",
        body: `Your offer for ${offer.serviceName} has expired.`,
        data: { conversationId: offer.conversationId, offerId: offer.id },
      });
      return true;
    });
    if (updated) count++;
  }

  return count;
}
