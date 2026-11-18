import crypto from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import {
  aiChatAssistOutputSchema,
  aiStructureOfferOutputSchema,
  aiUnderstandOutputSchema,
  type AiChatAssistInput,
  type AiChatAssistOutputDto,
  type AiStructureOfferInput,
  type AiStructureOfferOutputDto,
  type AiUnderstandOutputDto,
  type AiUnderstandRequestInput,
} from "@skillconnect/shared";
import type { AppConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";

export type GeminiJsonGenerator = (
  prompt: string,
  responseJsonSchema: Record<string, unknown>
) => Promise<string>;

const CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CALLS_PER_HOUR = 30;

export function createAiService(
  prisma: PrismaClient,
  config: AppConfig,
  customGenerator?: GeminiJsonGenerator,
  maxCallsPerHour: number = DEFAULT_MAX_CALLS_PER_HOUR
) {
  const understandCache = new Map<
    string,
    { expiresAt: number; value: AiUnderstandOutputDto }
  >();
  const userCallTimestamps = new Map<string, number[]>();

  const enforceUserRateLimit = (userId: string) => {
    const now = Date.now();
    const prev = (userCallTimestamps.get(userId) ?? []).filter(
      (t) => now - t < RATE_WINDOW_MS
    );
    if (prev.length >= maxCallsPerHour) {
      throw new AppError(
        429,
        "AI_RATE_LIMIT_EXCEEDED",
        "Hourly AI assistance limit reached. Please try again later."
      );
    }
    prev.push(now);
    userCallTimestamps.set(userId, prev);
  };

  const generateJson: GeminiJsonGenerator = async (prompt, schema) => {
    if (customGenerator) {
      return customGenerator(prompt, schema);
    }
    if (!config.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
    }
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
    return response.text ?? "";
  };

  /**
   * R2-1: Understands a customer's problem description and suggests a category + missing details.
   * Falls back cleanly to keyword matching if AI is unavailable, quota-limited, or returns invalid JSON.
   */
  const understandServiceRequest = async (
    userId: string,
    input: AiUnderstandRequestInput
  ): Promise<AiUnderstandOutputDto> => {
    const cacheKey = crypto
      .createHash("sha256")
      .update(input.problemText.toLowerCase())
      .digest("hex");
    const cached = understandCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    enforceUserRateLimit(userId);

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    const fallbackMatch = (): AiUnderstandOutputDto => {
      const lower = input.problemText.toLowerCase();
      const matched = categories.find(
        (c) =>
          lower.includes(c.name.toLowerCase()) ||
          lower.includes(c.slug.toLowerCase())
      );
      const words = lower
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 4);
      return {
        suggestedCategorySlug: matched?.slug ?? null,
        suggestedCategoryName: matched?.name ?? null,
        searchKeywords: words,
        missingDetailsPrompts: [
          "What exact issue or symptom are you noticing?",
          "When would you like a technician to visit?",
        ],
        uncertaintyNote:
          "AI suggestions are unavailable right now; showing keyword-based fallback.",
        fallbackUsed: true,
      };
    };

    try {
      const catList = categories.map((c) => `${c.slug}: ${c.name}`).join(", ");
      const prompt = [
        "You help customers on a local home-services marketplace categorize their problem.",
        `Available categories (slug: name): ${catList}.`,
        "Never invent facts or guarantee diagnosis. Pick the closest category slug from the list or null if unsure.",
        `Customer description: "${input.problemText}"`,
      ].join("\n");

      const raw = await generateJson(prompt, {
        type: Type.OBJECT,
        properties: {
          suggestedCategorySlug: { type: Type.STRING, nullable: true },
          suggestedCategoryName: { type: Type.STRING, nullable: true },
          searchKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingDetailsPrompts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          uncertaintyNote: { type: Type.STRING },
        },
        required: [
          "suggestedCategorySlug",
          "suggestedCategoryName",
          "searchKeywords",
          "missingDetailsPrompts",
          "uncertaintyNote",
        ],
      });

      const parsed = aiUnderstandOutputSchema.safeParse({
        ...JSON.parse(raw),
        fallbackUsed: false,
      });

      if (!parsed.success) {
        return fallbackMatch();
      }

      const validCat = categories.find(
        (c) => c.slug === parsed.data.suggestedCategorySlug
      );
      const normalized: AiUnderstandOutputDto = {
        ...parsed.data,
        suggestedCategorySlug: validCat ? validCat.slug : null,
        suggestedCategoryName: validCat ? validCat.name : null,
        fallbackUsed: false,
      };

      understandCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: normalized,
      });
      return normalized;
    } catch {
      return fallbackMatch();
    }
  };

  /**
   * R2-2: Structures a provider's natural-language offer text into editable fields.
   * Never invents price, date, time, or terms; missing fields stay null.
   */
  const structureOffer = async (
    userId: string,
    input: AiStructureOfferInput
  ): Promise<AiStructureOfferOutputDto> => {
    enforceUserRateLimit(userId);

    const emptyResult: AiStructureOfferOutputDto = {
      serviceName: null,
      description: null,
      pricePkr: null,
      proposedStartIso: null,
      terms: null,
    };

    try {
      const prompt = [
        "Extract structured service offer fields from the provider's message.",
        "CRITICAL: Never invent or guess price, date/time, or terms. If not explicitly stated, return null for that field.",
        `Current UTC time: ${new Date().toISOString()}.`,
        `Provider text: "${input.rawText}"`,
      ].join("\n");

      const raw = await generateJson(prompt, {
        type: Type.OBJECT,
        properties: {
          serviceName: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
          pricePkr: { type: Type.INTEGER, nullable: true },
          proposedStartIso: { type: Type.STRING, nullable: true },
          terms: { type: Type.STRING, nullable: true },
        },
        required: [
          "serviceName",
          "description",
          "pricePkr",
          "proposedStartIso",
          "terms",
        ],
      });

      const parsed = aiStructureOfferOutputSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        return emptyResult;
      }
      return parsed.data;
    } catch {
      return emptyResult;
    }
  };

  /**
   * R2-3: Optional, user-triggered chat assistance for conversation participants.
   */
  const assistChat = async (
    userId: string,
    conversationId: string,
    input: AiChatAssistInput
  ): Promise<AiChatAssistOutputDto> => {
    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!participant) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }

    enforceUserRateLimit(userId);

    const messages = await prisma.message.findMany({
      where: { conversationId, type: "TEXT" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { body: true, senderId: true },
    });

    const transcript = messages
      .reverse()
      .map((m) => `${m.senderId === userId ? "Me" : "Other"}: ${m.body ?? ""}`)
      .join("\n");

    const fallback: AiChatAssistOutputDto = {
      action: input.action,
      resultText:
        "AI assistance is temporarily unavailable. You can continue chatting normally.",
      bulletPoints: [],
    };

    try {
      const instructionByAction: Record<AiChatAssistInput["action"], string> = {
        summarize: "Summarize the customer's service problem concisely.",
        missing_info:
          "List important missing details needed before quoting a price or visiting.",
        clarify:
          "Suggest 2 to 3 polite clarification questions to ask in chat.",
        simplify: `Rewrite the following message in simpler, clearer language: "${input.messageText ?? ""}"`,
        translate: `Translate the following message into ${input.targetLanguage ?? "Urdu"}: "${input.messageText ?? ""}"`,
      };

      const prompt = [
        instructionByAction[input.action],
        "Do not invent facts not present in the messages.",
        transcript ? `Recent conversation:\n${transcript}` : "",
      ].join("\n");

      const raw = await generateJson(prompt, {
        type: Type.OBJECT,
        properties: {
          resultText: { type: Type.STRING },
          bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["resultText", "bulletPoints"],
      });

      const parsed = aiChatAssistOutputSchema.safeParse({
        action: input.action,
        ...JSON.parse(raw),
      });
      if (!parsed.success) {
        return fallback;
      }
      return parsed.data;
    } catch {
      return fallback;
    }
  };

  return {
    understandServiceRequest,
    structureOffer,
    assistChat,
  };
}
