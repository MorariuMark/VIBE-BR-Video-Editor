import React, { useState, useRef } from 'react';
import { useProject } from '../store/ProjectContext';
import { EXPORT_PRESETS, generateFFmpegCommand } from '../engine/exportEngine';
import { drawFrame } from '../engine/renderEngine';

/**
 * Export Modal — configure and trigger video export via FFmpeg
 */
export default function ExportModal() {
  const { state, actions } = useProject();
  const [selectedPreset, setSelectedPreset] = useState('tiktok-vertical');
  const [renderMethod, setRenderMethod] = useState('canvas');
  const cancelExportRef = useRef(false);

  const handleCancelExport = async () => {
    cancelExportRef.current = true;
    if (window.electronAPI && window.electronAPI.killExport) {
      await window.electronAPI.killExport();
    }
    actions.setExporting(false);
    actions.addToast('Export cancelled', 'warning');
  };

  if (!state.showExportModal) return null;

  const handlePresetChange = (presetId) => {
    setSelectedPreset(presetId);
    const preset = EXPORT_PRESETS[presetId];
    if (preset) {
      actions.setExportSettings({
        width: preset.width,
        height: preset.height,
        fps: preset.fps,
        codec: preset.codec,
        crf: preset.crf,
      });
    }
  };

  const handleExport = async () => {
    if (!state.backgroundVideo && state.dialogueBlocks.length === 0) {
      actions.addToast('Nothing to export! Add a background video or parse a script.', 'error');
      return;
    }

    cancelExportRef.current = false;
    actions.setExporting(true);
    actions.setExportProgress(0);

    try {
      let outputPath;
      
      if (window.electronAPI) {
        outputPath = await window.electronAPI.saveFileDialog({
          defaultPath: `brainrot_${Date.now()}.mp4`,
        });
        
        if (!outputPath) {
          actions.setExporting(false);
          return;
        }

        if (renderMethod === 'native') {
          // Listen to native export progress
          window.electronAPI.onExportProgress((progressData) => {
            if (progressData && typeof progressData.percent === 'number') {
              actions.setExportProgress(progressData.percent);
            }
          });

          // Build character assets map
          const characterAssetsMap = {};
          state.characters.forEach((char) => {
            if (char.asset && char.asset.path) {
              characterAssetsMap[char.id] = char.asset.path;
            }
          });

          const ffmpegConfig = {
            backgroundVideo: state.backgroundVideo?.path || '',
            blocks: state.dialogueBlocks,
            characterAssets: characterAssetsMap,
            characterTransforms: state.characterTransforms,
            audioPath: state.audioFile?.path || '',
            outputPath,
            settings: state.exportSettings,
          };

          const ffmpegCmd = generateFFmpegCommand(ffmpegConfig);
          console.log('[ExportModal] Native FFmpeg arguments:', ffmpegCmd.args);

          const result = await window.electronAPI.exportVideo({
            args: ffmpegCmd.args,
            outputPath,
            totalDuration: state.totalDuration,
          });

          window.electronAPI.removeExportProgress();

          if (result.success) {
            actions.addToast('Export complete! 🎬', 'success');
          } else {
            actions.addToast(`Export failed: ${result.error?.substring(0, 120)}`, 'error');
          }
          actions.setExporting(false);
          return;
        }

        // Preload character images
        const loadedImages = {};
        for (const char of state.characters) {
          if (char.asset && char.asset.dataUrl) {
            await new Promise((resolve) => {
              const img = new Image();
              img.src = char.asset.dataUrl;
              img.onload = () => {
                loadedImages[char.id] = img;
                resolve();
              };
              img.onerror = () => resolve();
            });
          }
        }

        // Setup temporary video element for background (only for slow CPU Canvas render)
        let tempVideo = null;
        if (renderMethod === 'canvas-cpu' && state.backgroundVideo) {
          tempVideo = document.createElement('video');
          tempVideo.muted = true;
          const videoUrl = window.electronAPI && state.backgroundVideo.path
            ? `file:///${state.backgroundVideo.path.replace(/\\/g, '/')}`
            : state.backgroundVideo.dataUrl;
          tempVideo.src = videoUrl;
          await new Promise((resolve) => {
            tempVideo.onloadedmetadata = () => resolve();
            tempVideo.onerror = () => resolve();
            tempVideo.load();
          });
        }

        // Setup hidden export canvas
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = state.exportSettings.width;
        exportCanvas.height = state.exportSettings.height;
        const exportCtx = exportCanvas.getContext('2d');

        const fps = state.exportSettings.fps;
        const totalFrames = Math.ceil(state.totalDuration * fps);

        // Helper to seek video frame-by-frame (only for slow CPU Canvas render)
        const seekVideo = (video, time) => {
          return new Promise((resolve) => {
            let resolved = false;
            const done = () => {
              if (resolved) return;
              resolved = true;
              video.removeEventListener('seeked', onSeeked);
              clearTimeout(timeout);
              resolve();
            };
            const onSeeked = () => done();
            video.addEventListener('seeked', onSeeked);
            const timeout = setTimeout(done, 800); // 800ms fallback timeout
            video.currentTime = time;
          });
        };

        // Start the frame-by-frame export process in main process
        const exportPromise = window.electronAPI.startFrameExport({
          settings: state.exportSettings,
          audioPath: state.audioFile?.path || '',
          backgroundVideoPath: renderMethod === 'canvas' ? (state.backgroundVideo?.path || '') : '',
          totalDuration: state.totalDuration,
          outputPath,
        });

        // Loop and stream frames using an async pipelined approach to maximize concurrency
        let aborted = false;
        const activePromises = [];
        const maxInFlight = 8; // Process up to 8 frames concurrently

        for (let i = 0; i < totalFrames; i++) {
          if (cancelExportRef.current) {
            aborted = true;
            break;
          }
          const time = i / fps;
          
          if (tempVideo && renderMethod === 'canvas-cpu') {
            const vDur = tempVideo.duration || state.totalDuration || 1;
            await seekVideo(tempVideo, time % vDur);
          }

          // Draw pixel-perfect frame
          drawFrame(exportCtx, {
            state,
            time,
            width: exportCanvas.width,
            height: exportCanvas.height,
            loadedImages,
            videoElement: tempVideo,
            drawHandles: false,
            transparentBackground: renderMethod === 'canvas',
          });

          // Extract frame buffer
          const imgData = exportCtx.getImageData(0, 0, exportCanvas.width, exportCanvas.height).data;
          
          // Stream frame to FFmpeg in background
          const sendPromise = window.electronAPI.sendFrame(imgData);
          activePromises.push(sendPromise);

          // Maintain the pipelining window size
          if (activePromises.length >= maxInFlight) {
            const success = await activePromises.shift();
            if (!success) {
              console.error("FFmpeg frame streaming failed!");
              throw new Error("FFmpeg frame write failed. The export process may have closed unexpectedly.");
            }
          }

          // Update progress
          actions.setExportProgress((i / totalFrames) * 95); // 95% is frame processing
        }

        // Wait for all remaining background frame writes to complete
        if (!aborted) {
          const results = await Promise.all(activePromises);
          if (results.some(r => !r)) {
            throw new Error("FFmpeg final frame write failed.");
          }
        }

        if (aborted) {
          actions.setExporting(false);
          return;
        }

        // Finalize export
        await window.electronAPI.endFrameExport();
        actions.setExportProgress(98);

        const result = await exportPromise;
        actions.setExportProgress(100);

        if (result.success) {
          actions.addToast('Export complete! 🎬', 'success');
        } else {
          actions.addToast(`Export failed: ${result.error?.substring(0, 100)}`, 'error');
        }
      } else {
        // Browser fallback
        actions.addToast('Export requires the Electron desktop app with local FFmpeg.', 'info');
        for (let i = 0; i <= 100; i += 5) {
          await new Promise(r => setTimeout(r, 100));
          actions.setExportProgress(i);
        }
        actions.addToast('Export simulation complete! (Use desktop app for real export)', 'success');
      }
    } catch (err) {
      actions.addToast(`Export error: ${err.message}`, 'error');
    } finally {
      actions.setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !state.isExporting && actions.setShowExportModal(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">🎬 Export Video</h2>
          {!state.isExporting && (
            <button className="modal__close" onClick={() => actions.setShowExportModal(false)}>
              ✕
            </button>
          )}
        </div>

        <div className="modal__body">
          {/* Preset selector */}
          <div className="form-group">
            <label className="form-label">Format Preset</label>
            <select
              className="form-select"
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              disabled={state.isExporting}
            >
              {Object.entries(EXPORT_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>{preset.name}</option>
              ))}
            </select>
          </div>

          {/* Resolution */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Width</label>
              <input
                type="number"
                className="form-input"
                value={state.exportSettings.width}
                onChange={(e) => actions.setExportSettings({ width: parseInt(e.target.value) })}
                disabled={state.isExporting}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Height</label>
              <input
                type="number"
                className="form-input"
                value={state.exportSettings.height}
                onChange={(e) => actions.setExportSettings({ height: parseInt(e.target.value) })}
                disabled={state.isExporting}
              />
            </div>
          </div>

          {/* FPS & Quality */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">FPS</label>
              <select
                className="form-select"
                value={state.exportSettings.fps}
                onChange={(e) => actions.setExportSettings({ fps: parseInt(e.target.value) })}
                disabled={state.isExporting}
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Quality (CRF)</label>
              <input
                type="range"
                min="0"
                max="51"
                value={state.exportSettings.crf}
                onChange={(e) => actions.setExportSettings({ crf: parseInt(e.target.value) })}
                disabled={state.isExporting}
                style={{ width: '100%', marginTop: 8 }}
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                {state.exportSettings.crf} ({state.exportSettings.crf < 18 ? 'High' : state.exportSettings.crf < 28 ? 'Medium' : 'Low'} quality)
              </span>
            </div>
          </div>

          {/* Video Encoder / GPU Accel */}
          <div className="form-group">
            <label className="form-label">Video Encoder (GPU Accel)</label>
            <select
              className="form-select"
              value={state.exportSettings.codec || 'libx264'}
              onChange={(e) => actions.setExportSettings({ codec: e.target.value })}
              disabled={state.isExporting}
            >
              <option value="libx264">CPU (Standard - libx264)</option>
              <option value="h264_nvenc">NVIDIA NVENC (GPU - h264_nvenc)</option>
              <option value="h264_amf">AMD AMF (GPU - h264_amf)</option>
              <option value="h264_qsv">Intel QSV (GPU - h264_qsv)</option>
            </select>
          </div>

          {/* Render Method */}
          <div className="form-group">
            <label className="form-label">Render Method</label>
            <select
              className="form-select"
              value={renderMethod}
              onChange={(e) => setRenderMethod(e.target.value)}
              disabled={state.isExporting}
            >
              <option value="canvas">GPU Accelerated Canvas (Fast - Preserves all animations & effects)</option>
              <option value="canvas-cpu">CPU Standard Canvas (Slow, Legacy frame seeker)</option>
              <option value="native">Native FFmpeg (Ultra Fast - No Canvas, static overlays)</option>
            </select>
          </div>

          {/* Helpful Render Tips */}
          <div style={{
            marginTop: 12, padding: 12, background: 'var(--surface-2, rgba(255,255,255,0.03))',
            borderRadius: 'var(--radius-md, 6px)', fontSize: 'var(--text-xs, 12px)',
            color: 'var(--text-secondary, #b3b3b3)', borderLeft: '3px solid var(--accent-primary, #00e5ff)',
            lineHeight: '1.4'
          }}>
            {renderMethod === 'canvas' && (
              <div>
                🚀 <strong>GPU Canvas:</strong> Renders transparent frames and overlays them in FFmpeg. Fast GPU execution that **preserves all character animations and text glows**!
              </div>
            )}
            {renderMethod === 'canvas-cpu' && (
              <div>
                💡 <strong>CPU Canvas:</strong> Seeks background video frame-by-frame. Export at <strong>30 FPS</strong> instead of 60 FPS to cut render time and memory usage in half!
              </div>
            )}
            {renderMethod === 'native' && (
              <div>
                ⚡ <strong>Native Mode:</strong> Pure FFmpeg execution. High rendering speed, but skips canvas-specific entry/exit transitions and rich text effects.
              </div>
            )}
          </div>

          {/* Progress */}
          {state.isExporting && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginBottom: 8, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
              }}>
                <span>Exporting...</span>
                <span>{Math.round(state.exportProgress)}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar__fill"
                  style={{ width: `${state.exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Info */}
          <div style={{
            marginTop: 16, padding: 12, background: 'var(--surface-2)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)', lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Export Info:</strong><br />
            Duration: {state.totalDuration.toFixed(1)}s &middot; 
            Blocks: {state.dialogueBlocks.length} &middot; 
            Characters: {state.characters.length}
            {!state.backgroundVideo && (
              <div style={{ color: 'var(--accent-warning)', marginTop: 4 }}>
                ⚠ No background video set
              </div>
            )}
          </div>
        </div>

        <div className="modal__footer">
          {state.isExporting ? (
            <button
              className="btn btn--danger"
              onClick={handleCancelExport}
              style={{ width: '100%' }}
            >
              🛑 Cancel Render
            </button>
          ) : (
            <>
              <button
                className="btn btn--secondary"
                onClick={() => actions.setShowExportModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                onClick={handleExport}
              >
                🎬 Export
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
