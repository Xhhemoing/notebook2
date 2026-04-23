import {
  KnowledgeNode,
  Textbook,
  TextbookAnnotation,
  TextbookGraphNode,
  TextbookPage,
  TextbookQuizConfig,
  TextbookStudyStats,
  TextbookTOCItem,
} from './types';

const CHAPTER_PATTERN = /^第[一二三四五六七八九十百千万0-9]+[章单元篇部分课]/;
const NUMBERED_PATTERN = /^(\d+(?:\.\d+){0,2})[\s、.．-]+/;
const CN_NUMBERED_PATTERN = /^([一二三四五六七八九十]+)、/;
const BRACKET_PATTERN = /^[（(]([一二三四五六七八九十0-9]+)[)）]/;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function flattenTOC(items: TextbookTOCItem[]): TextbookTOCItem[] {
  return items.flatMap((item) => [item, ...flattenTOC(item.children || [])]);
}

export function flattenTextbookTOC(items: TextbookTOCItem[]) {
  return flattenTOC(items);
}

function normalizeTitle(raw: string | undefined, fallback: string) {
  const value = (raw || '').replace(/\s+/g, ' ').trim();
  return value || fallback;
}

function inferHeadingLevel(line: string) {
  if (CHAPTER_PATTERN.test(line)) return 1;
  const numberedMatch = line.match(NUMBERED_PATTERN);
  if (numberedMatch) {
    const parts = numberedMatch[1].split('.');
    return clamp(parts.length, 1, 3);
  }
  if (CN_NUMBERED_PATTERN.test(line) || BRACKET_PATTERN.test(line)) return 2;
  return 0;
}

function inferHeadingConfidence(line: string) {
  let score = 72;
  if (CHAPTER_PATTERN.test(line)) score += 18;
  if (NUMBERED_PATTERN.test(line)) score += 12;
  if (CN_NUMBERED_PATTERN.test(line) || BRACKET_PATTERN.test(line)) score += 8;
  if (line.length > 28) score -= 10;
  return clamp(score, 35, 96);
}

function extractPageHeading(page: TextbookPage) {
  const lines = page.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    const level = inferHeadingLevel(line);
    if (!level) continue;
    return {
      title: line.replace(/\s+/g, ' ').trim(),
      level,
      confidence: inferHeadingConfidence(line),
    };
  }

  return null;
}

export function inferTextbookPageConfidence(page: Pick<TextbookPage, 'content'>) {
  const content = page.content?.trim() || '';
  if (!content) return 18;

  const length = content.length;
  const weirdChars = (content.match(/[□�]/g) || []).length;
  let score = 52;
  if (length > 80) score += 14;
  if (length > 180) score += 12;
  if (length > 360) score += 8;
  if (length < 40) score -= 18;
  if (length < 18) score -= 25;
  if (weirdChars > 0) score -= Math.min(18, weirdChars * 3);
  return clamp(score, 12, 98);
}

export function buildFallbackTOC(textbookName: string, totalPages: number): TextbookTOCItem[] {
  return [
    {
      id: 'section:all',
      title: `${normalizeTitle(textbookName, '课本')} 全文`,
      level: 1,
      startPage: 1,
      endPage: Math.max(1, totalPages),
      confidence: 42,
      children: [],
      highlight: 'needs_review',
      summary: '未识别到稳定目录，当前按整本课本检索和阅读。',
    },
  ];
}

export function buildTextbookTOC(textbookName: string, pages: TextbookPage[]): TextbookTOCItem[] {
  const totalPages = Math.max(1, pages.length);
  const candidates = pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      heading: extractPageHeading(page),
    }))
    .filter((item) => item.heading);

  if (candidates.length === 0) {
    return buildFallbackTOC(textbookName, totalPages);
  }

  const root: TextbookTOCItem[] = [];
  const stack: TextbookTOCItem[] = [];

  for (const candidate of candidates) {
    const heading = candidate.heading!;
    const title = normalizeTitle(heading.title, `第 ${candidate.pageNumber} 页`);
    const previous = stack[stack.length - 1];
    if (previous && previous.title === title && previous.startPage === candidate.pageNumber) {
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      const closed = stack.pop();
      if (closed) {
        closed.endPage = Math.max(closed.startPage, candidate.pageNumber - 1);
      }
    }

    const item: TextbookTOCItem = {
      id: `section:${candidate.pageNumber}:${root.length + stack.length + 1}`,
      title,
      level: heading.level,
      startPage: candidate.pageNumber,
      endPage: candidate.pageNumber,
      confidence: heading.confidence,
      children: [],
      highlight: heading.confidence < 60 ? 'needs_review' : 'normal',
    };

    if (stack.length === 0) {
      root.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }

    stack.push(item);
  }

  while (stack.length > 0) {
    const item = stack.pop();
    if (item) {
      item.endPage = totalPages;
    }
  }

  return root.length > 0 ? root : buildFallbackTOC(textbookName, totalPages);
}

export function getContainingSectionIds(items: TextbookTOCItem[], pageNumber: number): string[] {
  const matches: string[] = [];

  const visit = (node: TextbookTOCItem) => {
    if (pageNumber < node.startPage || pageNumber > node.endPage) return;
    matches.push(node.id);
    node.children.forEach(visit);
  };

  items.forEach(visit);
  return matches;
}

export function findTextbookSection(items: TextbookTOCItem[], sectionId?: string | null): TextbookTOCItem | null {
  if (!sectionId) return null;
  for (const item of items) {
    if (item.id === sectionId) return item;
    const child = findTextbookSection(item.children || [], sectionId);
    if (child) return child;
  }
  return null;
}

export function getPageRangeForSection(
  items: TextbookTOCItem[],
  sectionId?: string | null,
  fallbackEnd?: number
) {
  const section = findTextbookSection(items, sectionId);
  if (section) {
    return { start: section.startPage, end: section.endPage };
  }
  return { start: 1, end: Math.max(1, fallbackEnd || 1) };
}

export function buildTextbookGraph(
  toc: TextbookTOCItem[],
  framework?: KnowledgeNode[]
): TextbookGraphNode[] {
  if (framework && framework.length > 0) {
    return framework.map((node, index) => ({
      id: `framework:${node.id}`,
      name: node.name,
      parentId: node.parentId ? `framework:${node.parentId}` : null,
      order: node.order ?? index,
      level: node.id.split('.').length,
      confidence: 80,
      kind: node.parentId ? 'knowledge' : 'chapter',
    }));
  }

  const flat = flattenTOC(toc);
  return flat.map((item, index) => {
    const parentSectionId = findParentSectionId(toc, item.id);
    return {
      id: `toc:${item.id}`,
      name: item.title,
      parentId: item.level <= 1 || !parentSectionId ? null : `toc:${parentSectionId}`,
      order: index + 1,
      level: item.level,
      confidence: item.confidence,
      kind: item.level === 1 ? 'chapter' : item.level === 2 ? 'section' : 'topic',
      startPage: item.startPage,
      endPage: item.endPage,
      sourceSectionId: item.id,
    };
  });
}

function findParentSectionId(items: TextbookTOCItem[], childId: string, parentId: string | null = null): string | null {
  for (const item of items) {
    if (item.id === childId) return parentId;
    const nested = findParentSectionId(item.children || [], childId, item.id);
    if (nested !== null) return nested;
  }
  return null;
}

function buildEmptyStudyStats(toc: TextbookTOCItem[]): TextbookStudyStats {
  const sectionProgress = Object.fromEntries(
    flattenTOC(toc).map((section) => [
      section.id,
      {
        sectionId: section.id,
        mastery: 0,
        readPages: 0,
        annotationCount: 0,
        quizCount: 0,
        status: 'new' as const,
      },
    ])
  );

  return {
    readPageNumbers: [],
    totalAnnotations: 0,
    totalHighlights: 0,
    totalQuizCount: 0,
    sectionProgress,
  };
}

function mergeStudyStats(
  stats: TextbookStudyStats | undefined,
  toc: TextbookTOCItem[],
  pages: TextbookPage[]
): TextbookStudyStats {
  const base = stats ? { ...stats } : buildEmptyStudyStats(toc);
  const flatSections = flattenTOC(toc);

  base.readPageNumbers = uniq((base.readPageNumbers || []).filter((pageNumber) => pageNumber >= 1));
  base.sectionProgress = { ...(base.sectionProgress || {}) };

  for (const section of flatSections) {
    const current = base.sectionProgress[section.id] || {
      sectionId: section.id,
      mastery: 0,
      readPages: 0,
      annotationCount: 0,
      quizCount: 0,
      status: 'new' as const,
    };
    const sectionPages = pages.filter((page) => (page.sectionIds || []).includes(section.id));
    const annotationCount = sectionPages.reduce((sum, page) => sum + (page.annotations || []).length, 0);
    const readPages = sectionPages.filter((page) => base.readPageNumbers.includes(page.pageNumber)).length;
    const derivedMastery = clamp(
      Math.round(readPages * 10 + annotationCount * 12 + current.quizCount * 14),
      0,
      100
    );

    base.sectionProgress[section.id] = {
      ...current,
      sectionId: section.id,
      readPages,
      annotationCount,
      mastery: current.mastery > derivedMastery ? current.mastery : derivedMastery,
      status:
        derivedMastery >= 80
          ? 'mastered'
          : current.quizCount > 0
            ? 'reviewing'
            : readPages > 0 || annotationCount > 0
              ? 'studying'
              : 'new',
    };
  }

  base.totalAnnotations = pages.reduce((sum, page) => sum + (page.annotations || []).length, 0);
  base.totalHighlights = pages.reduce(
    (sum, page) => sum + (page.annotations || []).filter((annotation) => annotation.type === 'highlight').length,
    0
  );
  base.totalQuizCount = Object.values(base.sectionProgress).reduce((sum, section) => sum + section.quizCount, 0);

  return base;
}

function normalizeAnnotation(annotation: TextbookAnnotation, pageNumber: number, sectionId?: string): TextbookAnnotation {
  return {
    ...annotation,
    pageNumber: annotation.pageNumber || pageNumber,
    sectionId: annotation.sectionId || sectionId,
    color: annotation.color || (
      annotation.type === 'review'
        ? 'amber'
        : annotation.type === 'focus'
          ? 'rose'
          : annotation.type === 'memory'
            ? 'indigo'
            : 'cyan'
    ),
    tags: annotation.tags || [],
    createdAt: annotation.createdAt || Date.now(),
  };
}

function normalizePage(page: TextbookPage, toc: TextbookTOCItem[]): TextbookPage {
  const sectionIds = uniq(
    (page.sectionIds && page.sectionIds.length > 0 ? page.sectionIds : getContainingSectionIds(toc, page.pageNumber))
      .filter(Boolean)
  );

  return {
    ...page,
    content: page.content || '',
    imageUrl: page.imageUrl || '',
    confidence: page.confidence ?? inferTextbookPageConfidence(page),
    sectionIds,
    annotations: (page.annotations || []).map((annotation) =>
      normalizeAnnotation(annotation, page.pageNumber, sectionIds[sectionIds.length - 1])
    ),
  };
}

export function getTextbookIssueSummary(textbook: Textbook) {
  const pages = textbook.pages || [];
  const emptyPages = pages.filter((page) => !page.content?.trim()).map((page) => page.pageNumber);
  const lowConfidencePages = pages.filter((page) => (page.confidence || 0) < 55).map((page) => page.pageNumber);
  return {
    emptyPages,
    lowConfidencePages,
    hasIssues: emptyPages.length > 0 || lowConfidencePages.length > 0,
  };
}

export function normalizeTextbookForState(textbook: Textbook): Textbook {
  const totalPages = Math.max(textbook.totalPages || 0, textbook.pages?.length || 0, 1);
  const toc =
    textbook.toc && textbook.toc.length > 0
      ? textbook.toc
      : buildTextbookTOC(textbook.name, textbook.pages || []);
  const pages = (textbook.pages || [])
    .map((page) => normalizePage(page, toc))
    .sort((left, right) => left.pageNumber - right.pageNumber);
  const issueSummary = getTextbookIssueSummary({ ...textbook, pages });
  const studyStats = mergeStudyStats(textbook.studyStats, toc, pages);
  const processingStatus =
    textbook.processingStatus ||
    (issueSummary.hasIssues ? 'needs_review' : 'ready');

  return {
    ...textbook,
    totalPages,
    pages,
    toc,
    textbookGraph:
      textbook.textbookGraph && textbook.textbookGraph.length > 0
        ? textbook.textbookGraph
        : buildTextbookGraph(toc, textbook.framework),
    studyStats,
    processingStatus,
    entryMode: textbook.entryMode || 'workspace',
  };
}

export function prepareTextbookForImport(textbook: Textbook): Textbook {
  return normalizeTextbookForState({
    ...textbook,
    processingStatus: textbook.processingStatus,
    entryMode: textbook.entryMode || 'result',
  });
}

export function markTextbookPageVisited(textbook: Textbook, pageNumber: number, sectionId?: string | null): Textbook {
  const normalized = normalizeTextbookForState(textbook);
  const readPageNumbers = uniq([...(normalized.studyStats?.readPageNumbers || []), pageNumber]);
  const nextStats: TextbookStudyStats = {
    ...(normalized.studyStats || buildEmptyStudyStats(normalized.toc || [])),
    readPageNumbers,
    lastOpenedPage: pageNumber,
    lastOpenedSectionId: sectionId || normalized.studyStats?.lastOpenedSectionId,
  };

  if (sectionId && nextStats.sectionProgress[sectionId]) {
    nextStats.sectionProgress[sectionId] = {
      ...nextStats.sectionProgress[sectionId],
      lastVisitedAt: Date.now(),
    };
  }

  return normalizeTextbookForState({
    ...normalized,
    studyStats: nextStats,
    entryMode: 'workspace',
    updatedAt: Date.now(),
  });
}

export function upsertTextbookAnnotation(
  textbook: Textbook,
  pageNumber: number,
  annotation: TextbookAnnotation
): Textbook {
  const normalized = normalizeTextbookForState(textbook);
  const pages = normalized.pages.map((page) => {
    if (page.pageNumber !== pageNumber) return page;
    return {
      ...page,
      annotations: [...(page.annotations || []), normalizeAnnotation(annotation, pageNumber, annotation.sectionId || page.sectionIds?.[page.sectionIds.length - 1])],
    };
  });

  return normalizeTextbookForState({
    ...normalized,
    pages,
    entryMode: 'workspace',
    updatedAt: Date.now(),
  });
}

export function incrementSectionQuizCount(textbook: Textbook, sectionId?: string | null): Textbook {
  if (!sectionId) return normalizeTextbookForState(textbook);
  const normalized = normalizeTextbookForState(textbook);
  const current = normalized.studyStats?.sectionProgress?.[sectionId];
  if (!current) return normalized;

  return normalizeTextbookForState({
    ...normalized,
    studyStats: {
      ...(normalized.studyStats || buildEmptyStudyStats(normalized.toc || [])),
      sectionProgress: {
        ...(normalized.studyStats?.sectionProgress || {}),
        [sectionId]: {
          ...current,
          quizCount: current.quizCount + 1,
          lastVisitedAt: Date.now(),
        },
      },
    },
    updatedAt: Date.now(),
  });
}

export function getPagesForQuizScope(textbook: Textbook, config: TextbookQuizConfig): TextbookPage[] {
  const normalized = normalizeTextbookForState(textbook);
  let range = { start: 1, end: normalized.totalPages || normalized.pages.length || 1 };

  if (config.scopeType === 'section') {
    range = getPageRangeForSection(normalized.toc || [], config.sectionId, normalized.totalPages);
  } else if (config.scopeType === 'custom' && config.pageRange) {
    range = {
      start: clamp(config.pageRange.start, 1, normalized.totalPages || normalized.pages.length || 1),
      end: clamp(config.pageRange.end, 1, normalized.totalPages || normalized.pages.length || 1),
    };
  }

  return normalized.pages.filter((page) => page.pageNumber >= range.start && page.pageNumber <= range.end);
}

export function getSectionMastery(textbook: Textbook, sectionId?: string | null) {
  if (!sectionId) return 0;
  const normalized = normalizeTextbookForState(textbook);
  return normalized.studyStats?.sectionProgress?.[sectionId]?.mastery || 0;
}
