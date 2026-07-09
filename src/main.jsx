import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import VoiceCloneWindow from './VoiceCloneWindow';
import ProjectSettingsWindow from './ProjectSettingsWindow';
import './styles/index.css';

const hash = window.location.hash;
const isVoiceCloneWindow = hash === '#/voice-clone';
const isSettingsWindow = hash === '#/settings';

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
    {renderContent()}
  </React.StrictMode>
);
