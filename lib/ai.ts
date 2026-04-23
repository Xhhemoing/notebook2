import { GoogleGenAI, Type, FunctionDeclaration, ThinkingLevel } from '@google/genai';
import { 
  Memory, 
  KnowledgeNode, 
  Subject, 
  MemoryFunction, 
  MemoryPurpose, 
  Settings, 
  CustomModel,
  Textbook,
  TextbookPage,
  ReviewPlan,
  ReviewPlanItem
} from './types';
import { searchRetrieval } from './retrieval/client';
import { buildChatPrompt } from './prompting';

// ... (existing imports)

// Helper to get the global AI instance
let globalAiInstance: GoogleGenAI | null = null;
function getGlobalAI() {
  if (!globalAiInstance) {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API key is not set. Gemini features will not work.");
      return null;
    }
    globalAiInstance = new GoogleGenAI({ apiKey });
  }
  return globalAiInstance;
}

function resolveOpenAIEmbeddingUrl(baseUrl: string | undefined) {
  const target = baseUrl?.trim() || 'https://api.openai.com/v1';
  const url = new URL(target);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/embeddings') ? pathname : `${pathname}/embeddings`;
  return url.toString();
}

/**
 * Helper to get embeddings for text or image
 */
export async function getEmbedding(
  content: string | { data: string, mimeType: string } | (string | { inlineData: { data: string, mimeType: string } })[],
  settings?: Settings
): Promise<number[]> {
  const modelId = settings?.embeddingModel || 'text-embedding-004';
  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(modelId, settings || {} as Settings);

  let contents: any[];
  if (Array.isArray(content)) {
    contents = content;
  } else if (typeof content === 'string') {
    contents = [content];
  } else {
    contents = [{ inlineData: content }];
  }

  if (isCustomOpenAI && customModel) {
    // OpenAI embeddings only support text
    const textContent = contents.filter(c => typeof c === 'string').join(' ');
    if (!textContent) {
      throw new Error('OpenAI embeddings only support text content');
    }
    const response = await fetch(
      typeof window === 'undefined' ? resolveOpenAIEmbeddingUrl(customModel.baseUrl) : '/api/ai/proxy',
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof window === 'undefined' ? { Authorization: `Bearer ${customModel.apiKey}` } : {}),
      },
      body: JSON.stringify({
        ...(typeof window === 'undefined'
          ? {}
          : {
              baseUrl: customModel.baseUrl,
              apiKey: customModel.apiKey,
            }),
        model: customModel.modelId,
        input: textContent
      })
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`AI Proxy (Embedding) error: ${summarizeProxyError(err)}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
  } else if (client) {
    const result = await client.models.embedContent({
      model: modelName,
      contents: contents as any
    });
    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error('Failed to get embeddings');
    }
    const values = result.embeddings[0].values;
    if (!values) {
      throw new Error('Failed to get embedding values');
    }
    return values;
  }
  
  throw new Error('Failed to initialize AI client for embeddings');
}

/**
 * Process a full PDF textbook: OCR and generate embeddings for all pages
 */
export async function processTextbookPDF(
  pdfBase64: string,
  settings: Settings,
  logCallback?: (log: any) => void
): Promise<{ pageNumber: number; content: string }[]> {
  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.parseModel, settings);
  
  const prompt = `你是一个专业的课本数字化助手。请对这个PDF文档进行OCR识别，提取出每一页的完整文字内容。
如果是理科课本，请保留公式和图表描述。
请尽可能保持原文的排版格式（如换行、段落、列表等），确保文字和文档的排版和位置相对应。
请以JSON数组格式返回，每个对象包含 pageNumber 和 content 字段。
不要包含任何其他解释。`;

  let resultStr = '';
  try {
    if (isCustomOpenAI && customModel) {
      // Fallback for custom models that might not support PDF
      throw new Error('当前自定义模型可能不支持直接处理PDF，请尝试关闭OCR或使用默认Gemini模型。');
    } else if (client) {
      const response = await client.models.generateContent({
        model: modelName,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: pdfBase64.split(',')[1] || pdfBase64,
                  mimeType: 'application/pdf'
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pageNumber: { type: Type.NUMBER },
                content: { type: Type.STRING }
              },
              required: ['pageNumber', 'content']
            }
          }
        }
      });
      resultStr = response.text || '[]';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback) {
      logCallback({
        type: 'parse',
        model: settings.parseModel,
        prompt: `[Textbook PDF OCR]`,
        response: resultStr
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'parse',
        model: settings.parseModel,
        prompt: `[Textbook PDF OCR Error]`,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  // Clean up potential markdown formatting
  if (resultStr.startsWith('```')) {
    resultStr = resultStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  
  try {
    return JSON.parse(resultStr);
  } catch (e) {
    console.error('Failed to parse PDF OCR result', e);
    return [];
  }
}

/**
 * Process a textbook page: OCR and generate embedding
 */
export async function processTextbookPage(
  base64Image: string,
  pageNumber: number,
  settings: Settings,
  logCallback?: (log: any) => void
): Promise<{ content: string; embedding: number[] }> {
  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.parseModel, settings);
  
  let content = '';
  const prompt = `你是一个专业的课本数字化助手。请对这张课本页面进行OCR识别，提取出完整的文字内容。
如果是理科课本，请保留公式和图表描述。
请尽可能保持原文的排版格式（如换行、段落、列表等），确保文字和文档的排版和位置相对应。
请直接返回提取出的文字内容，不要包含任何其他解释。`;

  try {
    if (isCustomOpenAI && customModel) {
      content = await fetchOpenAI(customModel, prompt, base64Image);
    } else if (client) {
      const parts: any[] = [{ text: prompt }];
      if (base64Image.includes('base64,')) {
        const [header, data] = base64Image.split('base64,');
        const mimeType = header.split(':')[1].split(';')[0];
        parts.push({
          inlineData: { data, mimeType }
        });
      } else {
        // Fallback if no header
        parts.push({
          inlineData: { data: base64Image, mimeType: 'image/jpeg' }
        });
      }

      const response = await client.models.generateContent({
        model: modelName,
        contents: { parts }
      });
      content = response.text || '';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback) {
      logCallback({
        type: 'parse',
        model: settings.parseModel,
        prompt: `[Textbook OCR Page ${pageNumber}]`,
        response: content
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'parse',
        model: settings.parseModel,
        prompt: `[Textbook OCR Page ${pageNumber}]`,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  // Generate multimodal embedding
  const embeddingInput: any[] = [];
  if (content && content.trim() !== '') {
    embeddingInput.push(content);
  }
  
  if (base64Image) {
    let data = base64Image;
    let mimeType = 'image/jpeg';
    if (base64Image.includes('base64,')) {
      data = base64Image.split(',')[1];
      mimeType = base64Image.split(';')[0].split(':')[1];
    }
    embeddingInput.push({
      inlineData: { data, mimeType }
    });
  }

  const embedding = await getEmbedding(embeddingInput.length > 0 ? embeddingInput : content, settings);
  
  return { content, embedding };
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

/**
 * Search textbooks for relevant pages
 */
export async function searchTextbooks(
  query: string,
  textbooks: Textbook[],
  settings: Settings,
  limit: number = 3
): Promise<{ page: TextbookPage; textbookId: string; textbookName: string; score: number }[]> {
  if (settings.serverBackend === 'server-qdrant' && settings.syncKey?.trim()) {
    try {
      const { hits } = await searchRetrieval({
        query,
        syncKey: settings.syncKey.trim(),
        settings,
      });
      return hits
        .filter((hit) => hit.document.kind === 'textbook_page')
        .map((hit) => {
          const textbook = textbooks.find((item) => item.id === hit.document.sourceTextbookId);
          const page = textbook?.pages.find((item) => item.pageNumber === hit.document.sourceTextbookPage);
          if (!textbook || !page) return null;
          return { page, textbookId: textbook.id, textbookName: textbook.name, score: hit.score };
        })
        .filter(Boolean)
        .slice(0, limit) as { page: TextbookPage; textbookId: string; textbookName: string; score: number }[];
    } catch (error) {
      console.warn('Server textbook retrieval failed, fallback to local search:', error);
    }
  }

  const queryEmbedding = await getEmbedding(query, settings);
  const results: { page: TextbookPage; textbookId: string; textbookName: string; score: number }[] = [];

  for (const textbook of textbooks) {
    for (const page of textbook.pages) {
      if (page.embedding) {
        const score = cosineSimilarity(queryEmbedding, page.embedding);
        results.push({ page, textbookId: textbook.id, textbookName: textbook.name, score });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Search memories using RAG (Vector Search)
 */
export async function searchMemoriesRAG(
  query: string,
  memories: Memory[],
  settings: Settings,
  limit: number = 5,
  base64Image?: string
): Promise<Memory[]> {
  if (!base64Image && settings.serverBackend === 'server-qdrant' && settings.syncKey?.trim()) {
    try {
      const { hits } = await searchRetrieval({
        query,
        syncKey: settings.syncKey.trim(),
        subject: memories[0]?.subject,
        settings,
      });
      const orderedMemoryIds = hits
        .filter((hit) => hit.document.kind === 'memory')
        .map((hit) => hit.document.sourceId);
      return orderedMemoryIds
        .map((id) => memories.find((memory) => memory.id === id))
        .filter(Boolean)
        .slice(0, limit) as Memory[];
    } catch (error) {
      console.warn('Server memory retrieval failed, fallback to local search:', error);
    }
  }

  let embeddingInput: any[] = [];
  if (query && query.trim() !== '') {
    embeddingInput.push(query);
  }
  if (base64Image) {
    let data = base64Image;
    let mimeType = 'image/jpeg';
    if (base64Image.includes('base64,')) {
      data = base64Image.split(',')[1];
      mimeType = base64Image.split(';')[0].split(':')[1];
    }
    embeddingInput.push({
      inlineData: { data, mimeType }
    });
  }
  
  if (embeddingInput.length === 0) {
    return [];
  }

  const queryEmbedding = await getEmbedding(embeddingInput, settings);
  const results: { memory: Memory; score: number }[] = [];

  for (const memory of memories) {
    if (memory.embedding) {
      const score = cosineSimilarity(queryEmbedding, memory.embedding);
      results.push({ memory, score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.memory);
}

/**
 * Search memories using RAG
 */
export async function searchAllRAG(
  query: string,
  memories: Memory[],
  textbooks: Textbook[],
  settings: Settings,
  limit: number = 5,
  base64Image?: string
): Promise<{ type: 'memory' | 'textbook'; item: any; score: number }[]> {
  if (!base64Image && settings.serverBackend === 'server-qdrant' && settings.syncKey?.trim()) {
    try {
      const { hits } = await searchRetrieval({
        query,
        syncKey: settings.syncKey.trim(),
        subject: memories[0]?.subject,
        settings,
      });
      return hits
        .map((hit) => {
          if (hit.document.kind === 'memory') {
            const memory = memories.find((item) => item.id === hit.document.sourceId);
            return memory ? { type: 'memory' as const, item: memory, score: hit.score } : null;
          }

          if (hit.document.kind === 'textbook_page') {
            const textbook = textbooks.find((item) => item.id === hit.document.sourceTextbookId);
            const page = textbook?.pages.find((item) => item.pageNumber === hit.document.sourceTextbookPage);
            if (!textbook || !page) return null;
            return {
              type: 'textbook' as const,
              item: { textbookId: textbook.id, textbookName: textbook.name, ...page },
              score: hit.score,
            };
          }

          return null;
        })
        .filter(Boolean)
        .slice(0, limit) as { type: 'memory' | 'textbook'; item: any; score: number }[];
    } catch (error) {
      console.warn('Server hybrid retrieval failed, fallback to local search:', error);
    }
  }

  let embeddingInput: any[] = [];
  if (query && query.trim() !== '') {
    embeddingInput.push(query);
  }
  if (base64Image) {
    let data = base64Image;
    let mimeType = 'image/jpeg';
    if (base64Image.includes('base64,')) {
      data = base64Image.split(',')[1];
      mimeType = base64Image.split(';')[0].split(':')[1];
    }
    embeddingInput.push({
      inlineData: { data, mimeType }
    });
  }
  
  if (embeddingInput.length === 0) {
    return [];
  }

  const queryEmbedding = await getEmbedding(embeddingInput, settings);
  const results: { type: 'memory' | 'textbook'; item: any; score: number }[] = [];

  for (const memory of memories) {
    if (memory.embedding) {
      const score = cosineSimilarity(queryEmbedding, memory.embedding);
      results.push({ type: 'memory', item: memory, score });
    }
  }

  for (const textbook of textbooks) {
    for (const page of textbook.pages) {
      if (page.embedding) {
        const score = cosineSimilarity(queryEmbedding, page.embedding);
        results.push({ type: 'textbook', item: { textbookId: textbook.id, textbookName: textbook.name, ...page }, score });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Generate a knowledge framework for a textbook
 */
export async function generateTextbookFramework(
  textbook: Textbook,
  settings: Settings,
  logCallback?: (log: any) => void
): Promise<KnowledgeNode[]> {
  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.graphModel, settings);
  
  // Use the first few pages and the textbook name to generate a framework
  const context = textbook.pages.slice(0, 10).map(p => p.content).join('\n').slice(0, 4000);
  const prompt = `你是一个专业的教材分析专家。请根据以下课本的部分内容（前10页）和课本名称《${textbook.name}》，构建一个清晰的知识框架（树状结构）。
科目：${textbook.subject}

【重要：深度限制】
请务必细化知识点，知识图谱的深度至少为3层，推荐深度为4到5层（例如：章 -> 节 -> 知识点 -> 核心概念 -> 考点）。不要只生成粗略的章节。

请以JSON格式返回，包含一个 operations 数组，其中 action 为 'add'。
每个节点包含：
- name: 知识点名称
- parentId: 父节点名称 (如果是根节点则为 null)
- order: 排序

内容：
${context}`;

  let resultStr = '';
  try {
    if (isCustomOpenAI && customModel) {
      resultStr = await fetchOpenAI(customModel, prompt, undefined, 'json_object');
    } else if (client) {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              operations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    parentId: { type: Type.STRING, nullable: true },
                    order: { type: Type.NUMBER }
                  },
                  required: ['name', 'parentId', 'order']
                }
              }
            },
            required: ['operations']
          }
        }
      });
      resultStr = response.text || '{"operations": []}';
    }

    if (logCallback) {
      logCallback({
        type: 'graph',
        model: settings.graphModel,
        prompt: `[Generate Framework for ${textbook.name}]`,
        response: resultStr
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'graph',
        model: settings.graphModel,
        prompt: `[Generate Framework for ${textbook.name}]`,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  const parsed = JSON.parse(resultStr);
  const nodes: KnowledgeNode[] = [];
  const nameToId: { [name: string]: string } = {};

  (parsed.operations || []).forEach((op: any, index: number) => {
    const parentId = op.parentId ? nameToId[op.parentId] : null;
    const siblingsCount = nodes.filter(n => n.parentId === parentId).length;
    const id = parentId ? `${parentId}.${siblingsCount + 1}` : `${nodes.filter(n => n.parentId === null).length + 1}`;
    
    const newNode: KnowledgeNode = {
      id,
      subject: textbook.subject,
      name: op.name,
      parentId,
      order: op.order || index
    };
    nodes.push(newNode);
    nameToId[op.name] = id;
  });

  return nodes;
}

export const searchTextbookTool: FunctionDeclaration = {
  name: "search_textbook",
  description: "在导入的课本中搜索相关的原文内容和图片。当用户询问课本上的具体定义、例题或需要查看课本原图时使用。",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "搜索关键词或描述性语句"
      }
    },
    required: ["query"]
  }
};

export const searchAllRAGTool: FunctionDeclaration = {
  name: "search_all_rag",
  description: "使用多模态 RAG 模型搜索学生的个人记忆库（包含笔记、错题、方法论等）和导入的课本。可以根据文本描述或图片内容找到最相关的记忆点或课本内容。",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "搜索关键词或描述内容。"
      }
    },
    required: ["query"]
  }
};

// ... (rest of the file)

/**
 * Helper to get the appropriate AI client and model name based on settings.
 */
export function getAIClient(modelId: string, settings: Settings) {
  // Check custom providers first (format: providerId:modelId)
  if (modelId.includes(':')) {
    const [providerId, actualModelId] = modelId.split(':');
    const provider = settings.customProviders?.find(p => p.id === providerId);
    if (provider) {
      const customModel: CustomModel = {
        id: modelId,
        name: actualModelId,
        provider: provider.type,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        modelId: actualModelId
      };
      if (provider.type === 'gemini') {
        const customAi = new GoogleGenAI({ apiKey: provider.apiKey });
        return {
          ai: customAi,
          modelName: actualModelId,
          isCustomOpenAI: false,
          customModel
        };
      } else {
        return {
          ai: null,
          modelName: actualModelId,
          isCustomOpenAI: true,
          customModel
        };
      }
    }
  }

  // Legacy customModels
  const customModel = settings.customModels?.find(m => m.id === modelId);
  
  if (customModel) {
    if (customModel.provider === 'gemini') {
      const customAi = new GoogleGenAI({ apiKey: customModel.apiKey });
      return { 
        ai: customAi, 
        modelName: customModel.modelId, 
        isCustomOpenAI: false,
        customModel 
      };
    } else {
      // OpenAI compatible
      return { 
        ai: null, 
        modelName: customModel.modelId, 
        isCustomOpenAI: true, 
        customModel 
      };
    }
  }

  // Default Gemini
  const client = getGlobalAI();
  return { 
    ai: client, 
    modelName: modelId, 
    isCustomOpenAI: false, 
    customModel: null 
  };
}

/**
 * Fetch from OpenAI-compatible API
 */
async function fetchOpenAI(customModel: CustomModel, prompt: string, base64Image?: string, responseFormat?: 'json_object') {
  const messages: any[] = [
    {
      role: 'user',
      content: base64Image ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: base64Image } }
      ] : prompt
    }
  ];

  const response = await fetch('/api/ai/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baseUrl: customModel.baseUrl,
      apiKey: customModel.apiKey,
      model: customModel.modelId,
      messages,
      response_format: responseFormat ? { type: responseFormat } : undefined
    })
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const error = await response.json();
      const details = [error.error, error.details].filter(Boolean).join(' | ');
      throw new Error(`AI Proxy error: ${summarizeProxyError(details) || 'Unknown error'}`);
    } else {
      const text = await response.text();
      throw new Error(`AI Proxy error: ${response.status} ${summarizeProxyError(text)}`);
    }
  }

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`AI Proxy expected JSON but got ${contentType}: ${summarizeProxyError(text)}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Skills for Knowledge Graph
const searchKnowledgeGraphTool: FunctionDeclaration = {
  name: "search_knowledge_graph",
  description: "在当前科目的知识图谱中搜索相关的知识点节点。返回匹配的节点列表。",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "搜索关键词，如'勾股定理'、'牛顿第一定律'" }
    },
    required: ["query"]
  }
};

const getNodeDetailsTool: FunctionDeclaration = {
  name: "get_node_details",
  description: "获取特定知识点节点的详细信息，包括其子节点和关联的记忆点数量。",
  parameters: {
    type: Type.OBJECT,
    properties: {
      node_id: { type: Type.STRING, description: "知识点节点的层级ID，如'1.2.1'" }
    },
    required: ["node_id"]
  }
};

function normalizeAIText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map(normalizeAIText).filter(Boolean).join('\n').trim();
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = ['text', 'content', 'analysisProcess', 'analysis', 'message', 'value'];

    for (const key of preferredKeys) {
      if (key in record) {
        const normalized = normalizeAIText(record[key]);
        if (normalized) return normalized;
      }
    }

    const flattened = Object.values(record).map(normalizeAIText).filter(Boolean);
    if (flattened.length > 0) return flattened.join('\n').trim();

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeProxyError(value: unknown, fallback = 'Unknown error') {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text) return fallback;
  if (text.startsWith('<!DOCTYPE html') || text.startsWith('<html')) {
    return stripHtmlTags(text).slice(0, 200) || 'Received an HTML error page';
  }
  return text.slice(0, 200);
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeStringArray(entry));
  }

  const normalized = normalizeAIText(value);
  return normalized ? [normalized] : [];
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', '是', '对', '有'].includes(normalized);
  }

  return false;
}

function normalizeVocabularyData(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const normalized = {
    context: normalizeAIText(record.context) || undefined,
    meaning: normalizeAIText(record.meaning) || undefined,
    usage: normalizeAIText(record.usage) || undefined,
    mnemonics: normalizeAIText(record.mnemonics) || undefined,
    synonyms: Array.from(new Set(normalizeStringArray(record.synonyms))),
  };

  if (
    !normalized.context &&
    !normalized.meaning &&
    !normalized.usage &&
    !normalized.mnemonics &&
    normalized.synonyms.length === 0
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeParsedType(value: unknown, hasVocabularyData: boolean): 'concept' | 'qa' | 'vocabulary' | undefined {
  const normalized = normalizeAIText(value).toLowerCase();

  if (['qa', 'question', 'mistake'].includes(normalized)) return 'qa';
  if (['vocabulary', 'word', 'phrase'].includes(normalized)) return 'vocabulary';
  if (['concept', 'knowledge', 'note'].includes(normalized)) return 'concept';

  if (hasVocabularyData) return 'vocabulary';
  return undefined;
}

function normalizeSuggestedNodes(value: unknown): Array<{ name: string; parentId: string | null; testingMethods: string[] }> {
  const entries = Array.isArray(value) ? value : value ? [value] : [];

  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];

    const record = entry as Record<string, unknown>;
    const name = normalizeAIText(record.name);
    if (!name) return [];

    return [
      {
        name,
        parentId: normalizeAIText(record.parentId) || null,
        testingMethods: Array.from(new Set(normalizeStringArray(record.testingMethods))),
      },
    ];
  });
}

function normalizeParsedItem(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const content = normalizeAIText(value);
    if (!content) return null;

    return {
      content,
      type: 'concept' as const,
      suggestedNodeIds: [] as string[],
      newNodes: [] as Array<{ name: string; parentId: string | null; testingMethods: string[] }>,
      deletedNodeIds: [] as string[],
      isMistake: false,
    };
  }

  const record = value as Record<string, unknown>;
  const vocabularyData = normalizeVocabularyData(record.vocabularyData);
  const type = normalizeParsedType(record.type, Boolean(vocabularyData));

  const normalized = {
    content:
      normalizeAIText(record.content) ||
      normalizeAIText(record.notes) ||
      normalizeAIText(record.correctAnswer) ||
      vocabularyData?.meaning ||
      '',
    type:
      type ||
      (normalizeAIText(record.correctAnswer) || normalizeAIText(record.questionType) || normalizeBoolean(record.isMistake)
        ? ('qa' as const)
        : ('concept' as const)),
    correctAnswer: normalizeAIText(record.correctAnswer) || undefined,
    questionType: normalizeAIText(record.questionType) || undefined,
    suggestedNodeIds: Array.from(new Set(normalizeStringArray(record.suggestedNodeIds))),
    newNodes: normalizeSuggestedNodes(record.newNodes),
    deletedNodeIds: Array.from(new Set(normalizeStringArray(record.deletedNodeIds))),
    isMistake: normalizeBoolean(record.isMistake),
    wrongAnswer: normalizeAIText(record.wrongAnswer) || undefined,
    errorReason: normalizeAIText(record.errorReason) || undefined,
    vocabularyData,
    notes: normalizeAIText(record.notes) || undefined,
    visualDescription: normalizeAIText(record.visualDescription) || undefined,
    functionType: normalizeAIText(record.functionType) || undefined,
    purposeType: normalizeAIText(record.purposeType) || undefined,
    source: normalizeAIText(record.source) || undefined,
    region: normalizeAIText(record.region) || undefined,
    collectionName: normalizeAIText(record.collectionName) || undefined,
  };

  return normalized.content ? normalized : null;
}

function normalizeParsedItems(value: unknown) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry) => normalizeParsedItem(entry))
    .filter(Boolean);
}

export async function parseNotes(
  input: string,
  subject: Subject,
  allNodes: KnowledgeNode[],
  settings: Settings,
  base64Images?: string[],
  explicitFunction?: string,
  explicitPurpose?: string,
  previousParsedItems?: any[],
  previousAnalysis?: string,
  existingFunctionTypes: string[] = ['细碎记忆', '方法论', '关联型记忆', '系统型'],
  existingPurposeTypes: string[] = ['内化型', '记忆型', '补充知识型', '系统型'],
  logCallback?: (log: any) => void
): Promise<{ analysisProcess: string; parsedItems: any[]; newNodes: KnowledgeNode[]; deletedNodeIds: string[]; identifiedSubject: string }> {
  // Strict Subject Isolation
  const subjectNodes = allNodes.filter(n => n.subject === subject);
  const feedbackDirective = `
AI attention notes:
${settings.aiAttentionNotes || 'None.'}

Feedback-derived preferences:
${settings.feedbackLearningNotes || 'None.'}
`;

  let prompt = `
${feedbackDirective}
你是一个高考复习与错题本AI助手。请分析以下学生的作业/笔记/试卷内容（可能包含文本或多张图片/PDF/Word内容）。
当前用户选择的科目：【${subject}】

【重要：科目隔离】
请严格只在【${subject}】科目的范围内进行分析。如果内容明显属于其他科目，请在 identifiedSubject 中指出，但不要将其关联到当前科目的知识节点上。

用户的作业与错题解析偏好（非常重要，请严格遵循）：
${settings.homeworkPreferences || '无特殊偏好'}

用户的个人符号/标记含义（请根据这些含义来识别用户的重点、疑问和错题）：
${settings.userSymbols || '未设置。请你尝试自主推断图片中符号的含义（如红叉代表错题，五角星代表重点，问号代表疑问等）。'}

【AI 自主性与整卷分析要求】：
1. 自动识别错题：仔细扫描试卷/作业，自动发现批改痕迹（如红叉、扣分）或错误的解答，将其作为错题提取。
2. 自动提取标记：根据用户的符号含义或你的推断，自动提取用户标记的重点、疑问点，并作为记忆卡片录入。
3. 自动解答疑问：如果用户在题目旁画了问号或写了疑问，请在解析中自动为其详细解答，并作为记忆点录入。
4. 整卷分析：如果上传的是整份试卷和答题卡，请综合分析错题分布，总结薄弱知识点，并提取需要记忆的核心考点。
5. 灵活处理数据类型：区分 'concept'（概念/普通记忆）、'qa'（题目/错题）、'vocabulary'（词汇/零散语言点）。
6. 特殊处理词汇与手写注释：对于英语阅读文章、完形填空等，请**特别注意图片中用户手写的中文注释、下划线或圈出的单词/短语（例如在单词旁写了中文意思）**。这些通常是用户不熟悉的生词或重点短语。请务必将这些词汇提取出来，类型设为 'vocabulary'，并尽可能提取上下文(context)、含义(meaning)、用法(usage)、助记(mnemonics)、同义词(synonyms)。

【重要：内容纯净度要求】
提取的 content、notes、wrongAnswer、errorReason 等字段中，必须只包含纯粹的知识点、题目或解析内容。**严禁**包含任何类似“用户让我提取...”、“根据图片显示...”、“这里是总结的...”等无关的元对话或解释性文字。直接输出核心内容。

【知识图谱深度要求】：
请尽可能详细和完整地完善知识图谱。每个知识点的考法也要录入。知识图谱的深度建议在 4-6 层。
如果现有知识图谱不够详细，请根据题目的共性和不同点，主动建议增加更细分的子节点。

${previousParsedItems ? `
注意：这是用户要求重新生成的请求。
之前的分析过程：
${previousAnalysis}

之前解析出的内容：
${JSON.stringify(previousParsedItems, null, 2)}

请根据用户新的补充说明/修改要求，重新生成解析结果。
` : ''}

请执行以下任务：
1. 仔细观察图片中的笔迹、题号前的标记。
2. 【多图处理】：如果提供了多张图片，请注意它们可能属于同一份作业或试卷，甚至同一道题目可能因为版面问题被拆分到了两张图片中。请你具备跨图片识别和整合的能力。
3. 【技能调用】：使用 search_knowledge_graph 工具查找当前科目下相关的知识点。不要假设你了解所有节点，请先搜索。
4. 根据用户的指令或标记，提取出需要记录的错题、独立的知识点或记忆卡片。
5. 提供一段分析过程（analysisProcess），向用户解释你识别到了哪些标记、笔迹，以及你是如何理解用户意图的。
6. 识别这段内容所属的科目（identifiedSubject）。

对于每一个提取出的记忆/错题/词汇，请提供：
1. content: 记忆的核心内容、题目题干或词汇本身。
2. type: 数据类型，必须是 'concept' (概念), 'qa' (题目/错题), 或 'vocabulary' (词汇) 之一。
3. correctAnswer: 标准答案（仅针对qa）。
4. questionType: 题型（仅针对qa）。
5. suggestedNodeIds: 建议关联的知识节点ID数组。请优先使用 search_knowledge_graph 找到的现有节点ID（如 "1.2.1"）。
6. newNodes: 如果现有节点不够详细，请建议创建的新节点。
   - name: 节点名称
   - parentId: 父节点ID
   - testingMethods: 该知识点的常见考法（数组，字符串列表）
7. deletedNodeIds: 如果你发现现有节点存在冗余、错误或需要合并，请建议删除的节点ID数组。
8. isMistake: 布尔值，标识这是否是一道错题。
9. wrongAnswer: 如果是错题，记录用户的错误答案（如果有）。
10. errorReason: 如果是错题，分析错误原因（例如：概念混淆、计算错误、审题不清等）。
11. vocabularyData: 如果 type 是 'vocabulary'，请提供一个对象，包含 context (上下文原句), meaning (含义), usage (用法/搭配), mnemonics (助记方法), synonyms (同义词/近义词数组)。
12. notes: 补充说明或正确解析。

输入内容/指令：
${input || '请分析图片中的作业和标记'}
`;

  const promptBundle = buildChatPrompt({
    query,
    subject,
    relevantMemories,
    allNodes,
    settings,
    hasImage: Boolean(base64Image),
  });
  prompt = promptBundle.prompt;
  const { promptVersion, diagnostics } = promptBundle;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.parseModel, settings);

  let response: any;
  let text = '';
  try {
    if (isCustomOpenAI && customModel) {
      const jsonPrompt = prompt + "\n\n请以 JSON 格式返回结果，包含 analysisProcess, identifiedSubject, items (数组，包含 content, type, correctAnswer, questionType, suggestedNodeIds, newNodes, deletedNodeIds, isMistake, wrongAnswer, errorReason, vocabularyData, notes)。";
      text = await fetchOpenAI(customModel, jsonPrompt, base64Images?.[0], 'json_object');
      response = { text };
    } else if (client) {
      const parts: any[] = [{ text: prompt }];
      if (base64Images && base64Images.length > 0) {
        base64Images.forEach(img => {
          parts.push({
            inlineData: {
              data: img.split(',')[1],
              mimeType: img.split(';')[0].split(':')[1],
            },
          });
        });
      }

      response = await client.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          tools: [{ functionDeclarations: [searchKnowledgeGraphTool, getNodeDetailsTool] }],
          toolConfig: { includeServerSideToolInvocations: true },
          responseMimeType: 'application/json',
        }
      });

      // Handle Function Calls
      let functionCalls = response.functionCalls;
      while (functionCalls) {
        const toolResponses: any[] = [];
        for (const fc of functionCalls) {
          if (fc.name === 'search_knowledge_graph') {
            const query = (fc.args as any).query.toLowerCase();
            const matches = subjectNodes.filter(n => n.name.toLowerCase().includes(query));
            toolResponses.push({
              name: fc.name,
              id: fc.id,
              response: { nodes: matches.map(n => ({ id: n.id, name: n.name, parentId: n.parentId })) }
            });
          } else if (fc.name === 'get_node_details') {
            const nodeId = (fc.args as any).node_id;
            const node = subjectNodes.find(n => n.id === nodeId);
            const children = subjectNodes.filter(n => n.parentId === nodeId);
            toolResponses.push({
              name: fc.name,
              id: fc.id,
              response: { node, children: children.map(c => ({ id: c.id, name: c.name })) }
            });
          }
        }

        // Send tool responses back
        const previousContent = response.candidates?.[0]?.content;
        response = await client.models.generateContent({
          model: modelName,
          contents: [
            { role: 'user', parts: parts },
            previousContent as any,
            { role: 'user', parts: toolResponses.map(tr => ({ functionResponse: tr })) }
          ],
          config: {
            tools: [{ functionDeclarations: [searchKnowledgeGraphTool, getNodeDetailsTool] }],
            toolConfig: { includeServerSideToolInvocations: true },
            responseMimeType: 'application/json',
          }
        });
        functionCalls = response.functionCalls;
      }
      text = response.text || '{}';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback) {
      logCallback({
        type: 'parse',
        model: settings.parseModel,
        prompt: prompt,
        response: text
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'parse',
        model: settings.parseModel,
        prompt: prompt,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  let result: any = { items: [], analysisProcess: '', identifiedSubject: subject };
  try {
    // Clean up text in case AI wrapped it in markdown code blocks
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    
    const parsed = JSON.parse(cleanText);
    
    if (Array.isArray(parsed)) {
      // If AI returned an array of items directly
      result.items = parsed;
      // Try to find analysisProcess and identifiedSubject in any item if they exist there
      const itemWithAnalysis = parsed.find(item => item.analysisProcess);
      if (itemWithAnalysis) {
        result.analysisProcess = itemWithAnalysis.analysisProcess;
      }
      const itemWithSubject = parsed.find(item => item.identifiedSubject);
      if (itemWithSubject) {
        result.identifiedSubject = itemWithSubject.identifiedSubject;
      }
    } else {
      result = parsed;
    }
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", e, text);
    result = { items: [], analysisProcess: '解析AI响应失败，请重试', identifiedSubject: subject };
  }
  
  const normalizedAnalysisProcess =
    normalizeAIText(result.analysisProcess ?? result.analysis) || '解析完成';
  const normalizedIdentifiedSubject =
    normalizeAIText(result.identifiedSubject ?? result.subject) || subject;

  // Process new nodes to assign hierarchical IDs
  const finalNewNodes: KnowledgeNode[] = [];
  const items = normalizeParsedItems(result.items);
  const finalDeletedNodeIds = Array.from(
    new Set([
      ...normalizeStringArray(result.deletedNodeIds),
      ...items.flatMap((item: any) => item.deletedNodeIds || []),
    ])
  );

  const processedItems = items.map((item: any) => {
    const nodeIds = [...(item.suggestedNodeIds || [])];
    const collectionName = item.collectionName || (item.type === 'vocabulary' ? '词汇本' : undefined);
    
    if (item.newNodes) {
      item.newNodes.forEach((nn: any) => {
        // Check if node with same name exists in subject or already added in this batch
        const existing = [...subjectNodes, ...finalNewNodes].find(sn => sn.name === nn.name && sn.parentId === nn.parentId);
        if (existing) {
          nodeIds.push(existing.id);
        } else {
          // Create new node with hierarchical ID
          const parentId = nn.parentId || null;
          // For root nodes, check all subjects to ensure unique top-level IDs
          // For child nodes, subject isolation is enough as parentId is already subject-specific
          const siblings = (parentId === null 
            ? [...allNodes, ...finalNewNodes] 
            : [...subjectNodes, ...finalNewNodes]
          ).filter(n => n.parentId === parentId);
          
          // Find the next order number
          let nextOrder = 1;
          if (siblings.length > 0) {
            const orders = siblings.map(s => s.order || 0).filter(o => !isNaN(o));
            const lastOrder = orders.length > 0 ? Math.max(...orders) : 0;
            nextOrder = lastOrder + 1;
          }
          
          let newId = parentId ? `${parentId}.${nextOrder}` : `${nextOrder}`;
          
          // Final safety check: ensure newId is globally unique
          let safetyCounter = 0;
          while ([...allNodes, ...finalNewNodes].some(n => n.id === newId)) {
            safetyCounter++;
            newId = parentId ? `${parentId}.${nextOrder + safetyCounter}` : `${nextOrder + safetyCounter}`;
          }
          
          const newNode: KnowledgeNode = {
            id: newId,
            subject,
            name: nn.name,
            parentId,
            order: nextOrder + safetyCounter,
            testingMethods: nn.testingMethods || []
          };
          finalNewNodes.push(newNode);
          nodeIds.push(newId);
        }
      });
    }
    
    return { ...item, nodeIds, collectionName };
  });

  return {
    analysisProcess: normalizedAnalysisProcess,
    parsedItems: processedItems,
    newNodes: finalNewNodes,
    deletedNodeIds: finalDeletedNodeIds,
    identifiedSubject: normalizedIdentifiedSubject
  };
}

export async function summarizeStudentProfile(
  settings: Settings,
  memories: Memory[],
  logs: any[]
): Promise<string> {
  const recentMemories = memories.slice(-100); // Look at last 100 memories
  const recentLogs = logs.filter(l => l.type === 'chat' || l.type === 'parse' || l.type === 'review').slice(-50);

  // Group data for better analysis
  const memorySummary = recentMemories.filter(m => !m.isMistake).map(m => 
    `[${m.subject}] ${m.content.substring(0, 100)}... (Mastery: ${m.mastery}%)`
  ).join('\n');
  
  const mistakeSummary = recentMemories.filter(m => m.isMistake).map(m => 
    `[${m.subject}] ${m.content.substring(0, 100)}... (Reason: ${m.errorReason})`
  ).join('\n');

  const prompt = `
作为专属AI导师，请根据学生最近的学习记录和交互日志，进行深度分析，更新对该学生的详细画像（Student Profile）。

【最新学习数据】：
记忆点：
${memorySummary || '暂无新记忆点'}

错题样本：
${mistakeSummary || '暂无新错题'}

交互日志样本：
${recentLogs.map(l => `- [${l.type}] User: ${l.prompt.substring(0, 50)}...\n- AI: ${l.response.substring(0, 50)}...`).join('\n')}

【画像要求】：
请务必按照以下维度进行极其详细的划分，并确保包含“科目维度”和“时间维度”的深度分析：

1. **总体学习状态与心理曲线**：当前的整体复习进度、学习动力、压力水平及心理状态随时间的变化趋势。
2. **科目深度解剖**：
   - 针对每个主要科目，分析其知识图谱的覆盖率、核心考点的掌握程度。
   - 识别优势模块与顽固薄弱环节。
   - 识别学生在不同科目上的思维模型差异。
3. **时间维度与效率分析**：
   - **黄金时间识别**：分析学生在不同时间段的学习产出质量。
   - **疲劳周期**：识别学习效率下降的临界点。
   - **活跃度规律**：学生在什么时间最倾向于提问，什么时间最倾向于整理错题。
4. **学习行为指纹**：
   - **资料吸收偏好**：对图表、公式、长文本或多媒体资料的敏感度。
   - **交互风格**：是“结果导向型”还是“过程导向型”。
5. **核心痛点与精准提分路径**：
   - 总结当前最急需解决的 3-5 个核心痛点。
   - 提供基于数据分析的、可量化的后续复习建议。

现有的学生画像：
${settings.studentProfile || '暂无'}

请输出一段详细、结构化、具有深度的学生画像总结，字数控制在1000字以内。直接输出总结内容，使用 Markdown 格式，不要包含多余的客套话。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.chatModel, settings);

  if (isCustomOpenAI && customModel) {
    return await fetchOpenAI(customModel, prompt);
  } else if (client) {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || settings.studentProfile || '';
  }
  return settings.studentProfile || '';
}

export async function reorganizeKnowledgeGraph(
  settings: Settings,
  subject: Subject,
  nodes: KnowledgeNode[]
): Promise<any[]> {
  const prompt = `
你是一个知识图谱专家。请分析以下【${subject}】科目的知识节点，并重新组织它们的层级结构，使其更加合理、详细和准确。
你可以：
1. 将孤立的节点归类到合适的父节点下。
2. 发现缺失的关键概念，并添加新节点。
3. 修正不合理的父子关系。

【重要：深度限制】
请务必细化知识点，知识图谱的深度至少为3层，推荐深度为4到5层（例如：章 -> 节 -> 知识点 -> 核心概念 -> 考点）。不要只生成粗略的章节。

当前节点列表：
${nodes.map(n => `- ID: ${n.id}, Name: ${n.name}, ParentID: ${n.parentId || 'null'}`).join('\n')}

请返回一个 JSON 数组，包含需要执行的操作（GraphOperation）。
操作类型 (action) 包括: 'add', 'update', 'delete', 'move'。
- add: { action: 'add', node: { id: 'new-uuid', name: '新节点名', parentId: '父节点ID' } }
- update: { action: 'update', node: { id: '现有ID', name: '新名字' } }
- move: { action: 'move', node: { id: '现有ID', parentId: '新父节点ID' } }
- delete: { action: 'delete', nodeId: '现有ID' }

重要提示：
- id 和 nodeId 必须是现有节点的 ID (UUID)。
- 对于新添加的节点，parentId 可以是现有节点的 ID，或者是你在此次操作中新添加节点的临时占位符。
- 严禁将节点名称作为现有节点的 ID 使用。

注意：
- 必须保持一个根节点（parentId 为 null）。
- 确保没有循环引用。
- 尽量细化知识结构，让图谱更有层次感。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.graphModel, settings);

  let resultText = '';
  if (isCustomOpenAI && customModel) {
    resultText = await fetchOpenAI(customModel, prompt, undefined, 'json_object');
  } else if (client) {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              action: { type: Type.STRING, enum: ['add', 'update', 'delete', 'move'] },
              node: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  parentId: { type: Type.STRING }
                }
              },
              nodeId: { type: Type.STRING }
            },
            required: ['action']
          }
        }
      }
    });
    resultText = response.text || '';
  }

  if (!resultText) return [];
  try {
    return JSON.parse(resultText) as any[];
  } catch (e) {
    console.error('Failed to parse graph reorganization operations', e);
    return [];
  }
}

export async function generateGatewaySummary(
  subject: Subject,
  memories: Memory[],
  summaryType: 'vocabulary' | 'question_types' | 'error_analysis' | 'knowledge_connection',
  settings: Settings,
  logCallback?: (log: any) => void
): Promise<string> {
  const relevantMemories = memories.filter(m => m.subject === subject);
  
  let prompt = '';
  if (summaryType === 'vocabulary') {
    const vocabMemories = relevantMemories.filter(m => m.type === 'vocabulary');
    if (vocabMemories.length === 0) return '当前科目没有足够的词汇数据来进行归纳。';
    prompt = `你是一个高级学习网关（AI Gateway）。请对以下【${subject}】科目的词汇记忆进行系统性的归纳和串联讲解。
请提取同义词、近义词、熟词生义，并给出记忆建议。
词汇数据：
${vocabMemories.map(m => `- 词汇/内容: ${m.content}\n  含义: ${m.vocabularyData?.meaning || ''}\n  语境: ${m.vocabularyData?.context || ''}\n  用法: ${m.vocabularyData?.usage || ''}\n  同义词: ${m.vocabularyData?.synonyms?.join(', ') || ''}`).join('\n\n')}
`;
  } else if (summaryType === 'question_types') {
    const qaMemories = relevantMemories.filter(m => m.type === 'qa' || m.questionType);
    if (qaMemories.length === 0) return '当前科目没有足够的题目数据来进行题型总结。';
    prompt = `你是一个高级学习网关（AI Gateway）。请对以下【${subject}】科目的题目进行常见题型总结。
请归纳出高频考点、常见解题套路（方法论）以及易错陷阱。
题目数据：
${qaMemories.map(m => `- 题目: ${m.content}\n  题型: ${m.questionType || '未知'}\n  标准答案: ${m.correctAnswer || ''}\n  解析/笔记: ${m.notes || ''}`).join('\n\n')}
`;
  } else if (summaryType === 'error_analysis') {
    const mistakeMemories = relevantMemories.filter(m => m.isMistake);
    if (mistakeMemories.length === 0) return '当前科目没有足够的错题数据来进行错因分析。';
    prompt = `你是一个高级学习网关（AI Gateway）。请对以下【${subject}】科目的错题进行深度的错因分析。
请找出学生在认知上的盲区、常见的计算或审题失误，并给出针对性的提分建议。
错题数据：
${mistakeMemories.map(m => `- 错题: ${m.content}\n  错解: ${m.wrongAnswer || ''}\n  错因: ${m.errorReason || ''}\n  正解: ${m.correctAnswer || ''}`).join('\n\n')}
`;
  } else if (summaryType === 'knowledge_connection') {
    const conceptMemories = relevantMemories.filter(m => m.type === 'concept' || !m.type);
    if (conceptMemories.length === 0) return '当前科目没有足够的知识点数据来进行串联。';
    prompt = `你是一个高级学习网关（AI Gateway）。请对以下【${subject}】科目的零散知识点进行串联和总结。
请构建一个宏观的知识脉络，将这些碎片化的记忆点联系起来，形成系统的知识网络。
知识点数据：
${conceptMemories.map(m => `- 知识点: ${m.content}\n  笔记: ${m.notes || ''}`).join('\n\n')}
`;
  }

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.chatModel, settings);

  try {
    let result = '';
    if (isCustomOpenAI && customModel) {
      result = await fetchOpenAI(customModel, prompt);
    } else if (client) {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      result = response.text || '生成总结失败。';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback && settings.enableLogging) {
      logCallback({
        type: 'chat',
        model: settings.chatModel,
        prompt: prompt,
        response: result
      });
    }

    return result;
  } catch (error: any) {
    console.error('Gateway Summary Error:', error);
    throw error;
  }
}

export async function chatWithAI(
  query: string,
  subject: Subject,
  relevantMemories: Memory[],
  allNodes: KnowledgeNode[],
  settings: Settings,
  textbooks?: Textbook[],
  base64Image?: string,
  logCallback?: (log: any) => void,
  allMemories: Memory[] = []
): Promise<string> {
  const memoryContext = relevantMemories.map(m => {
    const nodes = m.knowledgeNodeIds.map(id => allNodes.find(n => n.id === id)?.name).filter(Boolean).join(', ');
    let contextStr = `[记忆点] ${m.content} (分类: ${m.functionType}, 关联节点: ${nodes})`;
    if (m.isMistake) {
      contextStr += `\n[错题标记] 是`;
      if (m.wrongAnswer) contextStr += `\n[原错误答案] ${m.wrongAnswer}`;
      if (m.errorReason) contextStr += `\n[错因分析] ${m.errorReason}`;
    }
    if (m.visualDescription) contextStr += `\n[图片视觉描述] ${m.visualDescription}`;
    if (m.notes) contextStr += `\n[补充说明] ${m.notes}`;
    return contextStr;
  }).join('\n\n');
  const feedbackContext = `
AI attention notes:
${settings.aiAttentionNotes || 'None.'}

Feedback-derived preferences:
${settings.feedbackLearningNotes || 'None.'}
`;

  const prompt = `
${feedbackContext}
你是一个极度智能、专业且具有同理心的AI辅导老师，你的目标是帮助学生深度理解知识并建立长效记忆。你的思考逻辑和表达风格应向 OpenClaw 靠近：逻辑严密、分步骤思考、善于总结、能发现知识间的深层联系。

当前科目：【${subject}】
学生当前的知识背景：
- 个人画像：${settings.studentProfile || '普通高中生'}
- 记忆库上下文：${relevantMemories.length > 0 ? `已检索到 ${relevantMemories.length} 条相关记忆，请结合这些记忆进行回答。` : '暂无直接相关的个人记忆。'}

【核心指令】：
1. **深度思考 (Chain of Thought)**：在回答之前，请先进行内部思考。分析问题的核心考点、学生可能的误区、以及如何将其与现有知识建立联系。
2. **个性化回答**：如果提供了上下文记忆，请引用它们（例如：“正如你之前记录的关于...的笔记...”）。
3. **分层讲解**：先给出直观结论，再进行原理解析，最后提供应用建议或记忆技巧。
4. **Gateway 模式处理**：如果用户选择了特定的归纳功能（如词汇归纳、题型总结），请表现得像一个学科专家，进行系统性的梳理，而不是简单的罗列。
5. **鼓励互动**：在回答结束时，可以提出一个启发性的问题，引导学生进一步思考。

学生的问题：
${query}

以下是学生数据库中提取出的相关记忆点和错题记录（作为上下文参考）：
${memoryContext || '暂无相关记忆。'}

请结合学生的记忆点，给出专业、易懂、切中要害的解答。如果学生的记忆点中有错误或薄弱的地方，请重点指出并帮助其巩固。
你可以使用 search_textbook 工具来查找课本上的原文定义、例题或查看课本原图。
如果你引用了课本内容并想展示课本原图，请在回答中包含以下格式：[TEXTBOOK_PAGE: <textbookId>:<pageNumber>]，其中 <textbookId> 和 <pageNumber> 是工具返回的信息。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.chatModel, settings);

  const tools = [{ 
    functionDeclarations: [
      searchKnowledgeGraphTool, 
      getNodeDetailsTool, 
      searchTextbookTool,
      searchAllRAGTool
    ] 
  }];

  let result = '';
  const startedAt = Date.now();
  try {
    if (isCustomOpenAI && customModel) {
      result = await fetchOpenAI(customModel, prompt, base64Image);
    } else if (client) {
      const parts: any[] = [{ text: prompt }];
      if (base64Image) {
        parts.push({
          inlineData: {
            data: base64Image.split(',')[1],
            mimeType: base64Image.split(';')[0].split(':')[1],
          },
        });
      }

      let response = await client.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          tools,
          toolConfig: { includeServerSideToolInvocations: true },
        }
      });

      let functionCalls = response.functionCalls;
      while (functionCalls) {
        const toolResponses: any[] = [];
        for (const fc of functionCalls) {
          if (fc.name === 'search_knowledge_graph') {
            const q = (fc.args as any).query.toLowerCase();
            const matches = allNodes.filter(n => n.name.toLowerCase().includes(q));
            toolResponses.push({
              name: fc.name,
              id: fc.id,
              response: { nodes: matches.map(n => ({ id: n.id, name: n.name, parentId: n.parentId })) }
            });
          } else if (fc.name === 'get_node_details') {
            const nodeId = (fc.args as any).node_id;
            const node = allNodes.find(n => n.id === nodeId);
            const children = allNodes.filter(n => n.parentId === nodeId);
            toolResponses.push({
              name: fc.name,
              id: fc.id,
              response: { node, children: children.map(c => ({ id: c.id, name: c.name })) }
            });
          } else if (fc.name === 'search_textbook') {
            const q = (fc.args as any).query;
            const results = await searchTextbooks(q, textbooks || [], settings);
            toolResponses.push({
              name: fc.name,
              id: fc.id,
              response: { 
                results: results.map(r => ({
                  textbookId: r.textbookId,
                  textbookName: r.textbookName,
                  pageNumber: r.page.pageNumber,
                  content: r.page.content
                }))
              }
            });
          } else if (fc.name === 'search_all_rag') {
            const q = (fc.args as any).query;
            const results = await searchAllRAG(q, allMemories, textbooks || [], settings, 5, base64Image);
            toolResponses.push({
              name: fc.name,
              id: fc.id,
              response: { 
                results: results.map(r => {
                  if (r.type === 'memory') {
                    return {
                      type: 'memory',
                      id: r.item.id,
                      content: r.item.content,
                      functionType: r.item.functionType,
                      notes: r.item.notes,
                      isMistake: r.item.isMistake
                    };
                  } else {
                    return {
                      type: 'textbook',
                      textbookId: r.item.textbookId,
                      textbookName: r.item.textbookName,
                      pageNumber: r.item.pageNumber,
                      content: r.item.content
                    };
                  }
                })
              }
            });
          }
        }

        const previousContent = response.candidates?.[0]?.content;
        response = await client.models.generateContent({
          model: modelName,
          contents: [
            { role: 'user', parts: parts },
            previousContent as any,
            { role: 'user', parts: toolResponses.map(tr => ({ functionResponse: tr })) }
          ],
          config: {
            tools,
            toolConfig: { includeServerSideToolInvocations: true },
          }
        });
        functionCalls = response.functionCalls;
      }

      result = response.text || '抱歉，我无法回答这个问题。';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback) {
      logCallback({
        type: 'chat',
        model: settings.chatModel,
        promptVersion,
        prompt,
        response: result,
        durationMs: Date.now() - startedAt,
        metadata: {
          ...diagnostics,
          responseChars: result.length,
        },
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'chat',
        model: settings.chatModel,
        promptVersion,
        prompt,
        response: `Error: ${error.message}`,
        durationMs: Date.now() - startedAt,
        metadata: diagnostics,
      });
    }
    throw error;
  }

  return result;
}

export type GraphOperation = 
  | { action: 'add'; name: string; parentId: string | null; nodeId?: string }
  | { action: 'delete'; nodeId: string }
  | { action: 'rename'; nodeId: string; name: string }
  | { action: 'move'; nodeId: string; parentId: string | null };

export interface GraphAdjustmentResult {
  reasoning: string;
  operations: GraphOperation[];
}

export async function adjustKnowledgeGraph(
  command: string,
  subject: Subject,
  existingNodes: KnowledgeNode[],
  settings: Settings,
  base64Image?: string,
  logCallback?: (log: any) => void
): Promise<GraphAdjustmentResult> {
  const prompt = `
你是一个知识图谱管理AI。用户想要修改【${subject}】的知识图谱。
当前图谱节点列表（仅包含必要信息）：
${JSON.stringify(existingNodes.map(n => ({ id: n.id, name: n.name, parentId: n.parentId })), null, 2)}

用户的指令：
"${command}"

任务：
1. 分析用户的指令。如果提供了结构图，请优先参考图中的层级关系。
2. 返回一个操作列表来修改图谱。支持的操作(action)有：
   - 'add': 添加新节点 (需要提供 name 和 parentId)
   - 'delete': 删除节点 (需要提供 nodeId)
   - 'rename': 重命名节点 (需要提供 nodeId 和 name)
   - 'move': 移动节点 (需要提供 nodeId 和 parentId)

重要提示：
- nodeId 必须是现有节点的 ID (UUID)。
- parentId 必须是现有节点的 ID，或者是你在此次操作中新添加节点的临时占位符（建议使用节点名称作为临时占位符）。
- 严禁将节点名称作为 nodeId 使用。

注意：
- parentId 必须是现有节点的 ID，或者是你在此次操作中新添加节点的临时占位符。
- 如果是根节点，parentId 为 null。
- 保持图谱逻辑严密，避免冗余。
- 在 reasoning 字段中简要说明你的修改逻辑。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.graphModel, settings);

  let resultStr = '';
  try {
    if (isCustomOpenAI && customModel) {
      resultStr = await fetchOpenAI(customModel, prompt, base64Image, 'json_object');
    } else if (client) {
      const parts: any[] = [{ text: prompt }];
      if (base64Image) {
        parts.push({
          inlineData: {
            data: base64Image.split(',')[1],
            mimeType: base64Image.split(';')[0].split(':')[1],
          },
        });
      }

      const response = await client.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reasoning: { type: Type.STRING, description: "AI的调整逻辑说明" },
              operations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, description: "add, delete, rename, move" },
                    nodeId: { type: Type.STRING, description: "现有节点的ID (用于delete, rename, move)" },
                    name: { type: Type.STRING, description: "节点名称 (用于add, rename)" },
                    parentId: { type: Type.STRING, description: "父节点ID (用于add, move)，根节点设为 null" },
                  },
                  required: ['action'],
                },
              }
            },
            required: ['reasoning', 'operations']
          },
        },
      });
      resultStr = response.text || '{"reasoning": "", "operations": []}';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback) {
      logCallback({
        type: 'graph',
        model: settings.graphModel,
        prompt,
        response: resultStr
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'graph',
        model: settings.graphModel,
        prompt,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  // Clean up potential markdown formatting

  let parsed;
  try {
    parsed = JSON.parse(resultStr);
  } catch (e) {
    console.error("Failed to parse JSON:", e, resultStr);
    parsed = { reasoning: "解析AI响应失败", operations: [] };
  }
  const operations = (parsed.operations || []).map((op: any) => {
    if (op.parentId === 'null' || op.parentId === undefined || op.parentId === "") op.parentId = null;
    return op as GraphOperation;
  });
  
  return {
    reasoning: parsed.reasoning || '',
    operations
  };
}

export async function extractMemoryFromChat(
  userMessage: string,
  aiResponse: string,
  subject: Subject,
  settings: Settings
): Promise<Memory | null> {
  const prompt = `
请分析以下用户和AI的对话，判断是否包含值得记忆的知识点、错题、方法论或用户的学习偏好。
如果包含，请提取为一个记忆条目。如果不包含（例如只是普通的寒暄或简单的确认），请返回空对象。

用户说：${userMessage}
AI回复：${aiResponse}

请返回 JSON 格式：
{
  "shouldExtract": boolean,
  "content": "提取的具体记忆内容（如果是知识点请精简，如果是错题请包含错误和正确解析）",
  "functionType": "细碎记忆 | 体系框架 | 方法论 | 错题 | 学习偏好",
  "purposeType": "记忆型 | 内化型 | 技能型"
}
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.chatModel, settings);

  try {
    let resultStr = '';
    if (isCustomOpenAI && customModel) {
      resultStr = await fetchOpenAI(customModel, prompt, undefined, 'json_object');
    } else if (client) {
      const response = await client.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json'
        }
      });
      resultStr = response.text || '{}';
    }

    const parsed = JSON.parse(resultStr);
    if (parsed.shouldExtract && parsed.content) {
      return {
        id: require('uuid').v4(),
        subject,
        content: parsed.content,
        functionType: parsed.functionType || '细碎记忆',
        purposeType: parsed.purposeType || '记忆型',
        knowledgeNodeIds: [],
        confidence: 0,
        mastery: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        status: 'active',
        dataSource: 'ai_chat',
        sourceType: 'text'
      };
    }
  } catch (e) {
    console.error('Failed to extract memory from chat:', e);
  }
  return null;
}

export type QuizQuestion = {
  memoryIds: string[]; // Changed from memoryId to memoryIds to support joint questions
  type: 'qa' | 'tf' | 'mc';
  question: string;
  options?: string[]; // For multiple choice
  correctAnswer: string;
  explanation: string;
};

export async function reorganizeMemories(
  settings: Settings,
  subject: Subject,
  memories: Memory[]
): Promise<any[]> {
  const prompt = `
你是一个知识管理专家。请分析以下【${subject}】科目的个人记忆点（包含笔记、错题等），并建议如何重新组织它们。
你可以建议：
1. 合并内容重复或高度相关的记忆点。
2. 将一个复杂的记忆点拆分为多个更简单的记忆点。
3. 修正错误的分类（functionType 或 purposeType）。
4. 补充缺失的笔记或关联知识点。

当前记忆点列表：
${memories.map(m => `- ID: ${m.id}, Content: ${m.content.substring(0, 100)}, Function: ${m.functionType}, Purpose: ${m.purposeType}`).join('\n')}

请返回一个 JSON 数组，包含需要执行的操作。
操作类型 (action) 包括: 'merge', 'split', 'update', 'delete'。
- merge: { action: 'merge', memoryIds: ['id1', 'id2'], newMemory: { content: '...', functionType: '...', purposeType: '...', notes: '...' } }
- split: { action: 'split', memoryId: 'id1', newMemories: [{ content: '...', ... }, { content: '...', ... }] }
- update: { action: 'update', memoryId: 'id1', updates: { content: '...', functionType: '...', ... } }
- delete: { action: 'delete', memoryId: 'id1' }

注意：请务必保持严谨，只在确实有必要时才建议修改。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.chatModel, settings);

  let resultText = '';
  if (isCustomOpenAI && customModel) {
    resultText = await fetchOpenAI(customModel, prompt, undefined, 'json_object');
  } else if (client) {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    resultText = response.text || '';
  }

  if (!resultText) return [];
  try {
    const parsed = JSON.parse(resultText);
    return Array.isArray(parsed) ? parsed : (parsed.operations || []);
  } catch (e) {
    console.error('Failed to parse memory reorganization operations', e);
    return [];
  }
}

export async function calculateNodeCorrelation(
  nodes: KnowledgeNode[],
  memories: Memory[]
): Promise<KnowledgeNode[]> {
  const updatedNodes = [...nodes];
  
  for (let i = 0; i < updatedNodes.length; i++) {
    const nodeA = updatedNodes[i];
    const correlations: { [targetId: string]: number } = {};
    
    for (let j = 0; j < updatedNodes.length; j++) {
      if (i === j) continue;
      const nodeB = updatedNodes[j];
      
      let score = 0;
      
      // 1. Shared memories (Strongest signal)
      const memoriesA = memories.filter(m => m.knowledgeNodeIds?.includes(nodeA.id));
      const memoriesB = memories.filter(m => m.knowledgeNodeIds?.includes(nodeB.id));
      const sharedMemories = memoriesA.filter(ma => memoriesB.some(mb => mb.id === ma.id));
      
      if (sharedMemories.length > 0) {
        score += Math.min(0.6, sharedMemories.length * 0.15);
      }
      
      // 2. Structural relationship
      if (nodeA.parentId === nodeB.parentId && nodeA.parentId !== null) {
        score += 0.25; // Siblings
      } else if (nodeA.parentId === nodeB.id || nodeB.parentId === nodeA.id) {
        score += 0.35; // Parent-child
      }

      // 3. Subject similarity
      if (nodeA.subject === nodeB.subject) {
        score += 0.05;
      }
      
      if (score > 0.1) {
        correlations[nodeB.id] = Math.min(1, score);
      }
    }
    
    updatedNodes[i] = { ...nodeA, correlation: correlations };
  }
  
  return updatedNodes;
}

export async function generateQuizzes(
  memories: Memory[],
  nodes: KnowledgeNode[],
  settings: Settings,
  isJoint: boolean = false,
  logCallback?: (log: any) => void
): Promise<QuizQuestion[]> {
  // If joint, filter memories that have correlated nodes
  let memoriesToUse = memories;
  if (isJoint && memories.length > 1) {
    // Find memories that share highly correlated nodes
    const nodeIds = Array.from(new Set(memories.flatMap(m => m.knowledgeNodeIds)));
    const correlatedPairs: [string, string][] = [];
    
    for (const idA of nodeIds) {
      const nodeA = nodes.find(n => n.id === idA);
      if (nodeA?.correlation) {
        for (const [idB, score] of Object.entries(nodeA.correlation)) {
          if (score > 0.6 && nodeIds.includes(idB)) {
            correlatedPairs.push([idA, idB]);
          }
        }
      }
    }
    
    if (correlatedPairs.length > 0) {
      // Just pick the first pair for now to keep it simple
      const [idA, idB] = correlatedPairs[0];
      memoriesToUse = memories.filter(m => m.knowledgeNodeIds.includes(idA) || m.knowledgeNodeIds.includes(idB));
    } else {
      // If no strong correlations, maybe just use the first 3
      memoriesToUse = memories.slice(0, 3);
    }
  }

  const prompt = `
你是一个高考复习AI老师。请根据以下学生的记忆点/错题，生成复习考察题，帮助学生巩固记忆。

学生画像：
${settings.studentProfile || '无特殊画像'}

题目难度要求：
难度范围在 ${settings.minReviewDifficulty} 到 ${settings.maxReviewDifficulty} 之间（0为最简单，10为最难）。

需要复习的记忆点列表：
${memoriesToUse.map((m, i) => {
  let memoryStr = `[记忆点 ${i + 1}] (ID: ${m.id})\n内容：${m.content}`;
  if (m.isMistake) {
    memoryStr += `\n[错题标记] 是`;
    if (m.wrongAnswer) memoryStr += `\n[原错误答案] ${m.wrongAnswer}`;
    if (m.errorReason) memoryStr += `\n[错因分析] ${m.errorReason}`;
  }
  if (m.notes) memoryStr += `\n补充笔记：${m.notes}`;
  return memoryStr;
}).join('\n\n')}

${isJoint ? `
【特别要求：联合命题】
请将上述所有记忆点结合起来，生成 1-2 道具有综合性的题目。这些题目应该考察这些知识点之间的联系、区别或综合应用。
` : `
请为每个记忆点生成一道题目。
`}

题型可以是：
1. 'qa' (简答题/问答题)
2. 'tf' (判断题，答案必须是"对"或"错")
3. 'mc' (单选题，提供4个选项)

【重要格式要求】：
- 对于 'mc' (单选题)，请务必将4个选项放在 \`options\` 数组中，**不要**将选项写在 \`question\` 字符串里。
- 对于 'qa' (简答题)，请务必在 \`correctAnswer\` 字段中提供详细的参考答案，在 \`explanation\` 中提供解析。不要让 \`correctAnswer\` 为空。

请以JSON数组格式返回，每个对象包含 memoryIds (关联的记忆点ID数组) 和题目信息。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.reviewModel || settings.chatModel, settings);

  let resultStr = '';
  try {
    if (isCustomOpenAI && customModel) {
      resultStr = await fetchOpenAI(customModel, prompt, undefined, 'json_object');
    } else if (client) {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                memoryIds: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "关联的记忆点ID数组"
                },
                type: { type: Type.STRING, description: "qa, tf, or mc" },
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Only for mc type"
                },
                correctAnswer: { type: Type.STRING, description: "The correct answer. For tf, use '对' or '错'" },
                explanation: { type: Type.STRING, description: "Explanation of the answer" }
              },
              required: ['memoryIds', 'type', 'question', 'correctAnswer', 'explanation']
            }
          }
        }
      });
      resultStr = response.text || '[]';
    } else {
      throw new Error('AI client not initialized');
    }

    if (logCallback) {
      logCallback({
        type: 'review',
        model: settings.reviewModel || settings.chatModel,
        prompt,
        response: resultStr
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'review',
        model: settings.reviewModel || settings.chatModel,
        prompt,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  // Clean up potential markdown formatting
  if (resultStr.startsWith('```')) {
    resultStr = resultStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  if (!resultStr) {
    resultStr = '[]';
  }

  return JSON.parse(resultStr) as QuizQuestion[];
}

/**
 * Generate a detailed review plan based on mistakes and knowledge graph
 */
export async function generateReviewPlan(
  subject: Subject,
  memories: Memory[],
  nodes: KnowledgeNode[],
  settings: Settings,
  logCallback?: (log: any) => void
): Promise<ReviewPlan> {
  const mistakes = memories.filter(m => m.subject === subject && m.isMistake);
  const subjectNodes = nodes.filter(n => n.subject === subject);
  
  // Identify weak nodes based on mastery
  const weakNodes = subjectNodes.filter(n => {
    const nodeMemories = memories.filter(m => m.knowledgeNodeIds.includes(n.id));
    if (nodeMemories.length === 0) return false;
    const avgMastery = nodeMemories.reduce((acc, m) => acc + (m.mastery || 0), 0) / nodeMemories.length;
    return avgMastery < 50;
  });

  const prompt = `
你是一个专业的高考提分专家。请根据学生的错题记录、知识点掌握情况和学习背景，制定一份详细的、可执行的复习计划。

科目：${subject}
学生背景：${settings.studentProfile || '无'}
错题数量：${mistakes.length}
薄弱知识点：${weakNodes.map(n => n.name).join(', ')}

【错题摘要】：
${mistakes.slice(0, 15).map(m => `- ${m.content.slice(0, 60)}... (错因: ${m.errorReason || '未分析'})`).join('\n')}

请执行以下任务：
1. 分析学生的错误趋势和核心薄弱环节。
2. 制定一个包含 5-8 个具体任务的复习计划。
3. 每个任务应包含：标题、具体内容、任务类型（knowledge: 知识巩固, exercise: 针对性练习, summary: 总结提升）、优先级（high, medium, low）以及关联的知识点ID。

请以 JSON 格式返回，包含 analysis (字符串，Markdown格式) 和 items (数组，包含 id, title, content, type, priority, relatedNodeIds)。
不要包含任何其他解释。
`;

  const { ai: client, modelName, isCustomOpenAI, customModel } = getAIClient(settings.reviewModel || settings.chatModel, settings);
  
  let resultStr = '';
  try {
    if (isCustomOpenAI && customModel) {
      resultStr = await fetchOpenAI(customModel, prompt, undefined, 'json_object');
    } else if (client) {
      const response = await client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    type: { type: Type.STRING, description: "knowledge, exercise, or summary" },
                    priority: { type: Type.STRING, description: "high, medium, or low" },
                    relatedNodeIds: { 
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ['id', 'title', 'content', 'type', 'priority', 'relatedNodeIds']
                }
              }
            },
            required: ['analysis', 'items']
          }
        }
      });
      resultStr = response.text || '{"analysis": "", "items": []}';
    }

    if (logCallback) {
      logCallback({
        type: 'review',
        model: settings.reviewModel || settings.chatModel,
        prompt,
        response: resultStr
      });
    }
  } catch (error: any) {
    if (logCallback) {
      logCallback({
        type: 'review',
        model: settings.reviewModel || settings.chatModel,
        prompt,
        response: `Error: ${error.message}`
      });
    }
    throw error;
  }

  // Clean up potential markdown formatting
  if (resultStr.startsWith('```')) {
    resultStr = resultStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const parsed = JSON.parse(resultStr);
  
  return {
    id: Math.random().toString(36).substr(2, 9),
    subject,
    createdAt: Date.now(),
    analysis: parsed.analysis,
    items: parsed.items.map((item: any) => ({
      ...item,
      status: 'pending'
    }))
  };
}

