import React, { useState } from 'react';
import { useProject } from '../store/ProjectContext';

const getVideoDuration = (dataUrl) => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = dataUrl;
    video.onloadedmetadata = () => {
      resolve(video.duration);
    };
    video.onerror = () => {
      resolve(0);
    };
  });
};

/**
 * Media Library Panel - holds imported video clips, character PNGs, and audio
 */
export default function MediaLibrary() {
  const { state, actions } = useProject();
  const [activeTab, setActiveTab] = useState('all');
  const [optimizing, setOptimizing] = useState({});

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'video', label: 'Video' },
    { id: 'image', label: 'Images' },
    { id: 'audio', label: 'Audio' },
  ];

  const filteredMedia = activeTab === 'all'
    ? state.mediaItems
    : state.mediaItems.filter(m => m.type === activeTab);

  const handleImport = async () => {
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFileDialog();
      if (paths && paths.length > 0) {
        for (const filePath of paths) {
          const fileData = await window.electronAPI.getFileInfo(filePath);
          if (fileData.error) continue;
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
          actions.addToast(`Imported: ${fileData.name}`, 'success');
        }
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*,image/*';
      input.onchange = async (e) => {
        for (const file of e.target.files) {
          const dataUrl = await readFileAsDataUrl(file);
          const ext = '.' + file.name.split('.').pop().toLowerCase();
          const item = {
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            path: file.name,
            ext,
            dataUrl,
            type: getMediaType(ext),
          };
          actions.addMedia(item);
          actions.addToast(`Imported: ${file.name}`, 'success');
        }
      };
      input.click();
    }
  };

  const handleOptimizeVideo = async (item) => {
    if (!window.electronAPI) {
      actions.addToast('Optimization requires the desktop app.', 'error');
      return;
    }

    setOptimizing(prev => ({ ...prev, [item.id]: 0 }));
    actions.addToast(`Optimizing "${item.name}" for instant seek...`, 'info');

    try {
      // Get video duration
      let duration = item.duration;
      if (!duration) {
        duration = await getVideoDuration(item.dataUrl);
      }

      // Setup progress listener
      window.electronAPI.onOptimizeProgress((data) => {
        if (data && data.filePath === item.path && typeof data.percent === 'number') {
          setOptimizing(prev => ({ ...prev, [item.id]: data.percent }));
        }
      });

      // Call optimizeVideo IPC
      const result = await window.electronAPI.optimizeVideo({
        filePath: item.path,
        duration: duration || 0
      });

      window.electronAPI.removeOptimizeProgress();

      if (result.success) {
        // Add the optimized item to the media library using its local path URL directly
        const optimizedItem = {
          id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: `${item.name.split('.')[0]}_optimized.mp4`,
          path: result.outputPath,
          ext: '.mp4',
          dataUrl: `file:///${result.outputPath.replace(/\\/g, '/')}`,
          type: 'video',
          duration: duration
        };

        actions.addMedia(optimizedItem);
        actions.addToast(`Optimization complete! Created "${optimizedItem.name}"`, 'success');
      } else {
        actions.addToast(`Optimization failed: ${result.error?.substring(0, 100)}`, 'error');
      }
    } catch (err) {
      actions.addToast(`Optimization error: ${err.message}`, 'error');
    } finally {
      setOptimizing(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleDragStart = (e, item) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleSetAsBackground = (item) => {
    actions.setBackgroundVideo(item);
    actions.addToast(`Set "${item.name}" as background`, 'success');
  };

  const handleSetAsAudio = (item) => {
    actions.setAudio(item);
    actions.addToast(`Set "${item.name}" as dialogue audio`, 'success');
  };

  const handleAssignToCharacter = (item) => {
    // Open a character assignment selector
    const charId = state.characters.length > 0 ? state.characters[0].id : null;
    if (charId) {
      actions.assignCharacterAsset(charId, item);
      actions.addToast(`Assigned "${item.name}" to ${state.characters[0].name}`, 'success');
    }
  };

  return (
    <div className="media-library panel">
      <div className="panel__header">
        <span className="panel__title">Media Library</span>
        <div className="panel__actions">
          <button className="panel__action-btn" onClick={handleImport} title="Import Files">
            +
          </button>
        </div>
      </div>

      <div className="media-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`media-tab ${activeTab === tab.id ? 'media-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel__body">
        {filteredMedia.length === 0 ? (
          <div className="media-drop-zone" onClick={handleImport}>
            <span className="media-drop-zone__icon">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </span>
            <span className="media-drop-zone__text">Import media files</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-disabled)' }}>
              Video, Images, Audio
            </span>
          </div>
        ) : (
          <div className="media-grid">
            {filteredMedia.map(item => (
              <div
                key={item.id}
                className={`media-item ${item.type === 'image' ? 'media-item--character' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                }}
              >
                {item.type === 'video' && (
                  <>
                    <video className="media-item__thumb" src={item.dataUrl} muted />
                    <div className="media-item__label">{item.name}</div>
                    
                    {optimizing[item.id] !== undefined ? (
                      <div
                        style={{
                          position: 'absolute', bottom: 4, left: 4, right: 4,
                          background: 'rgba(0,0,0,0.85)', borderRadius: 4,
                          padding: '3px 4px', fontSize: '9px', color: '#00e5ff',
                          textAlign: 'center', zIndex: 10
                        }}
                      >
                        Optimizing... {optimizing[item.id]}%
                      </div>
                    ) : (
                      !item.name.toLowerCase().includes('_optimized') && (
                        <button
                          style={{
                            position: 'absolute', bottom: 4, left: 4,
                            background: 'rgba(0,184,212,0.85)', border: 'none',
                            borderRadius: 4, padding: '3px 6px', fontSize: '10px',
                            color: 'white', cursor: 'pointer', fontWeight: 'bold',
                            zIndex: 10, display: 'flex', alignItems: 'center', gap: 2
                          }}
                          onClick={(e) => { e.stopPropagation(); handleOptimizeVideo(item); }}
                          title="Optimize seek speed"
                        >
                          ⚡ Optimize
                        </button>
                      )
                    )}

                    <div
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.6)', borderRadius: 4,
                        padding: '2px 6px', fontSize: '10px', cursor: 'pointer',
                        color: '#00e5ff',
                        zIndex: 10
                      }}
                      onClick={(e) => { e.stopPropagation(); handleSetAsBackground(item); }}
                      title="Set as background"
                    >
                      BG
                    </div>
                  </>
                )}
                {item.type === 'image' && (
                  <>
                    <img className="media-item__thumb" src={item.dataUrl} alt={item.name} />
                    <div className="media-item__label">{item.name}</div>
                  </>
                )}
                {item.type === 'audio' && (
                  <>
                    <div className="media-item__icon">
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                    <div className="media-item__label">{item.name}</div>
                    <div
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.6)', borderRadius: 4,
                        padding: '3px 6px', fontSize: '10px', cursor: 'pointer',
                        color: '#00e5ff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      onClick={(e) => { e.stopPropagation(); handleSetAsAudio(item); }}
                      title="Set as dialogue audio"
                    >
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 3v18l-5-5H3V8h4l5-5z"/></svg>
                    </div>
                  </>
                )}
              </div>
            ))}
            <div className="media-drop-zone" onClick={handleImport} style={{ gridColumn: 'span 2', minHeight: 60 }}>
              <span className="media-drop-zone__icon" style={{ fontSize: '1.2rem' }}>+</span>
              <span className="media-drop-zone__text" style={{ fontSize: 'var(--text-xs)' }}>Add more</span>
            </div>
          </div>
        )}
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
