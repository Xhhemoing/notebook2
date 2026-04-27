import assert from 'node:assert/strict';
import test from 'node:test';

import { processTextbookPDF, shouldUsePageImageOcrForTextbookPdf } from './ai';
import type { CustomProvider, Settings } from './types';

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    parseModel: 'gemini-3-flash-preview',
    chatModel: 'gemini-3-flash-preview',
    graphModel: 'gemini-3-flash-preview',
    reviewModel: 'gemini-3-flash-preview',
    embeddingModel: 'text-embedding-004',
    dailyReviewLimit: 20,
    reviewBatchSize: 10,
    enableLogging: false,
    minReviewDifficulty: 0,
    maxReviewDifficulty: 100,
    syncInterval: 0,
    enableAutoSync: false,
    ...overrides,
  };
}

function createProvider(provider: CustomProvider['type']): CustomProvider {
  return {
    id: `${provider}-provider`,
    name: provider === 'openai' ? 'OpenAI' : 'Gemini',
    type: provider,
    apiKey: 'test-key',
    baseUrl: provider === 'openai' ? 'https://api.openai.com/v1' : undefined,
    models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }],
  };
}

test('shouldUsePageImageOcrForTextbookPdf detects OpenAI-compatible custom providers', () => {
  const settings = createSettings({
    parseModel: 'openai-provider:gpt-5.4',
    customProviders: [createProvider('openai')],
  });

  assert.equal(shouldUsePageImageOcrForTextbookPdf(settings.parseModel, settings), true);
});

test('shouldUsePageImageOcrForTextbookPdf keeps Gemini on native PDF OCR', () => {
  const settings = createSettings({
    parseModel: 'gemini-provider:gpt-5.4',
    customProviders: [createProvider('gemini')],
  });

  assert.equal(shouldUsePageImageOcrForTextbookPdf(settings.parseModel, settings), false);
});

test('processTextbookPDF returns empty result for OpenAI-compatible models so callers can fallback', async () => {
  const settings = createSettings({
    parseModel: 'openai-provider:gpt-5.4',
    customProviders: [createProvider('openai')],
  });

  const result = await processTextbookPDF('data:application/pdf;base64,AAAA', settings);
  assert.deepEqual(result, []);
});
