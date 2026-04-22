import type { Memory, Resource, RetrievalDocument, Textbook } from '@/lib/types';

import { buildDocumentFrequency, buildSparseWeights } from './sparse';
import { chunkText, extractPlainTextExcerpt, normalizeWhitespace } from './text';

interface BuildRetrievalDocumentsInput {
  syncKey: string;
  memories: Memory[];
  textbooks: Textbook[];
  resources: Resource[];
}

function buildMemoryDocument(syncKey: string, memory: Memory): RetrievalDocument {
  const segments = [
    memory.content,
    memory.correctAnswer ? `标准答案：${memory.correctAnswer}` : '',
    memory.notes ? `备注：${memory.notes}` : '',
    memory.errorReason ? `错因：${memory.errorReason}` : '',
    memory.wrongAnswer ? `错误答案：${memory.wrongAnswer}` : '',
  ].filter(Boolean);

  return {
    id: `memory:${memory.id}:0`,
    syncKey,
    kind: 'memory',
    sourceId: memory.id,
    chunkIndex: 0,
    chunkCount: 1,
    title: memory.collectionName || memory.source || '记忆卡片',
    subject: memory.subject,
    text: normalizeWhitespace(segments.join('\n')),
    nodeIds: memory.knowledgeNodeIds || [],
    isMistake: memory.isMistake,
    sourceResourceIds: memory.sourceResourceIds,
    sourceTextbookId: memory.sourceTextbookId,
    sourceTextbookPage: memory.sourceTextbookPage,
    updatedAt: memory.updatedAt || memory.createdAt,
    metadata: {
      memoryId: memory.id,
      type: memory.type,
      functionType: memory.functionType,
      purposeType: memory.purposeType,
      questionType: memory.questionType,
      source: memory.source,
    },
  };
}

function buildTextbookDocuments(syncKey: string, textbook: Textbook): RetrievalDocument[] {
  const documents: RetrievalDocument[] = [];

  textbook.pages.forEach((page) => {
    const chunks = chunkText(page.content);
    chunks.forEach((chunk, chunkIndex) => {
      documents.push({
        id: `textbook:${textbook.id}:${page.pageNumber}:${chunkIndex}`,
        syncKey,
        kind: 'textbook_page',
        sourceId: textbook.id,
        chunkIndex,
        chunkCount: chunks.length,
        title: `${textbook.name} 第 ${page.pageNumber} 页`,
        subject: textbook.subject,
        text: chunk,
        nodeIds: [],
        sourceTextbookId: textbook.id,
        sourceTextbookPage: page.pageNumber,
        updatedAt: textbook.updatedAt || textbook.createdAt,
        metadata: {
          textbookId: textbook.id,
          pageId: page.id,
          pageNumber: page.pageNumber,
          textbookName: textbook.name,
        },
      });
    });
  });

  return documents;
}

function buildResourceDocuments(syncKey: string, resource: Resource): RetrievalDocument[] {
  const excerpt = normalizeWhitespace(
    [
      resource.name,
      resource.description || '',
      (resource.tags || []).join(' '),
      extractPlainTextExcerpt(resource.data),
    ]
      .filter(Boolean)
      .join('\n')
  );

  if (!excerpt) return [];

  const chunks = chunkText(excerpt);
  return chunks.map((chunk, chunkIndex) => ({
    id: `resource:${resource.id}:${chunkIndex}`,
    syncKey,
    kind: 'resource_excerpt',
    sourceId: resource.id,
    chunkIndex,
    chunkCount: chunks.length,
    title: resource.name,
    subject: resource.subject,
    text: chunk,
    nodeIds: [],
    sourceResourceIds: [resource.id],
    updatedAt: resource.updatedAt || resource.createdAt,
    metadata: {
      resourceId: resource.id,
      type: resource.type,
      tags: resource.tags || [],
    },
  }));
}

export function buildRetrievalDocuments(input: BuildRetrievalDocumentsInput): RetrievalDocument[] {
  const { syncKey, memories, textbooks, resources } = input;

  const documents = [
    ...memories.filter((memory) => memory.status !== 'deleted').map((memory) => buildMemoryDocument(syncKey, memory)),
    ...textbooks.filter((textbook) => textbook.status !== 'deleted').flatMap((textbook) => buildTextbookDocuments(syncKey, textbook)),
    ...resources.filter((resource) => resource.status !== 'deleted').flatMap((resource) => buildResourceDocuments(syncKey, resource)),
  ].filter((document) => Boolean(document.text));

  const documentFrequency = buildDocumentFrequency(documents.map((document) => document.text));
  const totalDocuments = Math.max(documents.length, 1);

  return documents.map((document) => ({
    ...document,
    sparse: buildSparseWeights(document.text, documentFrequency, totalDocuments),
  }));
}
