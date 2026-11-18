import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import request from "supertest";
import type { Server } from "socket.io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import { createChatRepository } from "../../modules/chat/chat.repository.js";
import { createChatService } from "../../modules/chat/chat.service.js";
import { attachChatSocketServer } from "../../sockets/chat.socket.js";

const testDbUrl = process.env.Test_DATABASE_URL || process.env.DATABASE_URL;
if (!testDbUrl) {
  throw new Error("Test_DATABASE_URL or DATABASE_URL is required");
}

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testDbUrl,
});

const prisma: PrismaClient = createPrismaClient(testDbUrl);

async function cleanupSocketTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "sock-test-" } },
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
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 5b REST + Socket.IO Real-time Chat", () => {
  let httpServer: http.Server;
  let ioServer: Server | null = null;
  let baseUrl: string;
  let app: ReturnType<typeof createApp>;

  let customerToken: string;
  let customerUserId: string;
  let providerToken: string;
  let outsiderToken: string;
  let providerProfileId: string;
  let conversationId: string;

  beforeAll(async () => {
    await cleanupSocketTestData();

    app = createApp({
      config,
      prisma,
      checkDatabase: async () => true,
      getIo: () => ioServer,
    });

    httpServer = http.createServer(app);
    const chatRepo = createChatRepository(prisma);
    const chatService = createChatService(prisma, chatRepo);
    ioServer = attachChatSocketServer(httpServer, {
      config,
      prisma,
      chatRepo,
      chatService,
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const cRes = await request(app).post("/api/v1/auth/register").send({
      email: `sock-test-c-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Socket Customer",
    });
    customerToken = cRes.body.data.accessToken;
    customerUserId = cRes.body.data.user.id;

    const pRes = await request(app).post("/api/v1/auth/register").send({
      email: `sock-test-p-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Socket Provider",
    });
    providerToken = pRes.body.data.accessToken;
    const providerUserId = pRes.body.data.user.id as string;
    await prisma.userRole.create({
      data: { userId: providerUserId, role: "PROVIDER" },
    });
    const pp = await prisma.providerProfile.create({
      data: {
        userId: providerUserId,
        displayName: "Socket Electrician",
        status: "APPROVED",
      },
    });
    providerProfileId = pp.id;

    const oRes = await request(app).post("/api/v1/auth/register").send({
      email: `sock-test-o-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Socket Outsider",
    });
    outsiderToken = oRes.body.data.accessToken;

    const convRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ providerProfileId });
    expect(convRes.status).toBe(200);
    conversationId = convRes.body.data.conversation.id;
  });

  afterAll(async () => {
    ioServer?.close();
    httpServer?.close();
    await cleanupSocketTestData();
    await prisma.$disconnect();
  });

  it("CHT-11: rejects invalid or expired access tokens on socket handshake", async () => {
    const expired = jwt.sign(
      { sub: customerUserId },
      config.JWT_ACCESS_SECRET,
      { expiresIn: -10 }
    );

    const connectAttempt = (token: string) =>
      new Promise<void>((resolve, reject) => {
        const s = ioClient(baseUrl, {
          auth: { token },
          transports: ["websocket"],
          reconnection: false,
        });
        s.on("connect", () => {
          s.disconnect();
          reject(new Error("Should not have connected"));
        });
        s.on("connect_error", () => {
          s.disconnect();
          resolve();
        });
      });

    await connectAttempt("invalid.jwt.token");
    await connectAttempt(expired);
  });

  it("CHT-3, CHT-6, CHT-11: enforces participant room checks, rejects client OFFER via REST, persists before emit, and delivers in real time", async () => {
    // CHT-3: REST rejects client OFFER message
    const badType = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        type: "OFFER",
        body: "Fake offer",
        clientMessageId: crypto.randomUUID(),
      });
    expect(badType.status).toBe(422);

    const connectClient = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = ioClient(baseUrl, {
          auth: { token },
          transports: ["websocket"],
          reconnection: false,
        });
        s.on("connect", () => resolve(s));
        s.on("connect_error", reject);
      });

    const custSocket = await connectClient(customerToken);
    const provSocket = await connectClient(providerToken);
    const outSocket = await connectClient(outsiderToken);

    try {
      // Outsider cannot join room
      const outJoin = await new Promise<{ ok: boolean; error?: string }>(
        (resolve) => {
          outSocket.emit("conversation:join", { conversationId }, resolve);
        }
      );
      expect(outJoin.ok).toBe(false);

      // Participants join
      const [cJoin, pJoin] = await Promise.all([
        new Promise<{ ok: boolean }>((resolve) =>
          custSocket.emit("conversation:join", { conversationId }, resolve)
        ),
        new Promise<{ ok: boolean }>((resolve) =>
          provSocket.emit("conversation:join", { conversationId }, resolve)
        ),
      ]);
      expect(cJoin.ok).toBe(true);
      expect(pJoin.ok).toBe(true);

      // Provider listens for message:new
      const receivedPromise = new Promise<{ message: { id: string; body: string } }>(
        (resolve) => {
          provSocket.once("message:new", resolve);
        }
      );

      // Customer sends via REST -> persisted in DB and emitted to room
      const cmid = crypto.randomUUID();
      const sendRes = await request(app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          type: "TEXT",
          body: "Salam, can you come tomorrow?",
          clientMessageId: cmid,
        });
      expect(sendRes.status).toBe(201);

      const received = await receivedPromise;
      expect(received.message.id).toBe(sendRes.body.data.message.id);
      expect(received.message.body).toBe("Salam, can you come tomorrow?");
    } finally {
      custSocket.disconnect();
      provSocket.disconnect();
      outSocket.disconnect();
    }
  });
});
