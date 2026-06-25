import React from 'react';
import { useProject } from '../store/ProjectContext';

/**
 * Main toolbar with editing tools and action buttons
 */
export default function Toolbar() {
  const { state, actions } = useProject();
  const { activeTool } = state;

  const [theme, setTheme] = React.useState(() => {
    return localStorage.getItem('theme') || 'default';
  });

  React.useEffect(() => {
    document.body.classList.remove('theme-dark-gay', 'theme-premiere');
    if (theme === 'dark-gay') {
      document.body.classList.add('theme-dark-gay');
    } else if (theme === 'premiere') {
      document.body.classList.add('theme-premiere');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleThemeToggle = () => {
    const themes = ['default', 'dark-gay', 'premiere'];
    setTheme(prev => {
      const currentIndex = themes.indexOf(prev);
      const nextIndex = (currentIndex + 1) % themes.length;
      return themes[nextIndex];
    });
  };

  const tools = [
    { id: 'select', label: 'Select', shortcut: 'V' },
    { id: 'cut', label: 'Cut', shortcut: 'C' },
    { id: 'hand', label: 'Hand', shortcut: 'H' },
  ];

  const renderToolIcon = (toolId) => {
    switch (toolId) {
      case 'select':
        return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>;
      case 'cut':
        return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>;
      case 'hand':
        return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5m4 0V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v3m4 0v1a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2v3"/></svg>;
      default:
        return null;
    }
  };

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'v': actions.setActiveTool('select'); break;
        case 'c': actions.setActiveTool('cut'); break;
        case 'h': actions.setActiveTool('hand'); break;
        case ' ':
          e.preventDefault();
          actions.setPlaying(!state.isPlaying);
          break;
        case 'delete':
        case 'backspace':
          if (state.selectedClipId) {
            // Handle clip deletion
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isPlaying, state.selectedClipId]);

  const handleImport = async () => {
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFileDialog();
      if (paths && paths.length > 0) {
        for (const filePath of paths) {
          const fileData = await window.electronAPI.getFileInfo(filePath);
          if (fileData.error) {
            actions.addToast(`Failed to import: ${fileData.error}`, 'error');
            continue;
          }
          const ext = fileData.ext;
          const type = getMediaType(ext);
          const item = {
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: fileData.name,
            path: fileData.path,
            ext,
            dataUrl: `file:///${fileData.path.replace(/\\/g, '/')}`,
            type,
          };
          actions.addMedia(item);
          
          // Auto-assign based on type
          if (item.type === 'audio' && !state.audioFile) {
            actions.setAudio(item);
          } else if (item.type === 'video' && !state.backgroundVideo) {
            actions.setBackgroundVideo(item);
          }
          
          actions.addToast(`Imported: ${fileData.name}`, 'success');
        }
      }
    } else {
      // Browser fallback: file input
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*,image/*';
      input.onchange = async (e) => {
        for (const file of e.target.files) {
          const dataUrl = await readFileAsDataUrl(file);
          const item = {
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            path: file.name,
            ext: '.' + file.name.split('.').pop().toLowerCase(),
            dataUrl,
            type: getMediaType('.' + file.name.split('.').pop().toLowerCase()),
          };
          actions.addMedia(item);
          
          if (item.type === 'audio' && !state.audioFile) {
            actions.setAudio(item);
          } else if (item.type === 'video' && !state.backgroundVideo) {
            actions.setBackgroundVideo(item);
          }
          
          actions.addToast(`Imported: ${file.name}`, 'success');
        }
      };
      input.click();
    }
  };

  const handleVoiceCloneOpen = async () => {
    if (window.electronAPI && window.electronAPI.setActiveProjectState) {
      await window.electronAPI.setActiveProjectState({
        characters: state.characters,
        dialogueBlocks: state.dialogueBlocks,
        voiceConfigs: state.voiceConfigs
      });
      window.electronAPI.openVoiceCloneWindow();
    } else {
      actions.addToast("Voice Cloning requires the desktop Electron environment.", "warning");
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        {tools.map(tool => (
          <button
            key={tool.id}
            className={`toolbar__btn ${activeTool === tool.id ? 'toolbar__btn--active' : ''}`}
            onClick={() => actions.setActiveTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            <span>{renderToolIcon(tool.id)}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar__group">
        <button className="toolbar__btn" onClick={handleImport} title="Import Media">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Import
        </button>
        <button className="toolbar__btn" onClick={handleVoiceCloneOpen} title="AI Voice Clone & TTS">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          Voice Clone
        </button>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button
          className="toolbar__btn"
          onClick={handleThemeToggle}
          title="Switch Theme (Default / Dark-Gay / Premiere Pro 2026)"
        >
          <span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C4.85857 19 4.47715 16 7 16C9.52285 16 10 18.5 10 20C10 21 11.5 22 12 22Z"/><circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="14.5" r="1.5" fill="currentColor"/></svg>
          </span>
          <span style={{ textTransform: 'capitalize' }}>Theme: {theme === 'premiere' ? 'Premiere' : theme === 'dark-gay' ? 'Dark-Gay' : 'Default'}</span>
        </button>
      </div>

      <div className="toolbar__group">
        <button
          className="toolbar__btn toolbar__btn--accent"
          onClick={() => actions.setShowExportModal(true)}
          title="Export Video"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
          Export
        </button>
      </div>
    </div>
  );
}

function getMediaType(ext) {
  const videoExts = ['.mp4', '.webm', '.avi', '.mov', '.mkv'];
  const audioExts = ['.mp3', '.wav', '.ogg'];
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (imageExts.includes(ext)) return 'image';
  return 'unknown';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}
