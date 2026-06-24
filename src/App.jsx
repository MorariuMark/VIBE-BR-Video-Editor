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
    if (window.electronAPI && window.electronAPI.onTimelineVoicesUpdated) {
      window.electronAPI.onTimelineVoicesUpdated(async (payload) => {
        const voices = payload.voices || [];
        if (payload.voiceConfigs) {
          actions.setVoiceConfigs(payload.voiceConfigs);
        }
        if (payload.audioPath) {
          voices.push({ audioPath: payload.audioPath, characterName: 'voiceover' });
        }

        if (voices.length === 0) return;

        actions.addToast(`Adding ${voices.length} AI Voiceover clips to Media Library... 🎤`, 'info');

        for (let i = 0; i < voices.length; i++) {
          const { audioPath, characterName, blockId, characterId, duration } = voices[i];
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
          };

          // Add to media library only
          actions.addMedia(item);
        }

        actions.addToast(`All ${voices.length} voiceover clips added to Media Library! 🎤`, 'success');
      });

      return () => {
        if (window.electronAPI.removeTimelineVoicesUpdated) {
          window.electronAPI.removeTimelineVoicesUpdated();
        }
      };
    }
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
            <div className="workspace__left" style={{ width: leftWidth }}>
              <MediaLibrary />
            </div>

            {/* Left Resizer */}
            <div
              className="resizer resizer--h"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
            />

            {/* Center - Preview Canvas */}
            <div className="workspace__center">
              <PreviewCanvas />
            </div>

            {/* Right Resizer */}
            <div
              className="resizer resizer--h"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
            />

            {/* Right Panel - Script Editor */}
            <div className="workspace__right" style={{ width: rightWidth }}>
              <ScriptEditor />
            </div>
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
