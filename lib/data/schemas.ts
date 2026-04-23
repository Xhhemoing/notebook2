import { z } from 'zod';

const memoryStatusSchema = z.enum(['draft', 'active', 'archived', 'deleted']);
const memoryDataSourceSchema = z.enum([
  'manual',
  'ai_parse',
  'ai_chat',
  'mistake_analysis',
  'textbook_extract',
  'import',
  'system',
]);

export const memoryCreateSchema = z.object({
  id: z.string().optional(),
  subject: z.string().trim().min(1, 'subject is required'),
  content: z.string().trim().min(1, 'content is required').max(5000, 'content is too long'),
  functionType: z.string().trim().min(1, 'functionType is required'),
  purposeType: z.string().trim().min(1, 'purposeType is required'),
  sourceType: z.enum(['text', 'image']).default('text'),
  knowledgeNodeIds: z.array(z.string().trim().min(1)).max(100).optional(),
  confidence: z.number().optional(),
  mastery: z.number().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  status: memoryStatusSchema.optional(),
  version: z.number().int().positive().optional(),
  dataSource: memoryDataSourceSchema.optional(),
  notes: z.string().optional(),
  correctAnswer: z.string().optional(),
  questionNo: z.string().optional(),
  questionType: z.string().optional(),
  studentAnswer: z.string().optional(),
  source: z.string().optional(),
  sourceTextbookId: z.string().optional(),
  sourceTextbookPage: z.number().int().positive().optional(),
  sourceResourceIds: z.array(z.string().trim().min(1)).max(50).optional(),
  region: z.string().optional(),
  imageUrl: z.string().optional(),
  imageUrls: z.array(z.string().trim().min(1)).max(20).optional(),
  isMistake: z.boolean().optional(),
  wrongAnswer: z.string().optional(),
  errorReason: z.string().optional(),
  visualDescription: z.string().optional(),
  visualDescriptions: z.array(z.string()).optional(),
  analysisProcess: z.string().optional(),
  needsConfirmation: z.boolean().optional(),
  conflict: z.boolean().optional(),
  errorReasonCategory: z.string().optional(),
  evidence: z
    .object({
      sourceText: z.string().optional(),
      locationHint: z.string().optional(),
      keySentence: z.string().optional(),
    })
    .optional(),
  optionAnalysis: z.record(z.string(), z.string()).optional(),
  learningTask: z.string().optional(),
  transferExercises: z.array(z.string()).optional(),
  memoryCard: z
    .object({
      front: z.string().optional(),
      back: z.string().optional(),
    })
    .optional(),
  reviewPriority: z.enum(['high', 'medium', 'low', 'summary_only']).optional(),
  fsrs: z.any().optional(),
  embedding: z.array(z.number()).optional(),
  type: z.enum(['concept', 'qa', 'vocabulary']).optional(),
  collectionId: z.string().optional(),
  collectionName: z.string().optional(),
  vocabularyData: z
    .object({
      context: z.string().optional(),
      meaning: z.string().optional(),
      usage: z.string().optional(),
      mnemonics: z.string().optional(),
      synonyms: z.array(z.string()).optional(),
      originalSentence: z.string().optional(),
      confusions: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  lastReviewed: z.number().optional(),
  deletedAt: z.number().optional(),
}).passthrough();

export type MemoryCreateInput = z.input<typeof memoryCreateSchema>;
