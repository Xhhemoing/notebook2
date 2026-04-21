'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppProvider, useAppContext } from '../lib/store';
import { GlobalAIChatProvider } from '../lib/ai-chat-context';
import { GlobalAIPanel } from '../components/GlobalAIPanel';
import { Sidebar, View } from '../components/Sidebar';
import { SubjectSelector } from '../components/SubjectSelector';
import { Dashboard } from '../components/Dashboard';
import { InputSection } from '../components/InputSection';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { MemoryBank } from '../components/MemoryBank';
import { MistakeBook } from '../components/MistakeBook';
import { AIChat } from '../components/AIChat';
import { Settings } from '../components/Settings';
import { ReviewSection } from '../components/ReviewSection';
import { TextbookModule } from '../components/TextbookModule';
import { ResourceLibrary } from '../components/ResourceLibrary';
import { clsx } from 'clsx';

function MainLayout({ currentView, setCurrentView }: { currentView: View, setCurrentView: (v: View) => void }) {
  const { state } = useAppContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mountedViews, setMountedViews] = useState<View[]>(['dashboard']);

  useEffect(() => {
    const fontSizeMap: Record<string, string> = {
      small: '12px',
      base: '14px',
      medium: '16px',
      large: '18px'
    };
    const fontSize = fontSizeMap[state.settings.fontSize || 'base'] || '14px';
    document.documentElement.style.setProperty('--base-font-size', fontSize);
  }, [state.settings.fontSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMountedViews((previous) => (previous.includes(currentView) ? previous : [...previous, currentView]));
  }, [currentView]);

  const viewOrder = useMemo<View[]>(
    () => ['dashboard', 'textbooks', 'resources', 'input', 'graph', 'memory', 'mistakes', 'review', 'chat', 'settings'],
    []
  );

  const renderView = (view: View) => {
    switch (view) {
      case 'dashboard':
        return <Dashboard />;
      case 'textbooks':
        return <TextbookModule />;
      case 'resources':
        return <ResourceLibrary />;
      case 'input':
        return <InputSection />;
      case 'graph':
        return <KnowledgeGraph />;
      case 'memory':
        return <MemoryBank />;
      case 'mistakes':
        return <MistakeBook />;
      case 'review':
        return <ReviewSection />;
      case 'chat':
        return <AIChat />;
      case 'settings':
        return <Settings />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-black font-sans overflow-hidden text-slate-200">
      <Sidebar 
        currentView={currentView} 
        setView={(v) => { setCurrentView(v); setIsMobileMenuOpen(false); }} 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <SubjectSelector onMenuClick={() => setIsMobileMenuOpen(true)} />
        <div className="flex-1 relative overflow-hidden">
          {viewOrder.map((view) => {
            if (!mountedViews.includes(view)) return null;

            const isActive = currentView === view;
            return (
              <section
                key={view}
                aria-hidden={!isActive}
                className={clsx(
                  'absolute inset-0',
                  isActive ? 'block' : 'hidden'
                )}
              >
                <div className="h-full overflow-hidden flex flex-col">{renderView(view)}</div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [currentView, setCurrentView] = useState<View>('dashboard');

  return (
    <AppProvider>
      <GlobalAIChatProvider>
        <MainLayout currentView={currentView} setCurrentView={setCurrentView} />
        <GlobalAIPanel />
      </GlobalAIChatProvider>
    </AppProvider>
  );
}
