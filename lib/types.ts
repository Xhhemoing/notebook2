export type Subject = string;

export type MemoryFunction = string;
export type MemoryPurpose = string;
export type IngestionMode = 'quick' | 'image_pro' | 'exam';
export type ReviewGrade = 1 | 2 | 3 | 4;
export type ReviewMode = 'standard' | 'instant' | 'joint' | 'manual';
export type ResourceOrigin =
  | 'manual'
  | 'input_upload'
  | 'chat_upload'
  | 'textbook_upload'
  | 'resource_import'
  | 'derived';
export type ResourceRetentionPolicy = 'keep' | 'auto' | 'manual';
export type FeedbackTargetType = 'memory' | 'chat' | 'ingestion' | 'graph' | 'resource' | 'profile';
export type FeedbackSignalType =
  | 'workflow_used'
  | 'ingestion_regenerated'
  | 'memory_edited'
  | 'memory_deleted'
  | 'memory_promoted'
  | 'chat_helpful'
  | 'chat_inaccurate'
  | 'graph_helpful'
  | 'graph_inaccurate'
  | 'resource_pinned'
  | 'preference_note';
export type KnowledgeNodeKind = 'root' | 'module' | 'topic' | 'knowledge' | 'method';
export type AIPreset = 'quality' | 'balanced' | 'advanced';

export interface GraphScope {
  nodeId: string | null;
  subject: Subject;
  includeDescendants: boolean;
  includeRelated: boolean;
  updatedAt: number;
}

export interface FSRSData {
  due: number; // timestamp
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
}

export interface MemoryEvidence {
  sourceText?: string;
  locationHint?: string;
  keySentence?: string;
}

export interface MemoryCard {
  front?: string;
  back?: string;
}

export interface Memory {
  id: string;
  subject: Subject;
  version?: number;
  status?: 'draft' | 'active' | 'archived' | 'deleted';
  dataSource?: 'manual' | 'ai_parse' | 'ai_chat' | 'mistake_analysis' | 'textbook_extract' | 'import' | 'system';
  region?: string; // e.g., 'Beijing', 'National Paper 1'
  content: string; // Question stem or knowledge point
  correctAnswer?: string; // Standard answer
  questionNo?: string;
  questionType?: string; // e.g., 'multiple-choice', 'fill-in-the-blank', 'essay'
  studentAnswer?: string;
  source?: string; // e.g., '2023 Midterm Exam'
  sourceTextbookId?: string;
  sourceTextbookPage?: number;
  sourceResourceIds?: string[];
  qualityScore?: number; // 0-100 ingestion quality score
  qualityFlags?: string[]; // quality rule flags for diagnostics
  qualityRuleVersion?: number;
  functionType: MemoryFunction;
  purposeType: MemoryPurpose;
  knowledgeNodeIds: string[];
  ingestionMode?: IngestionMode;
  ingestionSessionId?: string;
  confidence: number; // 0-100, maps to FSRS retrievability
  mastery: number; // 0-100, maps to FSRS stability
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  lastReviewed?: number;
  notes?: string;
  sourceType: 'text' | 'image';
  imageUrl?: string;
  imageUrls?: string[];
  isMistake?: boolean;
  wrongAnswer?: string;
  errorReason?: string;
  visualDescription?: string;
  visualDescriptions?: string[];
  analysisProcess?: string;
  needsConfirmation?: boolean;
  conflict?: boolean;
  errorReasonCategory?: string;
  evidence?: MemoryEvidence;
  optionAnalysis?: Record<string, string>;
  learningTask?: string;
  transferExercises?: string[];
  memoryCard?: MemoryCard;
  reviewPriority?: 'high' | 'medium' | 'low' | 'summary_only';
  fsrs?: FSRSData;
  embedding?: number[]; // For RAG
  type?: 'concept' | 'qa' | 'vocabulary';
  collectionId?: string; // For grouping into "books" like Vocabulary Book
  collectionName?: string;
  vocabularyData?: {
    context?: string;
    meaning?: string;
    usage?: string;
    mnemonics?: string;
    synonyms?: string[];
    originalSentence?: string;
    confusions?: string[];
  };
}

export interface KnowledgeNode {
  id: string; // Hierarchical ID like "1.2.1"
  subject: Subject;
  version?: number;
  status?: 'active' | 'archived' | 'deleted';
  dataSource?: 'manual' | 'ai_parse' | 'ai_chat' | 'mistake_analysis' | 'textbook_extract' | 'import' | 'system';
  kind?: KnowledgeNodeKind;
  name: string;
  parentId: string | null;
  order: number; // Order within siblings
  updatedAt?: number;
  deletedAt?: number;
  correlation?: { [targetId: string]: number }; // Correlation score 0-1 with other nodes
  testingMethods?: string[]; // 考法
}

export interface CustomProvider {
  id: string;
  name: string;
  type: 'openai' | 'gemini';
  baseUrl?: string;
  apiKey: string;
  models: { id: string; name: string, isFavorite?: boolean }[];
}

export type RetrievalBackend = 'server-qdrant' | 'local-browser';
export type RetrievalFusionMode = 'dbsf' | 'rrf';
export type RetrievalRerankMode = 'cross-encoder' | 'late-interaction' | 'hybrid-only';
export type RetrievalDocumentKind = 'memory' | 'textbook_page' | 'resource_excerpt';
export type RetrievalProviderKind = 'openai' | 'http-json';

export interface RetrievalProviderConfig {
  enabled?: boolean;
  name?: string;
  provider: RetrievalProviderKind;
  url?: string;
  apiKey?: string;
  model?: string;
}

export interface RetrievalDocument {
  id: string;
  syncKey: string;
  kind: RetrievalDocumentKind;
  sourceId: string;
  chunkIndex: number;
  chunkCount?: number;
  title?: string;
  subject: Subject;
  text: string;
  nodeIds: string[];
  isMistake?: boolean;
  sourceResourceIds?: string[];
  sourceTextbookId?: string;
  sourceTextbookPage?: number;
  updatedAt: number;
  dense?: number[];
  sparse?: Record<string, number>;
  metadata: Record<string, unknown>;
}

export interface RetrievalScoreBreakdown {
  dense?: number;
  sparse?: number;
  fusion?: number;
  rerank?: number;
  lateInteraction?: number;
  final: number;
}

export interface RetrievalHit {
  id: string;
  document: RetrievalDocument;
  score: number;
  scoreBreakdown: RetrievalScoreBreakdown;
  matchReasons: string[];
}

export interface RetrievalIndexState {
  backend: RetrievalBackend;
  status: 'idle' | 'dirty' | 'syncing' | 'ready' | 'error';
  dirty: boolean;
  pendingDocumentCount: number;
  lastIndexedAt?: number;
  lastAttemptAt?: number;
  lastError?: string;
}

export interface ReviewEvent {
  id: string;
  memoryId: string;
  subject: Subject;
  rating: ReviewGrade;
  reviewedAt: number;
  elapsedDays: number;
  scheduledDays: number;
  previousState?: number;
  nextState?: number;
  stabilityBefore?: number;
  stabilityAfter?: number;
  difficultyBefore?: number;
  difficultyAfter?: number;
  mode: ReviewMode;
}

export interface FSRSProfile {
  id: string;
  subject: Subject;
  parameters: number[];
  desiredRetention: number;
  recommendedRetention: number;
  cmrrLowerBound: number;
  updatedAt?: number;
  optimizedAt?: number;
  eventCount: number;
  distinctMemoryCount: number;
  status: 'collecting' | 'optimized' | 'temporary' | 'error';
  notes?: string;
}

export interface CustomModel {
  id: string;
  name: string;
  provider: 'openai' | 'gemini';
  apiKey: string;
  baseUrl?: string;
  modelId: string;
}

export interface Settings {
  aiPreset?: AIPreset;
  parseModel: string;
  chatModel: string;
  graphModel: string;
  reviewModel: string;
  summaryModel?: string;    // Mistake summary & analysis
  translationModel?: string; // Translation / language tasks
  ragModel?: string;         // RAG semantic retrieval
  embeddingModel?: string;
  syncKey?: string; // Per-user key to scope D1 data, prevents conflicts in multi-user deployments
  homeworkPreferences?: string;
  userSymbols?: string; // Meaning of user symbols
  studentProfile?: string; // AI's perception of the student
  aiAttentionNotes?: string; // Manually curated instructions for AI
  feedbackLearningNotes?: string; // Auto-summarized from user feedback events
  dailyReviewLimit: number;
  reviewBatchSize: number;
  enableLogging: boolean;
  autoCleanupLogs?: boolean;
  logRetentionDays?: number;
  autoCleanupResources?: boolean;
  resourceAutoCleanupDays?: number;
  exportOptimizationIncludeImages?: boolean;
  minReviewDifficulty: number;
  maxReviewDifficulty: number;
  fontSize?: 'small' | 'base' | 'medium' | 'large';
  fsrsUpdateFrequency?: string;
  customModels?: CustomModel[]; // Legacy
  customProviders?: CustomProvider[];
  serverBackend?: RetrievalBackend;
  fusionMode?: RetrievalFusionMode;
  recallTopK?: number;
  rerankTopN?: number;
  rerankMode?: RetrievalRerankMode;
  rerankerProvider?: RetrievalProviderConfig;
  lateInteractionProvider?: RetrievalProviderConfig;
  fsrsDesiredRetention?: number;
  syncInterval: number; // in seconds, 0 means manual only
  enableAutoSync: boolean;
}

export interface AILog {
  id: string;
  timestamp: number;
  type: 'parse' | 'chat' | 'graph' | 'review' | 'ingestion' | 'profile' | 'cleanup';
  model: string;
  prompt: string;
  response: string;
  promptVersion?: string;
  targetId?: string;
  durationMs?: number;
  qualityScore?: number;
  qualitySummary?: string;
  qualityIssues?: string[];
  subject?: Subject;
  sessionId?: string;
  workflow?: IngestionMode | 'chat';
  resourceIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface TextbookAnnotationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextbookAnnotation {
  id: string;
  pageNumber: number;
  type: 'highlight' | 'note' | 'memory' | 'focus' | 'review';
  text?: string;
  note?: string;
  color?: string;
  createdAt: number;
  updatedAt?: number;
  startOffset?: number;
  endOffset?: number;
  sectionId?: string;
  tags?: string[];
  box?: TextbookAnnotationBox;
}

export interface TextbookTOCItem {
  id: string;
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  confidence: number;
  children: TextbookTOCItem[];
  summary?: string;
  highlight?: 'normal' | 'focus' | 'needs_review';
}

export interface TextbookGraphNode {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  level: number;
  confidence: number;
  kind: 'chapter' | 'section' | 'topic' | 'knowledge';
  startPage?: number;
  endPage?: number;
  sourceSectionId?: string;
}

export interface TextbookSectionStudyStats {
  sectionId: string;
  mastery: number;
  readPages: number;
  annotationCount: number;
  quizCount: number;
  status: 'new' | 'studying' | 'reviewing' | 'mastered';
  lastVisitedAt?: number;
}

export interface TextbookStudyStats {
  lastOpenedPage?: number;
  lastOpenedSectionId?: string;
  readPageNumbers: number[];
  totalAnnotations: number;
  totalHighlights: number;
  totalQuizCount: number;
  sectionProgress: Record<string, TextbookSectionStudyStats>;
}

export interface TextbookQuizConfig {
  scopeType: 'chapter' | 'section' | 'custom';
  sectionId?: string;
  pageRange?: {
    start: number;
    end: number;
  };
  depth: 'basic' | 'standard' | 'deep';
  adaptive: boolean;
  questionTypes: Array<'single_choice' | 'true_false'>;
}

export interface TextbookQuizQuestion {
  id: string;
  type: 'single_choice' | 'true_false';
  prompt: string;
  options?: string[];
  answer: string;
  explanation?: string;
  relatedPageNumbers?: number[];
  relatedSectionIds?: string[];
  source: 'textbook' | 'hybrid';
}

export interface TextbookPage {
  id: string;
  pageNumber: number;
  content: string;
  imageUrl: string;
  confidence?: number;
  sectionIds?: string[];
  annotations?: TextbookAnnotation[];
  embedding?: number[];
}

export interface Textbook {
  id: string;
  name: string;
  subject: Subject;
  version?: number;
  status?: 'active' | 'archived' | 'deleted';
  dataSource?: 'manual' | 'ai_parse' | 'ai_chat' | 'mistake_analysis' | 'textbook_extract' | 'import' | 'system';
  fileId?: string; // IDB key for the raw file
  fileType?: string; // e.g., 'application/pdf'
  totalPages?: number;
  pages: TextbookPage[]; // Cached pages or pre-rendered pages
  framework?: KnowledgeNode[]; // AI generated framework
  processingStatus?: 'uploading' | 'processing' | 'ready' | 'needs_review' | 'failed';
  toc?: TextbookTOCItem[];
  textbookGraph?: TextbookGraphNode[];
  studyStats?: TextbookStudyStats;
  entryMode?: 'result' | 'workspace';
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface ReviewPlanItem {
  id: string;
  title: string;
  content: string;
  type: 'knowledge' | 'exercise' | 'summary';
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'completed';
  relatedNodeIds: string[];
}

export interface ReviewPlan {
  id: string;
  subject: Subject;
  createdAt: number;
  items: ReviewPlanItem[];
  analysis: string; // AI's analysis of weak points
}

export interface InputHistoryItem {
  id: string;
  timestamp: number;
  subject: Subject;
  workflow: IngestionMode;
  input: string;
  images: string[];
  imageResourceIds?: string[];
  supplementaryInstruction?: string;
  parsedItems: any[];
  newNodes: any[];
  deletedNodeIds: string[];
  aiAnalysis: string;
  identifiedSubject: string;
  savedMemoryIds?: string[];
  options?: Record<string, unknown>;
}

export interface Resource {
  id: string;
  name: string;
  version?: number;
  status?: 'active' | 'archived' | 'deleted';
  dataSource?: 'manual' | 'ai_parse' | 'ai_chat' | 'mistake_analysis' | 'textbook_extract' | 'import' | 'system';
  type: string; // 'folder', 'pdf', 'image', 'doc', 'other'
  size: number;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  data?: string; // base64 for local, URL for remote
  subject: Subject;
  origin?: ResourceOrigin;
  retentionPolicy?: ResourceRetentionPolicy;
  expiresAt?: number;
  pinnedAt?: number;
  lastAccessedAt?: number;
  description?: string;
  tags?: string[];
  parentId?: string | null;
  isFolder?: boolean;
}

export interface UserFeedbackEvent {
  id: string;
  timestamp: number;
  subject: Subject;
  targetType: FeedbackTargetType;
  targetId?: string;
  signalType: FeedbackSignalType;
  sentiment: 'positive' | 'negative' | 'neutral';
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncMemoryConflict {
  id: string;
  memoryId: string;
  localMemory: Memory;
  remoteMemory: Memory;
  detectedAt: number;
}

export type LinkEntityType = 'memory' | 'node' | 'textbook' | 'resource';

export interface Link {
  id: string;
  fromType: LinkEntityType;
  fromId: string;
  toType: LinkEntityType;
  toId: string;
  relationType: 'memory_node' | 'memory_textbook' | 'memory_resource' | 'node_parent';
  score?: number; // 0-1 confidence
  isDerived?: boolean; // true means auto-generated from system rules
  source?: 'system' | 'manual' | 'ai';
  createdAt: number;
  updatedAt?: number;
}

export interface AppState {
  currentSubject: Subject;
  memories: Memory[];
  knowledgeNodes: KnowledgeNode[];
  links: Link[];
  textbooks: Textbook[];
  reviewPlans: ReviewPlan[];
  reviewEvents: ReviewEvent[];
  fsrsProfiles: FSRSProfile[];
  retrievalIndex: RetrievalIndexState;
  activeGraphScope: GraphScope;
  settings: Settings;
  lastSynced?: number;
  logs: AILog[];
  feedbackEvents: UserFeedbackEvent[];
  lastNodesState?: KnowledgeNode[]; // For one-level undo
  inputHistory: InputHistoryItem[];
  draftInput?: string;
  draftImages?: string[];
  draftChatQuery?: string;
  draftGraphProposal?: { reasoning: string; operations: any[] } | null;
  resources: Resource[];
  syncConflicts: SyncMemoryConflict[];
}

export type Action =
  | { type: 'SET_SUBJECT'; payload: Subject }
  | { type: 'SET_ACTIVE_GRAPH_SCOPE'; payload: Partial<GraphScope> | null }
  | { type: 'ADD_MEMORY'; payload: Memory }
  | { type: 'UPDATE_MEMORY'; payload: Memory }
  | { type: 'DELETE_MEMORY'; payload: string }
  | { type: 'ADD_NODE'; payload: KnowledgeNode }
  | { type: 'UPDATE_NODE'; payload: KnowledgeNode }
  | { type: 'DELETE_NODE'; payload: string }
  | { type: 'BATCH_ADD_MEMORIES'; payload: Memory[] }
  | { type: 'BATCH_UPSERT_MEMORIES_FROM_SYNC'; payload: Memory[] }
  | { type: 'BATCH_ADD_NODES'; payload: KnowledgeNode[] }
  | { type: 'BATCH_UPSERT_NODES_FROM_SYNC'; payload: KnowledgeNode[] }
  | { type: 'BATCH_DELETE_NODES'; payload: string[] }
  | { type: 'ADD_TEXTBOOK'; payload: Textbook }
  | { type: 'UPDATE_TEXTBOOK'; payload: Textbook }
  | { type: 'DELETE_TEXTBOOK'; payload: string }
  | { type: 'ADD_REVIEW_PLAN'; payload: ReviewPlan }
  | { type: 'UPDATE_REVIEW_PLAN'; payload: ReviewPlan }
  | { type: 'DELETE_REVIEW_PLAN'; payload: string }
  | { type: 'ADD_REVIEW_EVENT'; payload: ReviewEvent }
  | { type: 'BATCH_UPSERT_REVIEW_EVENTS_FROM_SYNC'; payload: ReviewEvent[] }
  | { type: 'UPSERT_FSRS_PROFILE'; payload: FSRSProfile }
  | { type: 'BATCH_UPSERT_FSRS_PROFILES_FROM_SYNC'; payload: FSRSProfile[] }
  | { type: 'SET_RETRIEVAL_INDEX_STATE'; payload: Partial<RetrievalIndexState> }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'SET_CORRELATIONS'; payload: KnowledgeNode[] }
  | { type: 'SET_LAST_SYNCED'; payload: number }
  | { type: 'SET_LAST_SYNC'; payload: number }
  | { type: 'UPSERT_SYNC_CONFLICTS'; payload: SyncMemoryConflict[] }
  | { type: 'RESOLVE_SYNC_CONFLICT'; payload: { memoryId: string; strategy: 'keep_local' | 'use_remote' | 'merge'; mergedFields?: Partial<Pick<Memory, 'content' | 'notes' | 'correctAnswer' | 'errorReason'>> } }
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'ADD_LOG'; payload: Omit<AILog, 'id' | 'timestamp'> & { id?: string; timestamp?: number } }
  | { type: 'CLEAR_LOGS' }
  | { type: 'ADD_FEEDBACK_EVENT'; payload: UserFeedbackEvent }
  | { type: 'DELETE_FEEDBACK_EVENT'; payload: string }
  | { type: 'SAVE_NODES_STATE' }
  | { type: 'UNDO_NODES' }
  | { type: 'ADD_INPUT_HISTORY'; payload: InputHistoryItem }
  | { type: 'DELETE_INPUT_HISTORY'; payload: string }
  | { type: 'DELETE_MEMORIES_BY_FUNCTION'; payload: { subject: Subject; functionType: string } }
  | { type: 'BATCH_DELETE_MEMORIES'; payload: string[] }
  | { type: 'BATCH_DELETE_TEXTBOOKS'; payload: string[] }
  | { type: 'DELETE_SUBJECT_DATA'; payload: { subject: Subject } }
  | { type: 'DELETE_SUBJECT_NODES'; payload: { subject: Subject } }
  | { type: 'DELETE_SUBJECT_MISTAKES'; payload: { subject: Subject } }
  | { type: 'DELETE_SUBJECT_TEXTBOOKS'; payload: { subject: Subject } }
  | { type: 'UPDATE_DRAFT'; payload: { draftInput?: string; draftImages?: string[]; draftChatQuery?: string; draftGraphProposal?: { reasoning: string; operations: any[] } | null; } }
  | { type: 'ADD_RESOURCE'; payload: Resource }
  | { type: 'BATCH_ADD_RESOURCES'; payload: Resource[] }
  | { type: 'UPDATE_RESOURCE'; payload: Resource }
  | { type: 'DELETE_RESOURCE'; payload: string }
  | { type: 'BATCH_DELETE_RESOURCES'; payload: string[] }
  | { type: 'SET_RESOURCES'; payload: Resource[] }
  | { type: 'ADD_LINK'; payload: Link }
  | { type: 'BATCH_ADD_LINKS'; payload: Link[] }
  | { type: 'DELETE_LINK'; payload: string }
  | { type: 'REMOVE_DRAFT_PROPOSAL'; payload: string }
  | { type: 'RUN_AUTO_CLEANUP'; payload?: { now?: number } };
