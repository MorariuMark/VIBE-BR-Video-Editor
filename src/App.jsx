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
