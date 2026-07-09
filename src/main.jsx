import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';

const hash = window.location.hash;
const isVoiceCloneWindow = hash === '#/voice-clone';
const isSettingsWindow = hash === '#/settings';

const App = React.lazy(() => import('./App'));
const VoiceCloneWindow = React.lazy(() => import('./VoiceCloneWindow'));
const ProjectSettingsWindow = React.lazy(() => import('./ProjectSettingsWindow'));

const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0a0a0f',
    color: '#555',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px'
  }}>
    Loading...
  </div>
);

const renderContent = () => {
  if (isVoiceCloneWindow) {
    return <VoiceCloneWindow />;
  }
  if (isSettingsWindow) {
    return <ProjectSettingsWindow />;
  }
  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<LoadingFallback />}>
      {renderContent()}
    </Suspense>
  </React.StrictMode>
);
