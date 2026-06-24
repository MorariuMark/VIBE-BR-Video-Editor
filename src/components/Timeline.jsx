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
  const [clipContextMenu, setClipContextMenu] = useState(null); // { x, y, clip, trackId }
  const [trackContextMenu, setTrackContextMenu] = useState(null); // { x, y, track }
  
  const { tracks, pixelsPerSecond, currentTime, totalDuration, isPlaying } = state;
  
  const trackHeaderWidth = 160;
  const timelineWidth = totalDuration * pixelsPerSecond;

  useEffect(() => {
    const closeMenus = () => {
      setClipContextMenu(null);
      setTrackContextMenu(null);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

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

      // Compute drop X and startTime
      const contentEl = e.currentTarget.querySelector('.timeline-track__content');
      let startTime = 0;
      if (contentEl) {
        const contentRect = contentEl.getBoundingClientRect();
        const dropX = e.clientX - contentRect.left;
        startTime = Math.max(0, dropX / pixelsPerSecond);
      }

      if (track.type === 'video') {
        if (item.type === 'video' || item.type === 'image') {
          const newClip = {
            id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: item.name,
            startTime,
            duration: item.duration || 5, // default 5s
            color: track.color || '#444466',
            path: item.path,
            dataUrl: item.dataUrl,
            type: item.type,
          };
          actions.addClipToTrack(track.id, newClip);
          actions.addToast(`Added "${item.name}" to track`, 'success');
        } else {
          actions.addToast('Mismatched media type. Drag a video/image file here.', 'warning');
        }
      } else if (track.type === 'audio') {
        if (item.type === 'audio') {
          const newClip = {
            id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: item.name,
            startTime,
            duration: item.duration || 5, // default 5s
            color: track.color || '#00e5ff',
            path: item.path,
            dataUrl: item.dataUrl,
            type: 'audio',
          };
          actions.addClipToTrack(track.id, newClip);
          actions.addToast(`Added "${item.name}" to track`, 'success');
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
        
        const clipTrack = state.tracks.find(t => t.id === draggingClip.trackId);
        if (clipTrack && clipTrack.type === 'character') {
          actions.updateBlockTiming(draggingClip.clipId, newStartTime, undefined);
        } else {
          const clip = clipTrack?.clips.find(c => c.id === draggingClip.clipId);
          if (clip && clip.blockId) {
            actions.updateBlockTiming(clip.blockId, newStartTime, undefined);
          } else {
            actions.updateClipTiming(draggingClip.trackId, draggingClip.clipId, newStartTime, undefined);
          }
        }
      }
      
      if (resizingClip) {
        const dx = e.clientX - resizingClip.startX;
        const dt = dx / pixelsPerSecond;
        
        const clipTrack = state.tracks.find(t => t.id === resizingClip.trackId);
        if (clipTrack && clipTrack.type === 'character') {
          if (resizingClip.side === 'right') {
            const newDuration = Math.max(0.2, resizingClip.origDuration + dt);
            actions.updateBlockTiming(resizingClip.clipId, undefined, newDuration);
          } else if (resizingClip.side === 'left') {
            const newStartTime = Math.max(0, resizingClip.origStartTime + dt);
            const newDuration = Math.max(0.2, resizingClip.origDuration - dt);
            actions.updateBlockTiming(resizingClip.clipId, newStartTime, newDuration);
          }
        } else {
          const clip = clipTrack?.clips.find(c => c.id === resizingClip.clipId);
          if (clip && clip.blockId) {
            if (resizingClip.side === 'right') {
              const newDuration = Math.max(0.2, resizingClip.origDuration + dt);
              actions.updateBlockTiming(clip.blockId, undefined, newDuration);
            } else if (resizingClip.side === 'left') {
              const newStartTime = Math.max(0, resizingClip.origStartTime + dt);
              const newDuration = Math.max(0.2, resizingClip.origDuration - dt);
              actions.updateBlockTiming(clip.blockId, newStartTime, newDuration);
            }
          } else {
            if (resizingClip.side === 'right') {
              const newDuration = Math.max(0.2, resizingClip.origDuration + dt);
              actions.updateClipTiming(resizingClip.trackId, resizingClip.clipId, undefined, newDuration);
            } else if (resizingClip.side === 'left') {
              const newStartTime = Math.max(0, resizingClip.origStartTime + dt);
              const newDuration = Math.max(0.2, resizingClip.origDuration - dt);
              actions.updateClipTiming(resizingClip.trackId, resizingClip.clipId, newStartTime, newDuration);
            }
          }
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

  const handleClipContextMenu = (e, clip, trackId) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Estimate menu height as ~140px, width as 150px
    const menuHeight = 140;
    const menuWidth = 150;
    let y = e.clientY;
    let x = e.clientX;
    
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }

    setClipContextMenu({
      x,
      y,
      clip,
      trackId
    });
  };

  const handleTrackHeaderContextMenu = (e, track) => {
    e.preventDefault();
    e.stopPropagation();
    if (track.type !== 'character') {
      // Estimate menu height as ~100px, width as 150px
      const menuHeight = 100;
      const menuWidth = 150;
      let y = e.clientY;
      let x = e.clientX;
      
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
      }
      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
      }

      setTrackContextMenu({
        x,
        y,
        track
      });
    }
  };

  const handleDeleteClip = () => {
    if (!clipContextMenu) return;
    const { clip, trackId } = clipContextMenu;
    
    if (trackId.startsWith('track_') && !trackId.includes('bg') && !trackId.includes('audio')) {
      const updatedBlocks = state.dialogueBlocks.filter(b => b.id !== clip.id);
      actions.setBlocks(updatedBlocks);
      actions.addToast(`Deleted dialogue block`, 'success');
    } else {
      actions.removeClipFromTrack(trackId, clip.id);
      actions.addToast(`Deleted clip "${clip.name}"`, 'success');
    }
    setClipContextMenu(null);
  };

  const handleRenameClip = () => {
    if (!clipContextMenu) return;
    const { clip, trackId } = clipContextMenu;
    const newName = prompt("Enter new name for the clip:", clip.name);
    if (newName && newName.trim()) {
      if (trackId.startsWith('track_') && !trackId.includes('bg') && !trackId.includes('audio')) {
        actions.updateBlock(clip.id, { text: newName });
      } else {
        actions.updateClipProperties(trackId, clip.id, { name: newName });
      }
    }
    setClipContextMenu(null);
  };

  const handleDeleteTrack = () => {
    if (!trackContextMenu) return;
    const { track } = trackContextMenu;
    if (confirm(`Are you sure you want to delete track "${track.name}"?`)) {
      actions.removeTrack(track.id);
      actions.addToast(`Deleted track "${track.name}"`, 'success');
    }
    setTrackContextMenu(null);
  };

  const handleRenameTrack = () => {
    if (!trackContextMenu) return;
    const { track } = trackContextMenu;
    const newName = prompt("Enter new name for track:", track.name);
    if (newName && newName.trim()) {
      actions.updateTrackProperties(track.id, { name: newName.trim() });
      actions.addToast(`Renamed track!`, 'success');
    }
    setTrackContextMenu(null);
  };

  const handleRedoVoiceLine = async () => {
    if (!clipContextMenu) return;
    const { clip, trackId } = clipContextMenu;
    setClipContextMenu(null);

    const blockId = clip.blockId || (trackId.startsWith('track_') && !trackId.includes('bg') && !trackId.includes('audio') ? clip.id : null);
    if (!blockId) return;

    const block = state.dialogueBlocks.find(b => b.id === blockId);
    if (!block) {
      actions.addToast("Could not find dialogue block to redo.", "warning");
      return;
    }

    const config = state.voiceConfigs?.[block.characterId];
    if (!config || !config.refPath || !config.refText) {
      actions.addToast(`Voice references not set for ${block.characterName}. Open the "Voice Clone" window and generate the voiceover first to set up characters.`, "warning");
      return;
    }

    actions.addToast(`Redoing voice line for ${block.characterName}... 🎙️`, "info");

    try {
      const projectPath = window.electronAPI ? await window.electronAPI.getProjectPath() : '.';
      const projectPathNormalized = projectPath.replace(/\\/g, '/');
      const timestamp = Math.floor(Date.now() / 1000);
      const voicesDir = `${projectPathNormalized}/dist/voices/redo_${timestamp}`;
      const charName = block.characterName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const savePath = `${voicesDir}/voice_${block.id}_${charName}.wav`;

      // Call Flask backend clone API directly from frontend
      const response = await fetch('http://127.0.0.1:5555/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: block.text,
          language: 'English',
          ref_audio: config.refPath,
          ref_text: config.refText,
          save_path: savePath
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Generation failed");
      }

      const generatedWavPath = data.wav_path;
      const duration = data.duration;

      // 1. Read buffer to create Blob URL for safe audio element playback in main window
      let dataUrl = '';
      if (window.electronAPI) {
        const fileBuffer = await window.electronAPI.readFileBuffer(generatedWavPath);
        if (fileBuffer && !fileBuffer.error && fileBuffer.byteLength > 0) {
          const arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
          new Uint8Array(arrayBuffer).set(fileBuffer);
          const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
          dataUrl = URL.createObjectURL(blob);
        }
      }
      
      const audioUrl = dataUrl || `file:///${generatedWavPath.replace(/\\/g, '/')}`;

      // 2. Add as a media item to the media library so it is saved/renameable
      const name = generatedWavPath.split(/[\\/]/).pop();
      const mediaItem = {
        id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        path: generatedWavPath,
        ext: '.wav',
        dataUrl: audioUrl,
        type: 'audio',
        isVoiceClone: true,
        blockId: block.id,
        characterId: block.characterId,
        characterName: block.characterName,
        duration: duration,
      };
      actions.addMedia(mediaItem);

      // 3. Update the dialogue block duration (shifts subsequent timings automatically)
      actions.updateBlockTiming(block.id, undefined, duration);

      // 4. Update or add corresponding clip in audio tracks
      let audioTrack = state.tracks.find(t => t.type === 'audio');
      if (!audioTrack) {
        audioTrack = { id: 'track_audio_1', color: '#00e5ff' };
      }

      // Check if clip for this block already exists on any audio track
      let existingClip = null;
      let existingTrackId = null;
      for (const t of state.tracks) {
        if (t.type === 'audio') {
          const c = t.clips.find(clip => clip.blockId === block.id);
          if (c) {
            existingClip = c;
            existingTrackId = t.id;
            break;
          }
        }
      }

      if (existingClip && existingTrackId) {
        // Update existing clip properties
        actions.updateClipProperties(existingTrackId, existingClip.id, {
          name: name,
          path: generatedWavPath,
          dataUrl: audioUrl,
          duration: duration,
        });
      } else {
        // Create new audio clip on track
        const newClip = {
          id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: name,
          startTime: block.startTime,
          duration: duration,
          color: audioTrack.color || '#00e5ff',
          path: generatedWavPath,
          dataUrl: audioUrl,
          type: 'audio',
          blockId: block.id,
        };
        actions.addClipToTrack(audioTrack.id, newClip);
      }

      actions.addToast(`Redone voice line for ${block.characterName}! 🎙️`, "success");
    } catch (err) {
      console.error(err);
      actions.addToast(`Failed to redo voice line: ${err.message}`, "error");
    }
  };

  const handleAddVideoTrack = () => {
    actions.addTrack('video', 'Video Track');
    actions.addToast(`Added video track`, 'success');
  };

  const handleAddAudioTrack = () => {
    actions.addTrack('audio', 'Audio Track');
    actions.addToast(`Added audio track`, 'success');
  };

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

        <div className="toolbar__group">
          <button
            className="toolbar__btn"
            onClick={handleAddVideoTrack}
            style={{ height: 24, fontSize: 'var(--text-xs)' }}
          >
            + Video Track
          </button>
          <button
            className="toolbar__btn"
            onClick={handleAddAudioTrack}
            style={{ height: 24, fontSize: 'var(--text-xs)' }}
          >
            + Audio Track
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
        style={{ overflow: 'auto', paddingBottom: '120px' }}
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
              onContextMenu={(e) => handleTrackHeaderContextMenu(e, track)}
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
                  onContextMenu={(e) => handleClipContextMenu(e, clip, track.id)}
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

      {clipContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: clipContextMenu.y,
            left: clipContextMenu.x,
            background: '#151520',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 16px rgba(0,0,0,0.6)',
            borderRadius: 6,
            zIndex: 10000,
            padding: '4px 0',
            minWidth: 120,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(clipContextMenu.clip.blockId || (clipContextMenu.trackId.startsWith('track_') && !clipContextMenu.trackId.includes('bg') && !clipContextMenu.trackId.includes('audio'))) && (
            <HoverMenuItem text="🎙️ Redo Voice Line" onClick={handleRedoVoiceLine} />
          )}
          <HoverMenuItem text="✏️ Rename Clip" onClick={handleRenameClip} />
          <HoverMenuItem text="🗑️ Delete Clip" color="#ff4081" onClick={handleDeleteClip} />
        </div>
      )}

      {trackContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: trackContextMenu.y,
            left: trackContextMenu.x,
            background: '#151520',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 16px rgba(0,0,0,0.6)',
            borderRadius: 6,
            zIndex: 10000,
            padding: '4px 0',
            minWidth: 120,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <HoverMenuItem text="✏️ Rename Track" onClick={handleRenameTrack} />
          <HoverMenuItem text="🗑️ Delete Track" color="#ff4081" onClick={handleDeleteTrack} />
        </div>
      )}
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

function HoverMenuItem({ text, onClick, color }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        padding: '8px 12px',
        fontSize: '12px',
        cursor: 'pointer',
        color: color || '#e3e3e8',
        background: hover ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
        transition: 'background 0.2s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {text}
    </div>
  );
}
