import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useProject } from '../store/ProjectContext';

/**
 * Multi-track Timeline Panel
 * Features: tracks, clips, playhead, zoom, drag/resize clips, ruler
 */
export default function Timeline() {
  const { state, actions } = useProject();
  const tracksContainerRef = useRef(null);
  const [draggingClip, setDraggingClip] = useState(null);
  const [resizingClip, setResizingClip] = useState(null);
  const [draggingTrackId, setDraggingTrackId] = useState(null);
  const [dragOverTrackId, setDragOverTrackId] = useState(null);
  
  const { tracks, pixelsPerSecond, currentTime, totalDuration, isPlaying } = state;
  
  const trackHeaderWidth = 160;
  const timelineWidth = totalDuration * pixelsPerSecond;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDropOnTrack = (e, track) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const dragData = JSON.parse(dataStr);
      const item = state.mediaItems.find(m => m.id === dragData.id) || dragData;

      if (track.id === 'track_bg') {
        if (item.type === 'video') {
          actions.setBackgroundVideo(item);
          actions.addToast(`Set "${item.name}" as background video`, 'success');
        } else {
          actions.addToast('Mismatched media type. Drag a video file here.', 'warning');
        }
      } else if (track.id === 'track_audio') {
        if (item.type === 'audio') {
          actions.setAudio(item);
          actions.addToast(`Set "${item.name}" as dialogue audio`, 'success');
        } else {
          actions.addToast('Mismatched media type. Drag an audio file here.', 'warning');
        }
      } else if (track.type === 'character') {
        if (item.type === 'image') {
          actions.assignCharacterAsset(track.characterId, item);
          actions.addToast(`Assigned "${item.name}" to character ${track.name}`, 'success');
        } else {
          actions.addToast('Mismatched media type. Drag an image/PNG file here.', 'warning');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Ruler ticks ───
  const generateRulerTicks = () => {
    const ticks = [];
    // Determine interval based on zoom level
    let interval = 1;
    if (pixelsPerSecond < 20) interval = 5;
    else if (pixelsPerSecond < 40) interval = 2;
    else if (pixelsPerSecond > 100) interval = 0.5;

    for (let t = 0; t <= totalDuration; t += interval) {
      const x = t * pixelsPerSecond;
      const isMajor = t % (interval * 2 === 0 ? 2 : Math.ceil(1 / interval)) === 0 || interval >= 1;
      ticks.push(
        <div
          key={t}
          className="timeline-ruler__tick"
          style={{ left: `${x}px` }}
        >
          <span className="timeline-ruler__tick-label">
            {formatTime(t)}
          </span>
          <div
            className="timeline-ruler__tick-line"
            style={{ height: isMajor ? '8px' : '4px' }}
          />
        </div>
      );
    }
    return ticks;
  };

  // ─── Playhead position ───
  const playheadX = currentTime * pixelsPerSecond + trackHeaderWidth;

  // ─── Click on ruler to seek ───
  const handleRulerClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - trackHeaderWidth;
    const time = Math.max(0, x / pixelsPerSecond);
    actions.setCurrentTime(time);
  };

  // ─── Clip dragging ───
  const handleClipMouseDown = (e, clip, trackId) => {
    if (e.target.classList.contains('timeline-clip__handle')) return;
    e.stopPropagation();
    
    actions.selectClip(clip.id);
    
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    setDraggingClip({
      clipId: clip.id,
      trackId,
      startX: e.clientX,
      origStartTime: clip.startTime,
      containerLeft: rect.left,
    });
  };

  // ─── Clip resizing ───
  const handleResizeMouseDown = (e, clip, trackId, side) => {
    e.stopPropagation();
    
    setResizingClip({
      clipId: clip.id,
      trackId,
      side,
      startX: e.clientX,
      origStartTime: clip.startTime,
      origDuration: clip.duration,
    });
  };

  // ─── Global mouse move/up ───
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (draggingClip) {
        const dx = e.clientX - draggingClip.startX;
        const dt = dx / pixelsPerSecond;
        const newStartTime = Math.max(0, draggingClip.origStartTime + dt);
        
        // Find the block and update its timing
        const block = state.dialogueBlocks.find(b => b.id === draggingClip.clipId);
        if (block) {
          actions.updateBlockTiming(draggingClip.clipId, newStartTime, undefined);
        }
      }
      
      if (resizingClip) {
        const dx = e.clientX - resizingClip.startX;
        const dt = dx / pixelsPerSecond;
        
        if (resizingClip.side === 'right') {
          const newDuration = Math.max(0.2, resizingClip.origDuration + dt);
          actions.updateBlockTiming(resizingClip.clipId, undefined, newDuration);
        } else if (resizingClip.side === 'left') {
          const newStartTime = Math.max(0, resizingClip.origStartTime + dt);
          const newDuration = Math.max(0.2, resizingClip.origDuration - dt);
          actions.updateBlockTiming(resizingClip.clipId, newStartTime, newDuration);
        }
      }
    };

    const handleMouseUp = () => {
      setDraggingClip(null);
      setResizingClip(null);
    };

    if (draggingClip || resizingClip) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingClip, resizingClip, pixelsPerSecond]);

  const handleTrackHeaderDragStart = (e, track) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', track.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTrackId(track.id);
  };

  const handleTrackHeaderDragOver = (e, targetTrack) => {
    if (!draggingTrackId) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrackId(targetTrack.id);
  };

  const handleTrackHeaderDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTrackId(null);
  };

  const handleTrackHeaderDrop = (e, targetTrack) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingTrackId || draggingTrackId === targetTrack.id) {
      setDraggingTrackId(null);
      setDragOverTrackId(null);
      return;
    }

    const draggedIndex = tracks.findIndex(t => t.id === draggingTrackId);
    const targetIndex = tracks.findIndex(t => t.id === targetTrack.id);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newTracks = [...tracks];
      const [removed] = newTracks.splice(draggedIndex, 1);
      newTracks.splice(targetIndex, 0, removed);
      actions.setTracks(newTracks);
      actions.addToast(`Reordered layers`, 'success');
    }

    setDraggingTrackId(null);
    setDragOverTrackId(null);
  };

  const handleTrackHeaderDragEnd = () => {
    setDraggingTrackId(null);
    setDragOverTrackId(null);
  };

  // ─── Click on track content to seek ───
  const handleTrackClick = (e) => {
    if (e.target.classList.contains('timeline-clip') || e.target.closest('.timeline-clip')) return;
    const trackContent = e.target.closest('.timeline-track__content');
    if (!trackContent) return;
    const rect = trackContent.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, x / pixelsPerSecond);
    actions.setCurrentTime(time);
  };

  return (
    <div className="timeline-panel">
      {/* Timeline Toolbar */}
      <div className="timeline-toolbar">
        <div className="toolbar__group" style={{ borderLeft: 'none' }}>
          <button
            className={`toolbar__btn ${state.activeTool === 'select' ? 'toolbar__btn--active' : ''}`}
            onClick={() => actions.setActiveTool('select')}
            title="Selection Tool (V)"
            style={{ height: 24, fontSize: 'var(--text-xs)' }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
            Select
          </button>
          <button
            className={`toolbar__btn ${state.activeTool === 'cut' ? 'toolbar__btn--active' : ''}`}
            onClick={() => actions.setActiveTool('cut')}
            title="Cut Tool (C)"
            style={{ height: 24, fontSize: 'var(--text-xs)' }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
            Cut
          </button>
        </div>

        <div className="toolbar__group">
          <button
            className="toolbar__btn"
            onClick={() => actions.setPlaying(!isPlaying)}
            style={{ height: 24, fontSize: 'var(--text-xs)' }}
          >
            {isPlaying ? (
              <>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style={{ marginRight: 4 }}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                Pause
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style={{ marginRight: 4 }}><path d="M8 5v14l11-7z"/></svg>
                Play
              </>
            )}
          </button>
        </div>

        <div className="timeline-zoom">
          <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>−</span>
          <input
            type="range"
            className="timeline-zoom__slider"
            min="10"
            max="200"
            value={pixelsPerSecond}
            onChange={(e) => actions.setPixelsPerSecond(Number(e.target.value))}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>+</span>
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 4, fontFamily: 'var(--font-mono)' }}>
            {pixelsPerSecond}px/s
          </span>
        </div>
      </div>

      {/* Ruler */}
      <div className="timeline-ruler" onClick={handleRulerClick} style={{ cursor: 'pointer' }}>
        <div style={{ width: `${trackHeaderWidth}px`, minWidth: `${trackHeaderWidth}px`, background: 'var(--surface-1)', borderRight: '1px solid var(--border-subtle)' }} />
        <div className="timeline-ruler__labels" style={{ width: `${timelineWidth}px` }}>
          {generateRulerTicks()}
        </div>
      </div>

      {/* Tracks */}
      <div
        className="timeline-tracks-container"
        ref={tracksContainerRef}
        onClick={handleTrackClick}
        style={{ overflow: 'auto' }}
      >
        {/* Playhead */}
        <div
          className="timeline-playhead"
          style={{ left: `${playheadX}px` }}
        />

        {tracks.map(track => (
          <div
            key={track.id}
            className={`timeline-track ${track.type === 'audio' ? 'timeline-track--audio' : ''} ${dragOverTrackId === track.id ? 'timeline-track--dragover' : ''}`}
            onDragOver={(e) => {
              if (draggingTrackId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverTrackId(track.id);
              } else {
                handleDragOver(e);
              }
            }}
            onDragLeave={() => {
              if (draggingTrackId) {
                setDragOverTrackId(null);
              }
            }}
            onDrop={(e) => {
              if (draggingTrackId) {
                handleTrackHeaderDrop(e, track);
              } else {
                handleDropOnTrack(e, track);
              }
            }}
          >
            {/* Track Header */}
            <div
              className={`timeline-track__header ${draggingTrackId === track.id ? 'timeline-track__header--dragging' : ''} ${dragOverTrackId === track.id ? 'timeline-track__header--dragover' : ''}`}
              draggable
              onDragStart={(e) => handleTrackHeaderDragStart(e, track)}
              onDragOver={(e) => handleTrackHeaderDragOver(e, track)}
              onDragLeave={handleTrackHeaderDragLeave}
              onDrop={(e) => handleTrackHeaderDrop(e, track)}
              onDragEnd={handleTrackHeaderDragEnd}
            >
              <div
                className="timeline-track__header-color"
                style={{ background: track.color }}
              />
              <span className="timeline-track__header-name">{track.name}</span>
              <span className="timeline-track__header-icon" title="Drag header to reorder layer hierarchy" style={{ cursor: 'grab' }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M20 9H4v2h16V9zM4 15h16v-2H4v2z"/></svg>
              </span>
            </div>

            {/* Track Content */}
            <div
              className="timeline-track__content"
              style={{
                '--pixels-per-second': pixelsPerSecond,
                minWidth: timelineWidth,
              }}
            >
              {track.type === 'audio' && state.audioFile && (
                <div className="audio-waveform" style={{ width: `${timelineWidth}px` }}>
                  <AudioWaveformCanvas
                    audioBuffer={state.audioBuffer}
                    width={timelineWidth}
                    height={52}
                    color={track.color}
                  />
                </div>
              )}

              {track.clips.map(clip => (
                <div
                  key={clip.id}
                  className={`timeline-clip ${state.selectedClipId === clip.id ? 'timeline-clip--selected' : ''}`}
                  style={{
                    left: `${clip.startTime * pixelsPerSecond}px`,
                    width: `${Math.max(20, clip.duration * pixelsPerSecond)}px`,
                    background: `linear-gradient(135deg, ${clip.color}cc, ${clip.color}88)`,
                  }}
                  onMouseDown={(e) => handleClipMouseDown(e, clip, track.id)}
                >
                  <div
                    className="timeline-clip__handle timeline-clip__handle--left"
                    onMouseDown={(e) => handleResizeMouseDown(e, clip, track.id, 'left')}
                  />
                  <span className="timeline-clip__label">{clip.name}</span>
                  <div
                    className="timeline-clip__handle timeline-clip__handle--right"
                    onMouseDown={(e) => handleResizeMouseDown(e, clip, track.id, 'right')}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {tracks.length === 0 && (
          <div style={{
            padding: '40px', textAlign: 'center',
            color: 'var(--text-disabled)', fontSize: 'var(--text-sm)',
          }}>
            Parse a script to generate timeline tracks
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Simple audio waveform visualization on a canvas
 */
function AudioWaveformCanvas({ audioBuffer, width, height, color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;
    const ctx = canvas.getContext('2d');
    
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!audioBuffer) {
      // Draw placeholder waveform
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const mid = height / 2;
      for (let x = 0; x < width; x++) {
        const y = mid + Math.sin(x * 0.05) * (height * 0.3) * Math.sin(x * 0.002);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }

    // Draw actual waveform from audio buffer
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPixel = Math.floor(channelData.length / width);
    const mid = height / 2;

    ctx.fillStyle = color + '66';
    
    for (let x = 0; x < width; x++) {
      let min = 1, max = -1;
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, channelData.length);
      
      for (let i = start; i < end; i += Math.max(1, Math.floor(samplesPerPixel / 50))) {
        const val = channelData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      
      const barTop = mid + min * mid;
      const barHeight = (max - min) * mid;
      ctx.fillRect(x, barTop, 1, Math.max(1, barHeight));
    }
  }, [audioBuffer, width, height, color]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
