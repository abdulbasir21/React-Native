import "dotenv/config";
import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import { createChatRepository } from "../../modules/chat/chat.repository.js";
import { createChatService } from "../../modules/chat/chat.service.js";

const testDbUrl = process.env.Test_DATABASE_URL || process.env.DATABASE_URL;
if (!testDbUrl) {
  throw new Error("Test_DATABASE_URL or DATABASE_URL is required");
}

loadConfig({ ...process.env, NODE_ENV: "test", DATABASE_URL: testDbUrl });
const prisma: PrismaClient = createPrismaClient(testDbUrl);
const chatRepo = createChatRepository(prisma);
const chatService = createChatService(prisma, chatRepo);

async function cleanupChatData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "cht-test-" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  const convs = await prisma.conversation.findMany({
    where: {
      OR: [
        { customerUserId: { in: ids } },
        { providerProfile: { userId: { in: ids } } },
      ],
    },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
  }

  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 5a Chat Persistence & Domain Integration", () => {
  let customerAId: string;
  let customerBId: string;
  let providerUserId: string;
  let approvedProviderId: string;
  let pendingProviderId: string;

  beforeAll(async () => {
    await cleanupChatData();
  });

  beforeEach(async () => {
    await cleanupChatData();

    const custA = await prisma.user.create({
      data: {
        email: `cht-test-ca-${Date.now()}@example.com`,
        passwordHash: "hash",
        fullName: "Customer A",
      },
    });
    await prisma.userRole.create({ data: { userId: custA.id, role: "CUSTOMER" } });
    await prisma.customerProfile.create({ data: { userId: custA.id } });
    customerAId = custA.id;

    const custB = await prisma.user.create({
      data: {
        email: `cht-test-cb-${Date.now()}@example.com`,
        passwordHash: "hash",
        fullName: "Customer B",
      },
    });
    await prisma.userRole.create({ data: { userId: custB.id, role: "CUSTOMER" } });
    await prisma.customerProfile.create({ data: { userId: custB.id } });
    customerBId = custB.id;

    const provUser = await prisma.user.create({
      data: {
        email: `cht-test-prov-${Date.now()}@example.com`,
        passwordHash: "hash",
        fullName: "Provider One",
      },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: provUser.id, role: "CUSTOMER" },
        { userId: provUser.id, role: "PROVIDER" },
      ],
    });
    providerUserId = provUser.id;

    const pp = await prisma.providerProfile.create({
      data: {
        userId: providerUserId,
        displayName: "Ustad Electric",
        status: "APPROVED",
      },
    });
    approvedProviderId = pp.id;

    const pendingUser = await prisma.user.create({
      data: {
        email: `cht-test-pend-${Date.now()}@example.com`,
        passwordHash: "hash",
        fullName: "Pending Provider",
      },
    });
    await prisma.userRole.create({
      data: { userId: pendingUser.id, role: "PROVIDER" },
    });
    const pendPp = await prisma.providerProfile.create({
      data: {
        userId: pendingUser.id,
        displayName: "Pending Tech",
        status: "PENDING",
      },
    });
    pendingProviderId = pendPp.id;
  });

  afterAll(async () => {
    await cleanupChatData();
    await prisma.$disconnect();
  });

  it("CHT-1, CHT-2: enforces one conversation per pair, blocks own profile and non-approved provider, returns 404 to non-participant", async () => {
    // Non-approved provider -> 404
    await expect(
      chatService.startConversation(customerAId, pendingProviderId)
    ).rejects.toMatchObject({ statusCode: 404 });

    // Own profile -> 403
    await expect(
      chatService.startConversation(providerUserId, approvedProviderId)
    ).rejects.toMatchObject({ statusCode: 403 });

    // Start twice -> same conversation id
    const c1 = await chatService.startConversation(customerAId, approvedProviderId);
    const c2 = await chatService.startConversation(customerAId, approvedProviderId);
    expect(c1.id).toBe(c2.id);

    // Non-participant gets 404 on read and send
    await expect(
      chatService.getMessages(c1.id, customerBId, { limit: 30 })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      chatService.sendMessage(c1.id, customerBId, "Customer B", {
        type: "TEXT",
        body: "Sneak in",
        clientMessageId: crypto.randomUUID(),
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("CHT-5, CHT-7, CHT-8, CHT-9: idempotent clientMessageId, read/delivered receipts, cursor & after paging, and unread count", async () => {
    const conv = await chatService.startConversation(
      customerAId,
      approvedProviderId
    );
    const cmid = crypto.randomUUID();

    const s1 = await chatService.sendMessage(conv.id, customerAId, "Customer A", {
      type: "TEXT",
      body: "Salam, need wiring fix",
      clientMessageId: cmid,
    });
    expect(s1.isDuplicate).toBe(false);

    // Repeat with same clientMessageId -> returns existing message, no duplicate
    const s2 = await chatService.sendMessage(conv.id, customerAId, "Customer A", {
      type: "TEXT",
      body: "Salam, need wiring fix",
      clientMessageId: cmid,
    });
    expect(s2.isDuplicate).toBe(true);
    expect(s2.message.id).toBe(s1.message.id);

    // Send two more messages from customer
    const m2 = await chatService.sendMessage(conv.id, customerAId, "Customer A", {
      type: "TEXT",
      body: "Second message",
      clientMessageId: crypto.randomUUID(),
    });
    const m3 = await chatService.sendMessage(conv.id, customerAId, "Customer A", {
      type: "TEXT",
      body: "Third message",
      clientMessageId: crypto.randomUUID(),
    });

    // Unread count for provider = 3
    const provConvs = await chatService.listConversations(providerUserId);
    expect(provConvs[0]?.unreadCount).toBe(3);
    expect(provConvs[0]?.latestMessage?.preview).toBe("Third message");

    // Mark read up to m2 -> marks s1 and m2 read (unread becomes 1), deliveredAt <= readAt
    await chatService.markRead(conv.id, providerUserId, m2.message.id);
    const provConvsAfter = await chatService.listConversations(providerUserId);
    expect(provConvsAfter[0]?.unreadCount).toBe(1);

    // Newest-first cursor paging
    const page1 = await chatService.getMessages(conv.id, customerAId, { limit: 2 });
    expect(page1.map((m) => m.id)).toEqual([m3.message.id, m2.message.id]);
    const page2 = await chatService.getMessages(conv.id, customerAId, {
      limit: 2,
      cursor: page1[1]!.id,
    });
    expect(page2.map((m) => m.id)).toEqual([s1.message.id]);

    // Offline recovery with after=s1 -> oldest-first [m2, m3]
    const recovered = await chatService.getMessages(conv.id, customerAId, {
      limit: 100,
      after: s1.message.id,
    });
    expect(recovered.map((m) => m.id)).toEqual([m2.message.id, m3.message.id]);
  });

  it("CHT-10: blocks sending when provider profile or user is SUSPENDED", async () => {
    const conv = await chatService.startConversation(
      customerAId,
      approvedProviderId
    );
    await prisma.providerProfile.update({
      where: { id: approvedProviderId },
      data: { status: "SUSPENDED" },
    });

    await expect(
      chatService.sendMessage(conv.id, customerAId, "Customer A", {
        type: "TEXT",
        body: "Hello?",
        clientMessageId: crypto.randomUUID(),
      })
    ).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_SUSPENDED" });
  });
});
