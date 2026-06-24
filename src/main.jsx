import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import VoiceCloneWindow from './VoiceCloneWindow';
import './styles/index.css';

const isVoiceCloneWindow = window.location.hash === '#/voice-clone';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isVoiceCloneWindow ? <VoiceCloneWindow /> : <App />}
  </React.StrictMode>
);
