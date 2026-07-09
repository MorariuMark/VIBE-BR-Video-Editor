import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ProjectProvider, useProject } from './store/ProjectContext';
import TitleBar from './components/TitleBar';
import Toolbar from './components/Toolbar';
import MediaLibrary from './components/MediaLibrary';
import PreviewCanvas from './components/PreviewCanvas';
import ScriptEditor from './components/ScriptEditor';
import Timeline from './components/Timeline';
import ExportModal from './components/ExportModal';
import ToastContainer from './components/ToastContainer';

function AppContent() {
  const { state, actions } = useProject();
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);
  const [timelineHeight, setTimelineHeight] = useState(260);
  const [leftMinimized, setLeftMinimized] = useState(false);
  const [rightMinimized, setRightMinimized] = useState(false);
  const [savedLeftWidth, setSavedLeftWidth] = useState(280);
  const [savedRightWidth, setSavedRightWidth] = useState(380);
  const resizingRef = useRef(null);

  // ─── Panel Resizing ───
  const handleResizeStart = useCallback((e, panel) => {
    e.preventDefault();
    resizingRef.current = {
      panel,
      startX: e.clientX,
      startY: e.clientY,
      startLeftWidth: leftWidth,
      startRightWidth: rightWidth,
      startTimelineHeight: timelineHeight,
    };

    const handleMouseMove = (e) => {
      if (!resizingRef.current) return;
      const { panel, startX, startY, startLeftWidth, startRightWidth, startTimelineHeight } = resizingRef.current;

      if (panel === 'left') {
        const dx = e.clientX - startX;
        setLeftWidth(Math.max(200, Math.min(500, startLeftWidth + dx)));
      } else if (panel === 'right') {
        const dx = e.clientX - startX;
        setRightWidth(Math.max(280, Math.min(600, startRightWidth - dx)));
      } else if (panel === 'timeline') {
        const dy = e.clientY - startY;
        setTimelineHeight(Math.max(140, Math.min(500, startTimelineHeight - dy)));
      }
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = panel === 'timeline' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [leftWidth, rightWidth, timelineHeight]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.hasAttribute('contenteditable'))
      ) {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          actions.undo();
          actions.addToast('Undo', 'info');
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          actions.redo();
          actions.addToast('Redo', 'info');
        }
      } else {
        if (e.key === ' ') {
          e.preventDefault();
          actions.setPlaying(!state.isPlaying);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          if (state.selectedClipId) {
            let foundTrackId = null;
            for (const track of state.tracks) {
              if (track.clips.some(c => c.id === state.selectedClipId)) {
                foundTrackId = track.id;
                break;
              }
            }
            if (foundTrackId) {
              e.preventDefault();
              actions.removeClipFromTrack(foundTrackId, state.selectedClipId);
              actions.selectClip(null);
              actions.addToast('Clip deleted', 'info');
            }
          }
        } else if (e.key.toLowerCase() === 's') {
          if (state.selectedClipId) {
            let foundTrackId = null;
            let foundClip = null;
            for (const track of state.tracks) {
              const c = track.clips.find(clip => clip.id === state.selectedClipId);
              if (c) {
                foundTrackId = track.id;
                foundClip = c;
                break;
              }
            }
            if (foundTrackId && foundClip) {
              if (state.currentTime > foundClip.startTime && state.currentTime < foundClip.startTime + foundClip.duration) {
                e.preventDefault();
                actions.splitClip(foundTrackId, foundClip.id, state.currentTime);
                actions.addToast('Clip split successfully', 'success');
              }
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, state.isPlaying, state.selectedClipId, state.tracks, state.currentTime]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onTimelineVoicesUpdated) {
      window.electronAPI.onTimelineVoicesUpdated(async (payload) => {
        const voices = payload.voices || [];
        if (payload.voiceConfigs) {
          actions.setVoiceConfigs(payload.voiceConfigs);
        }
        if (payload.audioPath) {
          voices.push({ audioPath: payload.audioPath, characterName: 'voiceover' });
        }

        if (payload.isRedo && voices.length > 0) {
          const { audioPath, characterName, blockId, characterId, duration, words } = voices[0];
          const name = audioPath.split(/[\\/]/).pop();
          
          let dataUrl = '';
          try {
            const fileBuffer = await window.electronAPI.readFileBuffer(audioPath);
            if (fileBuffer && !fileBuffer.error && fileBuffer.byteLength > 0) {
              const arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
              new Uint8Array(arrayBuffer).set(fileBuffer);
              const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
              dataUrl = URL.createObjectURL(blob);
            }
          } catch (bufErr) {
            console.error("Failed to read file buffer for redo:", bufErr);
          }

          const resolvedDataUrl = dataUrl || `file:///${audioPath.replace(/\\/g, '/')}`;

          // Find and replace old media item in media library
          const oldMediaItem = state.mediaItems.find(m => m.blockId === payload.redoBlockId);
          if (oldMediaItem) {
            actions.removeMedia(oldMediaItem.id);
          }

          const newMediaItem = {
            id: `media_${Date.now()}_redo_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            path: audioPath,
            ext: '.wav',
            dataUrl: resolvedDataUrl,
            type: 'audio',
            isVoiceClone: true,
            blockId: payload.redoBlockId,
            characterId,
            characterName,
            duration: duration || 0,
            words: words || [],
          };
          actions.addMedia(newMediaItem);

          // Update timeline block
          actions.updateBlockTiming(payload.redoBlockId, undefined, duration);
          actions.updateBlock(payload.redoBlockId, { words: words || [] });

          // Update timeline clip properties
          actions.updateClipProperties(payload.redoTrackId, payload.redoClipId, {
            name: name,
            path: audioPath,
            dataUrl: resolvedDataUrl,
            duration: duration,
          });

          actions.addToast(`Redone voice line for ${characterName} applied successfully!`, 'success');
          return;
        }

        if (voices.length === 0) return;

        actions.addToast(`Adding ${voices.length} AI Voiceover clips to Media Library...`, 'info');

        for (let i = 0; i < voices.length; i++) {
          const { audioPath, characterName, blockId, characterId, duration, words } = voices[i];
          const name = audioPath.split(/[\\/]/).pop();
          
          let dataUrl = '';
          try {
            const fileBuffer = await window.electronAPI.readFileBuffer(audioPath);
            if (fileBuffer && !fileBuffer.error && fileBuffer.byteLength > 0) {
              const arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
              new Uint8Array(arrayBuffer).set(fileBuffer);
              
              // Create Blob URL for safe audio element playback, avoiding file:/// scheme crashes
              const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
              dataUrl = URL.createObjectURL(blob);
            } else {
              console.error("Failed to read file buffer or buffer is empty:", fileBuffer?.error);
            }
          } catch (bufErr) {
            console.error("Failed to read file buffer for dataUrl:", bufErr);
          }

          const item = {
            id: `media_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            path: audioPath,
            ext: '.wav',
            dataUrl: dataUrl || `file:///${audioPath.replace(/\\/g, '/')}`,
            type: 'audio',
            isVoiceClone: !!blockId,
            blockId,
            characterId,
            characterName,
            duration: duration || 0,
            words: words || [],
          };

          // Add to media library only
          actions.addMedia(item);
        }

        actions.addToast(`All ${voices.length} voiceover clips added to Media Library!`, 'success');
      });
    }

    if (window.electronAPI && window.electronAPI.onProjectSettingsUpdated) {
      window.electronAPI.onProjectSettingsUpdated((payload) => {
        const { width, height, fps, brollLayout } = payload;
        actions.setProjectResolution(width, height);
        actions.setExportSettings({ fps });
        if (brollLayout) {
          actions.setBrollLayout(brollLayout);
        }
        actions.addToast('Project settings updated', 'success');
      });
    }

    return () => {
      if (window.electronAPI && window.electronAPI.removeTimelineVoicesUpdated) {
        window.electronAPI.removeTimelineVoicesUpdated();
      }
      if (window.electronAPI && window.electronAPI.removeProjectSettingsUpdated) {
        window.electronAPI.removeProjectSettingsUpdated();
      }
    };
  }, [actions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      
      <div className="app-layout">
        <Toolbar />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* ── Upper Area: Library | Preview | Script ── */}
          <div className="workspace" style={{ flex: 1, minHeight: 0 }}>
            {/* Left Panel - Media Library */}
            {leftMinimized ? (
              <div
                onClick={() => {
                  setLeftWidth(savedLeftWidth);
                  setLeftMinimized(false);
                }}
                style={{
                  width: 32,
                  height: '100%',
                  background: 'var(--surface-1)',
                  borderRight: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: 16,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background 0.15s',
                  position: 'relative'
                }}
                title="Expand Media Library"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; }}
              >
                <div style={{ fontSize: '10px', color: 'var(--accent-primary)', marginBottom: 24, fontWeight: 'bold' }}>
                  ▶▶
                </div>
                <div style={{
                  writingMode: 'vertical-rl',
                  textTransform: 'uppercase',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  letterSpacing: '2px',
                  color: 'var(--text-secondary)'
                }}>
                  Media Library
                </div>
              </div>
            ) : (
              <div className="workspace__left" style={{ width: leftWidth, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <MediaLibrary
                  onMinimize={() => {
                    setSavedLeftWidth(leftWidth);
                    setLeftWidth(0);
                    setLeftMinimized(true);
                  }}
                />
              </div>
            )}

            {/* Left Resizer */}
            {!leftMinimized && (
              <div
                className="resizer resizer--h"
                onMouseDown={(e) => handleResizeStart(e, 'left')}
              />
            )}

            {/* Center - Preview Canvas */}
            <div className="workspace__center">
              <PreviewCanvas />
            </div>

            {/* Right Resizer */}
            {!rightMinimized && (
              <div
                className="resizer resizer--h"
                onMouseDown={(e) => handleResizeStart(e, 'right')}
              />
            )}

            {/* Right Panel - Script Editor */}
            {rightMinimized ? (
              <div
                onClick={() => {
                  setRightWidth(savedRightWidth);
                  setRightMinimized(false);
                }}
                style={{
                  width: 32,
                  height: '100%',
                  background: 'var(--surface-1)',
                  borderLeft: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: 16,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background 0.15s',
                  position: 'relative'
                }}
                title="Expand Script Editor"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; }}
              >
                <div style={{ fontSize: '10px', color: 'var(--accent-primary)', marginBottom: 24, fontWeight: 'bold' }}>
                  ◀◀
                </div>
                <div style={{
                  writingMode: 'vertical-rl',
                  textTransform: 'uppercase',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  letterSpacing: '2px',
                  color: 'var(--text-secondary)'
                }}>
                  Script Editor
                </div>
              </div>
            ) : (
              <div className="workspace__right" style={{ width: rightWidth, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <ScriptEditor
                  onMinimize={() => {
                    setSavedRightWidth(rightWidth);
                    setRightWidth(0);
                    setRightMinimized(true);
                  }}
                />
              </div>
            )}
          </div>

          {/* ── Timeline Resizer ── */}
          <div
            className="resizer resizer--v"
            onMouseDown={(e) => handleResizeStart(e, 'timeline')}
          />

          {/* ── Timeline ── */}
          <div style={{ height: timelineHeight, flexShrink: 0 }}>
            <Timeline />
          </div>
        </div>
      </div>

      <ExportModal />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  );
}
