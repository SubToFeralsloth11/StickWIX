import { useEffect, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { HomeScreen } from './home/HomeScreen';
import { EditorPage } from './EditorPage';
import { useToast } from './toast';

/** `#/p/<projectId>` opens a project; anything else is the home screen. Reloading keeps you where you were. */
function readRoute(): string | null {
  const m = /^#\/p\/([\w-]+)$/.exec(location.hash);
  return m ? m[1]! : null;
}

export function openProject(id: string | null) {
  location.hash = id ? `#/p/${id}` : '#/';
}

function Toast() {
  const { message, error, seq } = useToast();
  if (!message) return null;
  return (
    <div key={seq} className={`toast ${error ? 'error' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function App() {
  const [projectId, setProjectId] = useState(readRoute);
  useEffect(() => {
    const on = () => setProjectId(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      {projectId ? <EditorPage key={projectId} projectId={projectId} /> : <HomeScreen />}
      <Toast />
    </Tooltip.Provider>
  );
}
