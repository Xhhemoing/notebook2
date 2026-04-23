'use client';

import { KnowledgeNode, Memory, Settings, Textbook, TextbookAnnotation } from '@/lib/types';
import { TextbookReader } from './TextbookReader';
import { TextbookStudyPanel } from './TextbookStudyPanel';

export function TextbookWorkspace({
  textbook,
  currentPageIndex,
  onPageChange,
  onCreateAnnotation,
  memories,
  knowledgeNodes,
  settings,
  intent,
  onIntentHandled,
  onJumpToPage,
  onQuizGenerated,
  onSyncRequest,
  activeSectionId,
  logCallback,
}: {
  textbook: Textbook;
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  onCreateAnnotation: (input: {
    type: TextbookAnnotation['type'];
    text: string;
    note?: string;
    startOffset?: number;
    endOffset?: number;
  }) => Promise<void> | void;
  memories: Memory[];
  knowledgeNodes: KnowledgeNode[];
  settings: Settings;
  intent: 'guide' | 'quiz' | 'issues' | 'sync' | null;
  onIntentHandled: () => void;
  onJumpToPage: (pageNumber: number) => void;
  onQuizGenerated: (sectionId?: string | null) => void;
  onSyncRequest: () => void;
  activeSectionId?: string | null;
  logCallback?: (log: any) => void;
}) {
  return (
    <div className="flex-1 min-w-0 flex">
      <TextbookReader
        textbook={textbook}
        currentPageIndex={currentPageIndex}
        onPageChange={onPageChange}
        onCreateAnnotation={onCreateAnnotation}
      />
      <TextbookStudyPanel
        textbook={textbook}
        activeSectionId={activeSectionId}
        memories={memories}
        knowledgeNodes={knowledgeNodes}
        settings={settings}
        intent={intent}
        onIntentHandled={onIntentHandled}
        onJumpToPage={onJumpToPage}
        onQuizGenerated={onQuizGenerated}
        onSyncRequest={onSyncRequest}
        logCallback={logCallback}
      />
    </div>
  );
}
