import React, { useState, useEffect } from 'react';
import { useProject } from '../store/ProjectContext';

const ASPECT_RATIO_PRESETS = [
  { name: 'Vertical Portrait (9:16) [Default]', width: 1080, height: 1920, ratio: 9/16 },
  { name: 'Landscape (16:9)', width: 1920, height: 1080, ratio: 16/9 },
  { name: 'Square (1:1)', width: 1080, height: 1080, ratio: 1/1 },
  { name: 'Standard (4:3)', width: 1440, height: 1080, ratio: 4/3 },
  { name: 'Classic Portrait (2:3)', width: 1080, height: 1620, ratio: 2/3 },
];

export default function ProjectSettingsModal() {
  const { state, actions } = useProject();
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1920);
  const [fps, setFps] = useState(60);
  const [aspectRatioLock, setAspectRatioLock] = useState(true);
  const [preset, setPreset] = useState('0'); // vertical portrait index

  useEffect(() => {
    if (state.showProjectSettingsModal) {
      setWidth(state.canvasWidth || 1080);
      setHeight(state.canvasHeight || 1920);
      setFps(state.exportSettings?.fps || 60);
      
      // Match initial resolution to preset index if possible
      const matchIdx = ASPECT_RATIO_PRESETS.findIndex(p => p.width === state.canvasWidth && p.height === state.canvasHeight);
      setPreset(matchIdx !== -1 ? matchIdx.toString() : 'custom');
    }
  }, [state.showProjectSettingsModal, state.canvasWidth, state.canvasHeight, state.exportSettings]);

  if (!state.showProjectSettingsModal) return null;

  const handlePresetChange = (e) => {
    const val = e.target.value;
    setPreset(val);
    if (val !== 'custom') {
      const selected = ASPECT_RATIO_PRESETS[parseInt(val)];
      if (selected) {
        setWidth(selected.width);
        setHeight(selected.height);
      }
    }
  };

  const handleWidthChange = (e) => {
    const val = Math.max(100, Math.min(4000, parseInt(e.target.value) || 0));
    setWidth(val);
    
    if (aspectRatioLock && preset !== 'custom') {
      const selected = ASPECT_RATIO_PRESETS[parseInt(preset)];
      if (selected) {
        setHeight(Math.round(val / selected.ratio));
      } else {
        // Fallback custom ratio lock
        const ratio = width / height;
        setHeight(Math.round(val / ratio));
      }
    } else if (aspectRatioLock) {
      const ratio = (state.canvasWidth || 1080) / (state.canvasHeight || 1920);
      setHeight(Math.round(val / ratio));
    }
  };

  const handleHeightChange = (e) => {
    const val = Math.max(100, Math.min(4000, parseInt(e.target.value) || 0));
    setHeight(val);
    
    if (aspectRatioLock && preset !== 'custom') {
      const selected = ASPECT_RATIO_PRESETS[parseInt(preset)];
      if (selected) {
        setWidth(Math.round(val * selected.ratio));
      } else {
        const ratio = width / height;
        setWidth(Math.round(val * ratio));
      }
    } else if (aspectRatioLock) {
      const ratio = (state.canvasWidth || 1080) / (state.canvasHeight || 1920);
      setWidth(Math.round(val * ratio));
    }
  };

  const handleSave = () => {
    actions.setProjectResolution(width, height);
    actions.setExportSettings({ fps });
    actions.setShowProjectSettingsModal(false);
    actions.addToast('Project settings updated', 'success');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal__header">
          <span className="modal__title">Project Settings</span>
          <button
            className="modal__close"
            onClick={() => actions.setShowProjectSettingsModal(false)}
          >
            &times;
          </button>
        </div>
        
        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Preset Select */}
          <div className="form-group">
            <label className="form-label">Preset Aspect Ratio</label>
            <select
              className="form-select"
              value={preset}
              onChange={handlePresetChange}
            >
              {ASPECT_RATIO_PRESETS.map((p, idx) => (
                <option key={idx} value={idx.toString()}>{p.name}</option>
              ))}
              <option value="custom">Custom Aspect Ratio</option>
            </select>
          </div>

          {/* Width / Height inputs */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Width (px)</label>
              <input
                type="number"
                className="form-input"
                value={width}
                onChange={handleWidthChange}
              />
            </div>
            
            {/* Lock Aspect Ratio Chain Icon */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32, cursor: 'pointer', color: aspectRatioLock ? 'var(--accent-primary)' : 'var(--text-disabled)' }}
                 onClick={() => setAspectRatioLock(!aspectRatioLock)}
                 title={aspectRatioLock ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}>
              {aspectRatioLock ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="21" x2="3" y2="3"/><path d="M10.46 10.46a4 4 0 0 0 5.08 5.08L19 12a5 5 0 0 0-7.07-7.07l-1.47 1.47"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              )}
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Height (px)</label>
              <input
                type="number"
                className="form-input"
                value={height}
                onChange={handleHeightChange}
              />
            </div>
          </div>

          {/* Framerate Input */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Frame Rate</span>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{fps} FPS</span>
            </label>
            <input
              type="range"
              min="24"
              max="60"
              step="1"
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-disabled)', marginTop: 2 }}>
              <span>24 FPS</span>
              <span>30 FPS</span>
              <span>60 FPS</span>
            </div>
          </div>
        </div>

        <div className="modal__footer">
          <button
            className="btn btn--secondary"
            onClick={() => actions.setShowProjectSettingsModal(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
