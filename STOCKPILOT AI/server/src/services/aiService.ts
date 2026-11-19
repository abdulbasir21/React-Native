import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Prisma } from '@prisma/client';
import { getEnv } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import { periodBounds } from '../shared/calculations.js';
import { AI_READ_TOOL_NAMES, AI_WRITE_TOOL_NAMES, executeAiTool } from './aiTools.js';

export interface AIStructuredAnswer {
  reply: string;
  actualFigures: Record<string, string>;
  estimates: Record<string, string>;
  suggestions: string[];
  pendingActions: Array<{
    id: string;
    toolName: string;
    summary: string;
    requiresStrongConfirm: boolean;
    strongConfirmTarget: string | null;
    expiresAt: string;
    status: string;
  }>;
  toolCallsExecuted: string[];
}

export interface ModelTurnToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ModelTurnOutput {
  functionCalls?: ModelTurnToolCall[];
  text?: string;
}

export type AIModelRunner = (input: {
  messages: Array<{ role: 'user' | 'model' | 'tool'; content: string }>;
}) => Promise<ModelTurnOutput>;

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'searchProducts',
    description: 'Search shop products by name or SKU',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING },
        includeArchived: { type: Type.BOOLEAN },
      },
      required: ['query'],
    },
  },
  {
    name: 'getInventory',
    description: 'Get total inventory valuation and stock counts',
  },
  {
    name: 'getProductDetails',
    description: 'Get details for a specific product by productId or name',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING },
        name: { type: Type.STRING },
      },
    },
  },
  {
    name: 'getSalesReport',
    description: 'Get sales revenue, COGS, and gross profit for a period',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: { type: Type.STRING },
        from: { type: Type.STRING },
        to: { type: Type.STRING },
      },
    },
  },
  {
    name: 'getProfitReport',
    description: 'Get profit, operating expenses, cash received, and write-offs',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: { type: Type.STRING },
        from: { type: Type.STRING },
        to: { type: Type.STRING },
      },
    },
  },
  {
    name: 'getExpenseReport',
    description: 'Get operating expenses breakdown by category',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: { type: Type.STRING },
        from: { type: Type.STRING },
        to: { type: Type.STRING },
      },
    },
  },
  {
    name: 'getLowStockProducts',
    description: 'List active products at or below minimum stock level',
  },
  {
    name: 'getSlowMovingProducts',
    description: 'List active products with stock > 0 and no sales in 30 days',
  },
  {
    name: 'getSupplierBalance',
    description: 'Get payable balances owed to suppliers',
    parameters: {
      type: Type.OBJECT,
      properties: {
        supplierId: { type: Type.STRING },
        name: { type: Type.STRING },
      },
    },
  },
  {
    name: 'createProduct',
    description: 'Propose creating a new product (requires owner confirmation)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        unit: { type: Type.STRING },
        purchaseCost: { type: Type.STRING },
        sellingPrice: { type: Type.STRING },
        initialQuantity: { type: Type.STRING },
        minStockLevel: { type: Type.STRING },
      },
      required: ['name', 'purchaseCost', 'sellingPrice'],
    },
  },
  {
    name: 'updateProduct',
    description: 'Propose updating an existing product (requires owner confirmation)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING },
        name: { type: Type.STRING },
        purchaseCost: { type: Type.STRING },
        sellingPrice: { type: Type.STRING },
        minStockLevel: { type: Type.STRING },
      },
      required: ['productId'],
    },
  },
  {
    name: 'recordSale',
    description: 'Propose recording a new sale (requires owner confirmation)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        customerId: { type: Type.STRING },
        paymentMethod: { type: Type.STRING },
        amountReceived: { type: Type.STRING },
        note: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              productId: { type: Type.STRING },
              quantity: { type: Type.STRING },
              unitPrice: { type: Type.STRING },
            },
            required: ['productId', 'quantity'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'recordPurchase',
    description: 'Propose recording a supplier purchase (requires owner confirmation)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        supplierId: { type: Type.STRING },
        amountPaid: { type: Type.STRING },
        paymentMethod: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              productId: { type: Type.STRING },
              quantity: { type: Type.STRING },
              unitCost: { type: Type.STRING },
            },
            required: ['productId', 'quantity', 'unitCost'],
          },
        },
      },
      required: ['supplierId', 'items'],
    },
  },
  {
    name: 'recordExpense',
    description: 'Propose recording an operating expense (requires owner confirmation)',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        category: { type: Type.STRING },
        amount: { type: Type.STRING },
        paymentMethod: { type: Type.STRING },
        description: { type: Type.STRING },
      },
      required: ['title', 'amount'],
    },
  },
];

const SYSTEM_INSTRUCTION = [
  'You are StockPilot AI, a concise retail business assistant.',
  'Allowed read tools:',
  AI_READ_TOOL_NAMES.join(', '),
  'Allowed write-proposal tools (never mutate data directly):',
  AI_WRITE_TOOL_NAMES.join(', '),
  'Rules:',
  '1. Every numeric figure MUST come from a tool result. Never guess or invent numbers.',
  '2. If a product name matches multiple products, ask the owner to choose from the choices returned.',
  '3. Return final answers as JSON with keys: reply (string), actualFigures (object of string->string), estimates (object of string->string), suggestions (array of strings).',
].join('\n');

function createGeminiRunner(timeoutMs = 45_000): AIModelRunner {
  const env = getEnv();
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AppError(503, 'AI_UNAVAILABLE', 'Gemini API key is not configured');
  }
  const ai = new GoogleGenAI({ apiKey });

  return async ({ messages }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const prompt = messages.map((m) => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
          abortSignal: controller.signal,
        },
      });

      const functionCalls = (response.functionCalls ?? []).map((fc) => ({
        name: fc.name ?? '',
        args: (fc.args ?? {}) as Record<string, unknown>,
      }));

      return {
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
        text: response.text ?? undefined,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.error(
        '[aiService] Gemini request failed:',
        err instanceof Error ? err.message : String(err),
      );
      throw new AppError(
        503,
        'AI_UNAVAILABLE',
        'AI assistant is temporarily unavailable. Please try again later.',
      );
    } finally {
      clearTimeout(timer);
    }
  };
}

function collectNumbersFromUnknown(value: unknown, out: Set<string>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.add(String(value));
    out.add(value.toFixed(2));
    return;
  }
  if (typeof value === 'string') {
    const matches = value.match(/-?\d+(?:\.\d+)?/g);
    if (matches) {
      for (const m of matches) {
        out.add(m);
        const num = Number(m);
        if (Number.isFinite(num)) {
          out.add(String(num));
        }
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbersFromUnknown(item, out);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) collectNumbersFromUnknown(v, out);
  }
}

function normalizeAndGroundAnswer(
  rawText: string,
  toolOutputs: unknown[],
  pendingActions: AIStructuredAnswer['pendingActions'],
  toolCallsExecuted: string[],
): AIStructuredAnswer {
  let parsed: Partial<AIStructuredAnswer> | null = null;
  try {
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof obj === 'object' && obj !== null) {
      parsed = {
        reply: typeof obj.reply === 'string' ? obj.reply : rawText,
        actualFigures:
          typeof obj.actualFigures === 'object' && obj.actualFigures !== null
            ? (obj.actualFigures as Record<string, string>)
            : {},
        estimates:
          typeof obj.estimates === 'object' && obj.estimates !== null
            ? (obj.estimates as Record<string, string>)
            : {},
        suggestions: Array.isArray(obj.suggestions)
          ? obj.suggestions.map((s) => String(s))
          : [],
      };
    }
  } catch {
    parsed = {
      reply: rawText,
      actualFigures: {},
      estimates: {},
      suggestions: [],
    };
  }

  const allowedNumbers = new Set<string>();
  for (const out of toolOutputs) {
    collectNumbersFromUnknown(out, allowedNumbers);
  }

  // BR-AI9: Every number in actualFigures/estimates must come from tool output
  const groundedActuals: Record<string, string> = {};
  let foundUnsupportedNumber = false;
  for (const [k, v] of Object.entries(parsed?.actualFigures ?? {})) {
    const str = String(v);
    const nums = str.match(/-?\d+(?:\.\d+)?/g) ?? [];
    if (nums.length === 0 || nums.every((n) => allowedNumbers.has(n))) {
      groundedActuals[k] = str;
    } else {
      foundUnsupportedNumber = true;
    }
  }

  const groundedEstimates: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed?.estimates ?? {})) {
    const str = String(v);
    const nums = str.match(/-?\d+(?:\.\d+)?/g) ?? [];
    if (nums.length === 0 || nums.every((n) => allowedNumbers.has(n))) {
      groundedEstimates[k] = str;
    } else {
      foundUnsupportedNumber = true;
    }
  }

  let finalReply = parsed?.reply || 'I could not find that data in your shop records.';
  if (foundUnsupportedNumber && Object.keys(groundedActuals).length === 0) {
    finalReply = 'I could not verify those figures from your shop records.';
  }

  return {
    reply: finalReply,
    actualFigures: groundedActuals,
    estimates: groundedEstimates,
    suggestions: parsed?.suggestions ?? [],
    pendingActions,
    toolCallsExecuted,
  };
}

const GraphState = Annotation.Root({
  messages: Annotation<Array<{ role: 'user' | 'model' | 'tool'; content: string }>>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  pendingToolCalls: Annotation<ModelTurnToolCall[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  toolOutputs: Annotation<unknown[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  pendingActions: Annotation<AIStructuredAnswer['pendingActions']>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  toolCallsExecuted: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  lastModelText: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  steps: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
});

export async function chatWithAssistant(
  shopId: string,
  input: {
    message: string;
    conversationId?: string | null;
  },
  options?: {
    modelRunner?: AIModelRunner;
    now?: Date;
  },
): Promise<{
  conversationId: string;
  answer: AIStructuredAnswer;
}> {
  const prisma = await ensurePrismaConnected();
  const env = getEnv();
  const now = options?.now ?? new Date();

  const shop = await prisma.shop.findUniqueOrThrow({
    where: { id: shopId },
    select: { id: true, timezone: true },
  });

  // BR-AI7: Daily message limit per shop-local day
  const todayBounds = periodBounds('today', shop.timezone, now);
  const dailyCount = await prisma.aIMessage.count({
    where: {
      role: 'user',
      conversation: { shopId },
      createdAt: {
        gte: todayBounds.startUtc,
        lt: todayBounds.endUtc,
      },
    },
  });
  if (dailyCount >= env.AI_DAILY_MESSAGE_LIMIT) {
    throw new AppError(
      429,
      'AI_LIMIT_REACHED',
      `Daily AI message limit (${env.AI_DAILY_MESSAGE_LIMIT}) reached for today`,
    );
  }

  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const existing = await prisma.aIAssistantConversation.findFirst({
      where: scopeWhere(shopId, { id: conversationId }),
      select: { id: true },
    });
    assertFoundInShop(existing, 'AI conversation');
  } else {
    const createdConv = await prisma.aIAssistantConversation.create({
      data: { shopId },
      select: { id: true },
    });
    conversationId = createdConv.id;
  }

  const history = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  await prisma.aIMessage.create({
    data: {
      conversationId,
      role: 'user',
      content: input.message.trim(),
    },
  });

  const runner = options?.modelRunner ?? createGeminiRunner();

  const graph = new StateGraph(GraphState)
    .addNode('agent', async (state) => {
      const turn = await runner({ messages: state.messages });
      return {
        pendingToolCalls: turn.functionCalls ?? [],
        lastModelText: turn.text ?? '',
        steps: state.steps + 1,
      };
    })
    .addNode('tools', async (state) => {
      const outputs: unknown[] = [];
      const proposals: AIStructuredAnswer['pendingActions'] = [];
      const executed: string[] = [];
      const toolMsgs: Array<{ role: 'tool'; content: string }> = [];

      for (const tc of state.pendingToolCalls) {
        const res = await executeAiTool(
          { shopId, conversationId },
          tc.name,
          tc.args,
        );
        executed.push(tc.name);
        outputs.push(res.data);
        if (res.kind === 'PROPOSAL') {
          const act = res.data as AIStructuredAnswer['pendingActions'][number];
          proposals.push(act);
        }
        toolMsgs.push({
          role: 'tool',
          content: `${tc.name} => ${JSON.stringify(res.data)}`,
        });
      }

      return {
        messages: toolMsgs,
        pendingToolCalls: [],
        toolOutputs: outputs,
        pendingActions: proposals,
        toolCallsExecuted: executed,
      };
    })
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', (state) => {
      if (state.pendingToolCalls.length > 0 && state.steps < 4) {
        return 'tools';
      }
      return END;
    })
    .addEdge('tools', 'agent')
    .compile();

  const initialMessages: Array<{ role: 'user' | 'model' | 'tool'; content: string }> = [
    ...history.map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      content: m.content,
    })),
    { role: 'user', content: input.message.trim() },
  ];

  const finalState = await graph.invoke({ messages: initialMessages });

  const answer = normalizeAndGroundAnswer(
    finalState.lastModelText,
    finalState.toolOutputs,
    finalState.pendingActions,
    finalState.toolCallsExecuted,
  );

  await prisma.aIMessage.create({
    data: {
      conversationId,
      role: 'assistant',
      content: answer.reply,
      structuredJson: answer as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    conversationId,
    answer,
  };
}

export async function listAiConversations(shopId: string) {
  const prisma = await ensurePrismaConnected();
  const convs = await prisma.aIAssistantConversation.findMany({
    where: scopeWhere(shopId),
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
      actionLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return convs.map((c) => ({
    id: c.id,
    shopId: c.shopId,
    createdAt: c.createdAt.toISOString(),
    messages: c.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      structuredJson: m.structuredJson,
      createdAt: m.createdAt.toISOString(),
    })),
    actions: c.actionLogs.map((a) => ({
      id: a.id,
      toolName: a.toolName,
      summary: a.summary,
      status: a.status,
      requiresStrongConfirm: a.requiresStrongConfirm,
      strongConfirmTarget: a.strongConfirmTarget,
      expiresAt: a.expiresAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
    })),
  }));
}
