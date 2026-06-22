import React from 'react';

/**
 * Custom title bar with window controls (frameless Electron window)
 */
export default function TitleBar() {
  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  return (
    <div className="titlebar">
      <div className="titlebar__brand">
        <div className="titlebar__logo">VIBE</div>
        <span className="titlebar__name">VIBE-BR-Video Editor</span>
      </div>

      <div className="titlebar__controls">
        <button className="titlebar__btn" onClick={handleMinimize} title="Minimize">
          ─
        </button>
        <button className="titlebar__btn" onClick={handleMaximize} title="Maximize">
          □
        </button>
        <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} title="Close">
          ✕
        </button>
      </div>
    </div>
  );
}
