import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import { drawFrame, getCaptionTextForTime } from '../engine/renderEngine';
import { getAnimatedTransform, getActiveBlocks, getInterpolatedKeyframeTransform } from '../engine/animationEngine';

/**
 * Video Preview Panel with canvas-based rendering and free transform handles
 */
export default function PreviewCanvas() {
  const { state, actions } = useProject();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderAnimFrameRef = useRef(null);
  const playbackAnimFrameRef = useRef(null);
  const audioElementsRef = useRef({});
  const videoElementsRef = useRef({});
  const playStartRef = useRef(null);
  const localTimeRef = useRef(0);
  const lastDispatchRef = useRef(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(null); // { type: 'move'|'resize', elementId, startX, startY, origTransform, cx, cy, origDist }
  const [transformMode, setTransformMode] = useState('standard'); // 'standard' | 'skew'
  const [hoveredAxis, setHoveredAxis] = useState(null);
  const loadedImagesRef = useRef({});

  // Target aspect ratio (9:16 vertical)
  const aspectRatio = state.canvasWidth / state.canvasHeight;

  // Resize observer for responsive canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const maxW = rect.width - 32;
      const maxH = rect.height - 32;

      let w, h;
      if (maxW / maxH > aspectRatio) {
        h = maxH;
        w = h * aspectRatio;
      } else {
        w = maxW;
        h = w / aspectRatio;
      }

      setCanvasSize({ width: Math.floor(w), height: Math.floor(h) });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [aspectRatio]);

  // Preload character images
  useEffect(() => {
    state.characters.forEach(char => {
      if (char.asset && char.asset.dataUrl && !loadedImagesRef.current[char.id]) {
        const img = new Image();
        img.src = char.asset.dataUrl;
        img.onload = () => {
          loadedImagesRef.current[char.id] = img;
        };
      }
    });
  }, [state.characters]);

  // Preload timeline images (for image clips on video tracks)
  useEffect(() => {
    state.tracks.forEach(track => {
      if (track.type === 'video') {
        track.clips.forEach(clip => {
          if (clip.type === 'image' && clip.dataUrl && !loadedImagesRef.current[clip.id]) {
            const img = new Image();
            img.src = clip.dataUrl;
            img.onload = () => {
              loadedImagesRef.current[clip.id] = img;
            };
          }
        });
      }
    });
  }, [state.tracks]);

  // ── Sync multi-track audio playback and seek ──
  useEffect(() => {
    const audioClips = state.tracks
      .filter(t => t.type === 'audio')
      .flatMap(t => t.clips);

    const now = state.currentTime;
    const isPlaying = state.isPlaying;

    audioClips.forEach(clip => {
      let audioEl = audioElementsRef.current[clip.id];
      const srcUrl = clip.dataUrl || `file:///${clip.path.replace(/\\/g, '/')}`;
      if (!audioEl || audioEl.datasetSrc !== srcUrl) {
        if (audioEl) {
          audioEl.pause();
        }
        audioEl = new Audio();
        audioEl.src = srcUrl;
        audioEl.datasetSrc = srcUrl;
        audioEl.load();
        audioElementsRef.current[clip.id] = audioEl;
      }

      // Apply volume and speed
      audioEl.volume = clip.volume ?? 1.0;
      // Note: playbackRate needs to be set after source is loaded/changed
      audioEl.playbackRate = clip.speed ?? 1.0;

      const isActive = now >= clip.startTime && now < (clip.startTime + clip.duration);

      if (isActive && isPlaying) {
        const targetTime = (now - clip.startTime) * (clip.speed ?? 1.0);
        if (Math.abs(audioEl.currentTime - targetTime) > 0.15) {
          audioEl.currentTime = targetTime;
        }
        if (audioEl.paused) {
          audioEl.play().catch(err => console.error("Clip audio play error:", err));
        }
      } else {
        if (!audioEl.paused) {
          audioEl.pause();
        }
        const targetTime = Math.max(0, (now - clip.startTime) * (clip.speed ?? 1.0));
        if (targetTime < (clip.duration * (clip.speed ?? 1.0)) && Math.abs(audioEl.currentTime - targetTime) > 0.1) {
          audioEl.currentTime = targetTime;
        }
      }
    });

    // Cleanup unused audio elements
    const currentClipIds = new Set(audioClips.map(c => c.id));
    Object.keys(audioElementsRef.current).forEach(id => {
      if (!currentClipIds.has(id)) {
        audioElementsRef.current[id].pause();
        delete audioElementsRef.current[id];
      }
    });
  }, [state.currentTime, state.isPlaying, state.tracks]);

  // ── Sync multi-track video playback and seek ──
  useEffect(() => {
    const videoClips = state.tracks
      .filter(t => t.type === 'video')
      .flatMap(t => t.clips)
      .filter(c => c.type === 'video');

    const now = state.currentTime;
    const isPlaying = state.isPlaying;

    videoClips.forEach(clip => {
      let videoEl = videoElementsRef.current[clip.id];
      const srcUrl = clip.dataUrl || `file:///${clip.path.replace(/\\/g, '/')}`;
      if (!videoEl || videoEl.datasetSrc !== srcUrl) {
        if (videoEl) {
          videoEl.pause();
        }
        videoEl = document.createElement('video');
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.src = srcUrl;
        videoEl.datasetSrc = srcUrl;
        videoEl.load();
        videoElementsRef.current[clip.id] = videoEl;
      }

      // Apply volume and speed
      videoEl.muted = (clip.volume ?? 1.0) === 0;
      videoEl.volume = clip.volume ?? 1.0;
      videoEl.playbackRate = clip.speed ?? 1.0;

      const isActive = now >= clip.startTime && now < (clip.startTime + clip.duration);

      if (isActive && isPlaying) {
        const duration = videoEl.duration || clip.duration || 1;
        const targetTime = ((now - clip.startTime) * (clip.speed ?? 1.0)) % duration;
        if (Math.abs(videoEl.currentTime - targetTime) > 0.15) {
          videoEl.currentTime = targetTime;
        }
        if (videoEl.paused) {
          videoEl.play().catch(err => console.error("Clip video play error:", err));
        }
      } else {
        if (!videoEl.paused) {
          videoEl.pause();
        }
        const duration = videoEl.duration || clip.duration || 1;
        const targetTime = ((now - clip.startTime) * (clip.speed ?? 1.0)) % duration;
        if (targetTime >= 0 && targetTime < (clip.duration * (clip.speed ?? 1.0)) && Math.abs(videoEl.currentTime - targetTime) > 0.1) {
          videoEl.currentTime = targetTime;
        }
      }
    });

    // Cleanup unused video elements
    const currentClipIds = new Set(videoClips.map(c => c.id));
    Object.keys(videoElementsRef.current).forEach(id => {
      if (!currentClipIds.has(id)) {
        videoElementsRef.current[id].pause();
        delete videoElementsRef.current[id];
      }
    });
  }, [state.currentTime, state.isPlaying, state.tracks]);

  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [preRenderProgress, setPreRenderProgress] = useState(null);
  const preRenderedFramesRef = useRef([]);
  const preRenderFps = 12;

  // Sync GPU settings status
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getGPUAcceleration) {
      window.electronAPI.getGPUAcceleration().then(setGpuEnabled);
    }
  }, []);

  const handleGpuToggle = async (e) => {
    const checked = e.target.checked;
    setGpuEnabled(checked);
    if (window.electronAPI && window.electronAPI.setGPUAcceleration) {
      await window.electronAPI.setGPUAcceleration(checked);
      actions.addToast(`GPU Acceleration ${checked ? 'enabled' : 'disabled'}! Please restart the app.`, 'info');
    }
  };

  // Clear pre-rendered frames on video change
  useEffect(() => {
    preRenderedFramesRef.current.forEach(f => {
      if (f && f.close) f.close();
    });
    preRenderedFramesRef.current = [];
  }, [state.backgroundVideo]);

  const handlePreRender = async () => {
    if (!state.backgroundVideo) {
      actions.addToast("No background video to pre-render!", "warning");
      return;
    }

    const tempVideo = document.createElement('video');
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

    const duration = tempVideo.duration || state.totalDuration || 1;
    const totalFrames = Math.ceil(duration * preRenderFps);
    const frames = [];

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 360;
    exportCanvas.height = 640;
    const exportCtx = exportCanvas.getContext('2d');

    setPreRenderProgress(0);
    actions.addToast("Pre-rendering background video to GPU cache...", "info");

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
        const timeout = setTimeout(done, 1000);
        video.currentTime = time;
      });
    };

    try {
      preRenderedFramesRef.current.forEach(f => {
        if (f && f.close) f.close();
      });
      preRenderedFramesRef.current = [];

      for (let i = 0; i < totalFrames; i++) {
        const time = i / preRenderFps;
        await seekVideo(tempVideo, time % duration);

        exportCtx.clearRect(0, 0, 360, 640);
        const canvasRatio = 360 / 640;
        const videoRatio = tempVideo.videoWidth / tempVideo.videoHeight || canvasRatio;

        let sx = 0, sy = 0, sw = tempVideo.videoWidth, sh = tempVideo.videoHeight;
        if (videoRatio > canvasRatio) {
          sw = sh * canvasRatio;
          sx = (tempVideo.videoWidth - sw) / 2;
        } else {
          sh = sw / canvasRatio;
          sy = (tempVideo.videoHeight - sh) / 2;
        }

        exportCtx.drawImage(tempVideo, sx, sy, sw, sh, 0, 0, 360, 640);

        const bitmap = await createImageBitmap(exportCanvas);
        frames.push(bitmap);

        setPreRenderProgress(Math.round(((i + 1) / totalFrames) * 100));
      }

      preRenderedFramesRef.current = frames;
      actions.addToast("GPU cache pre-rendering complete!", "success");
    } catch (err) {
      console.error(err);
      actions.addToast(`Pre-rendering failed: ${err.message}`, "error");
    } finally {
      setPreRenderProgress(null);
    }
  };

  // Main render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    const renderTime = state.isPlaying ? localTimeRef.current : state.currentTime;

    let bgFrame = null;
    if (preRenderedFramesRef.current.length > 0) {
      const frameIdx = Math.floor(renderTime * preRenderFps);
      bgFrame = preRenderedFramesRef.current[frameIdx % preRenderedFramesRef.current.length];
    }

    drawFrame(ctx, {
      state,
      time: renderTime,
      width,
      height,
      loadedImages: loadedImagesRef.current,
      videoElement: bgFrame || videoElementsRef.current,
      drawHandles: true,
      transformMode,
      activeAxis: (dragging?.type === 'rotate3d' ? dragging.lockedAxis : hoveredAxis),
    });
  }, [state, canvasSize, transformMode, dragging, hoveredAxis]);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      render();
      renderAnimFrameRef.current = requestAnimationFrame(loop);
    };
    renderAnimFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (renderAnimFrameRef.current) cancelAnimationFrame(renderAnimFrameRef.current);
    };
  }, [render]);

  // Playback timer
  useEffect(() => {
    if (!state.isPlaying) {
      playStartRef.current = null;
      localTimeRef.current = state.currentTime;
      return;
    }

    playStartRef.current = performance.now() - state.currentTime * 1000;
    lastDispatchRef.current = performance.now();

    const tick = () => {
      if (!playStartRef.current) return;
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      if (elapsed >= state.totalDuration) {
        actions.setPlaying(false);
        actions.setCurrentTime(0);
        localTimeRef.current = 0;
        return;
      }

      // Update local unthrottled time ref
      localTimeRef.current = elapsed;

      // Throttled dispatch to React state once every 100ms
      const now = performance.now();
      if (now - lastDispatchRef.current > 100) {
        actions.setCurrentTime(elapsed);
        lastDispatchRef.current = now;
      }

      playbackAnimFrameRef.current = requestAnimationFrame(tick);
    };
    
    playbackAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (playbackAnimFrameRef.current) {
        cancelAnimationFrame(playbackAnimFrameRef.current);
      }
      // Ensure we write back the final precise time on stop/pause
      if (playStartRef.current) {
        const elapsed = (performance.now() - playStartRef.current) / 1000;
        actions.setCurrentTime(Math.min(state.totalDuration, elapsed));
      }
    };
  }, [state.isPlaying]);

  // ── Mouse interaction for free transform ──
  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    const scaleFactor = canvasSize.width / state.canvasWidth;

    const activeBlocks = getActiveBlocks(state.dialogueBlocks, state.currentTime);

    // Check if clicking on any keyframe diamond marker for the selected element in the viewport
    if (state.selectedElementId) {
      const char = state.characters.find(c => c.id === state.selectedElementId);
      if (char && char.keyframingEnabled && char.keyframes) {
        let hitKfIdx = -1;
        char.keyframes.forEach((kf, idx) => {
          const kfX = kf.x * scaleFactor;
          const kfY = kf.y * scaleFactor;
          const dist = Math.sqrt((x - kfX) ** 2 + (y - kfY) ** 2);
          if (dist <= 10) {
            hitKfIdx = idx;
          }
        });
        
        if (hitKfIdx !== -1) {
          e.stopPropagation();
          const targetKf = char.keyframes[hitKfIdx];
          
          actions.selectKeyframe(hitKfIdx);
          actions.setCurrentTime(targetKf.time);
          
          setDragging({
            type: 'move',
            elementId: state.selectedElementId,
            startX: x,
            startY: y,
            origTransform: targetKf,
            keyframeIndex: hitKfIdx,
          });
          return;
        }
      }
    }

    // 1. Check if clicking on the resize handle of the currently selected element
    if (state.selectedElementId) {
      let cx, cy, w, h;
      const isCaption = state.selectedElementId.startsWith('caption_');
      let currentTransform = state.characterTransforms[state.selectedElementId] || {
        x: state.canvasWidth / 2,
        y: isCaption ? state.canvasHeight * 0.85 : state.canvasHeight * 0.65,
        scale: 1,
        rotation: 0,
      };

      if (!isCaption) {
        const char = state.characters.find(c => c.id === state.selectedElementId);
        if (char && char.keyframingEnabled && char.keyframes?.length > 0) {
          currentTransform = getInterpolatedKeyframeTransform(char.keyframes, state.currentTime);
        }
      }

      if (isCaption) {
        const charId = state.selectedElementId.replace('caption_', '');
        const block = activeBlocks.find(b => b.characterId === charId);
        const char = state.characters.find(c => c.id === charId);
        if (block && char) {
          const style = char.textStyle || {};
          const baseSize = style.fontSize ?? 36;
          const displayCx = currentTransform.x * scaleFactor;
          const displayCy = currentTransform.y * scaleFactor;
          const fontSize = Math.max(10, Math.floor(baseSize * currentTransform.scale * scaleFactor));
          
          ctx.save();
          ctx.font = `900 ${fontSize}px ${style.fontFamily || 'Impact, sans-serif'}`;
          ctx.letterSpacing = `${style.letterSpacing ?? 2}px`;
          
          const wordsPerLine = style.wordsPerLine ?? 3;
          let activeText = getCaptionTextForTime(block.text, block.startTime, block.duration, state.currentTime, wordsPerLine, block.words) || '';
          if (!activeText) {
            ctx.restore();
          } else {
            if (style.caseMode === 'uppercase') {
              activeText = activeText.toUpperCase();
            } else if (style.caseMode === 'lowercase') {
              activeText = activeText.toLowerCase();
            }
            
            const words = activeText.split(' ');
            const lines = [];
            let currentLine = '';
            const maxLineWidth = Math.max(120, state.canvasWidth * 0.75 * currentTransform.scale * scaleFactor);
            words.forEach(word => {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              if (ctx.measureText(testLine).width > maxLineWidth) {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            });
            if (currentLine) lines.push(currentLine);
            
            const lineHeight = fontSize * (style.lineHeight || 1.4);
            const padding = fontSize * ((style.backgroundPadding ?? 10) / 36);
            let blockWidth = 0;
            lines.forEach(line => {
              const wr = ctx.measureText(line).width;
              if (wr > blockWidth) blockWidth = wr;
            });
            blockWidth = Math.max(50, blockWidth + padding * 2);
            const blockHeight = lines.length * lineHeight + padding * 2;
            ctx.restore();
            
            cx = displayCx;
            cy = displayCy;
            w = blockWidth;
            h = blockHeight;
          }
        }
      } else {
        const char = state.characters.find(c => c.id === state.selectedElementId);
        const block = activeBlocks.find(b => b.characterId === state.selectedElementId);
        if (char && block) {
          const animTransform = getAnimatedTransform(block, currentTransform, state.currentTime);
          if (animTransform) {
            cx = animTransform.x * scaleFactor;
            cy = animTransform.y * scaleFactor;
            w = 640 * animTransform.scale * scaleFactor;
            h = 640 * animTransform.scale * scaleFactor;
          }
        }
      }

      if (cx !== undefined && cy !== undefined && w !== undefined && h !== undefined) {
        // Resolve character transforms
        const rotation = currentTransform.rotation || 0;
        const rotateX = currentTransform.rotateX || 0;
        const rotateY = currentTransform.rotateY || 0;
        const skewX = currentTransform.skewX || 0;
        const skewY = currentTransform.skewY || 0;
        const flipX = currentTransform.flipX ?? 1;
        const flipY = currentTransform.flipY ?? 1;

        // Project a local handle point (lx, ly) to screen space (x, y)
        const projectPoint = (lx, ly) => {
          // 1. Scale & Flip
          const scaleX = Math.cos(rotateY * Math.PI / 180) * flipX;
          const scaleY = Math.cos(rotateX * Math.PI / 180) * flipY;
          let px = lx * scaleX;
          let py = ly * scaleY;

          // 2. Skew
          const tanSkewX = Math.tan(skewX * Math.PI / 180);
          const tanSkewY = Math.tan(skewY * Math.PI / 180);
          const sx = px + py * tanSkewX;
          const sy = px * tanSkewY + py;

          // 3. Rotate
          const rotRad = rotation * Math.PI / 180;
          const rx = sx * Math.cos(rotRad) - sy * Math.sin(rotRad);
          const ry = sx * Math.sin(rotRad) + sy * Math.cos(rotRad);

          // 4. Translate
          return {
            x: cx + rx,
            y: cy + ry
          };
        };

        // 1. Check if clicking on rotation handle
        if (!isCaption && transformMode !== 'skew' && transformMode !== 'rotate3d') {
          const rotHandleScreen = projectPoint(0, -h / 2 - 24);
          const dist = Math.sqrt((x - rotHandleScreen.x) ** 2 + (y - rotHandleScreen.y) ** 2);
          if (dist <= 15) { // 15px hit tolerance
            actions.startDragHistory();
            setDragging({
              type: 'rotate',
              elementId: state.selectedElementId,
              cx,
              cy,
              origTransform: currentTransform,
              startAngle: Math.atan2(y - cy, x - cx) * 180 / Math.PI,
            });
            return;
          }
        }

        // 2. Check if clicking on resize / skew handles
        if (transformMode !== 'rotate3d') {
          const corners = [
            { lx: -w / 2, ly: -h / 2, index: 0 },
            { lx: w / 2, ly: -h / 2, index: 1 },
            { lx: -w / 2, ly: h / 2, index: 2 },
            { lx: w / 2, ly: h / 2, index: 3 },
          ];
          let hitHandleIndex = -1;
          for (let i = 0; i < corners.length; i++) {
            const screenPos = projectPoint(corners[i].lx, corners[i].ly);
            const dist = Math.sqrt((x - screenPos.x) ** 2 + (y - screenPos.y) ** 2);
            if (dist <= 15) { // 15px hit box
              hitHandleIndex = i;
              break;
            }
          }

          if (hitHandleIndex !== -1) {
            actions.startDragHistory();
            
            if (transformMode === 'skew') {
              setDragging({
                type: 'skew',
                elementId: state.selectedElementId,
                cx,
                cy,
                origTransform: currentTransform,
                startX: x,
                startY: y,
                handleIndex: hitHandleIndex,
              });
            } else {
              const screenPos = projectPoint(corners[hitHandleIndex].lx, corners[hitHandleIndex].ly);
              setDragging({
                type: 'resize',
                elementId: state.selectedElementId,
                cx,
                cy,
                origTransform: currentTransform,
                origDist: Math.sqrt((screenPos.x - cx) ** 2 + (screenPos.y - cy) ** 2),
              });
            }
            return;
          }
        }
      }
    }

    // 2. Check if clicking on active caption box (top layer)
    for (const block of activeBlocks) {
      const char = state.characters.find(c => c.id === block.characterId);
      if (!char) continue;
      const captionKey = `caption_${char.id}`;
      const transform = state.characterTransforms[captionKey] || {
        x: state.canvasWidth / 2,
        y: state.canvasHeight * 0.85,
        scale: 1,
        rotation: 0,
      };

      const displayCx = transform.x * scaleFactor;
      const displayCy = transform.y * scaleFactor;
      const style = char.textStyle || {};
      const baseSize = style.fontSize ?? 36;
      const fontSize = Math.max(10, Math.floor(baseSize * transform.scale * scaleFactor));
      
      ctx.save();
      ctx.font = `900 ${fontSize}px ${style.fontFamily || 'Impact, sans-serif'}`;
      ctx.letterSpacing = `${style.letterSpacing ?? 2}px`;
      
      const wordsPerLine = style.wordsPerLine ?? 3;
      let activeText = getCaptionTextForTime(block.text, block.startTime, block.duration, state.currentTime, wordsPerLine, block.words) || '';
      if (!activeText) {
        ctx.restore();
        continue;
      }
      if (style.caseMode === 'uppercase') {
        activeText = activeText.toUpperCase();
      } else if (style.caseMode === 'lowercase') {
        activeText = activeText.toLowerCase();
      }

      const words = activeText.split(' ');
      const lines = [];
      let currentLine = '';
      const maxLineWidth = Math.max(120, state.canvasWidth * 0.75 * transform.scale * scaleFactor);
      words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxLineWidth) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });
      if (currentLine) lines.push(currentLine);

      const lineHeight = fontSize * (style.lineHeight || 1.4);
      const padding = fontSize * ((style.backgroundPadding ?? 10) / 36);
      let blockWidth = 0;
      lines.forEach(line => {
        const wr = ctx.measureText(line).width;
        if (wr > blockWidth) blockWidth = wr;
      });
      blockWidth = Math.max(50, blockWidth + padding * 2);
      const blockHeight = lines.length * lineHeight + padding * 2;
      ctx.restore();

      const rx = displayCx - blockWidth / 2;
      const ry = displayCy - blockHeight / 2;

      if (x >= rx && x <= rx + blockWidth && y >= ry && y <= ry + blockHeight) {
        actions.selectElement(captionKey);
        actions.startDragHistory();
        setDragging({
          type: 'move',
          elementId: captionKey,
          startX: x,
          startY: y,
          origTransform: transform,
        });
        return;
      }
    }

    // 3. Check if clicking on active character PNG
    let clickedChar = null;
    let clickedTransform = null;
    for (const block of activeBlocks) {
      const char = state.characters.find(c => c.id === block.characterId);
      if (!char) continue;
      let transform = state.characterTransforms[char.id] || {
        x: state.canvasWidth / 2,
        y: state.canvasHeight * 0.65,
        scale: 1,
        rotation: 0,
      };
      if (char.keyframingEnabled && char.keyframes?.length > 0) {
        transform = getInterpolatedKeyframeTransform(char.keyframes, state.currentTime);
      }
      const displayCx = transform.x * scaleFactor;
      const displayCy = transform.y * scaleFactor;
      const charSize = 640 * (transform.scale || 1) * scaleFactor;
      const dist = Math.sqrt((x - displayCx) ** 2 + (y - displayCy) ** 2);
      if (dist < charSize / 2 + 10) {
        clickedChar = char;
        clickedTransform = transform;
        break;
      }
    }

    if (clickedChar) {
      actions.selectElement(clickedChar.id);
      actions.startDragHistory();
      if (transformMode === 'rotate3d') {
        const cx = (clickedTransform?.x ?? (state.canvasWidth / 2)) * scaleFactor;
        const cy = (clickedTransform?.y ?? (state.canvasHeight * 0.65)) * scaleFactor;
        const w = 640 * (clickedTransform?.scale ?? 1) * scaleFactor;
        const h = 640 * (clickedTransform?.scale ?? 1) * scaleFactor;
        const rotation = clickedTransform?.rotation ?? 0;

        // Project mouse coordinate relative to center
        const dx = x - cx;
        const dy = y - cy;
        const rad = -rotation * Math.PI / 180;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        let lockedAxis = null;
        const distX = Math.abs(localY); // distance to horizontal axis
        const distY = Math.abs(localX); // distance to vertical axis

        // Check if click is within the character box boundaries and close to either axis
        if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
          if (distX <= 18 && distY <= 18) {
            lockedAxis = distX < distY ? 'X' : 'Y';
          } else if (distX <= 18) {
            lockedAxis = 'X';
          } else if (distY <= 18) {
            lockedAxis = 'Y';
          }
        }

        if (lockedAxis) {
          setDragging({
            type: 'rotate3d',
            elementId: clickedChar.id,
            startX: x,
            startY: y,
            origTransform: clickedTransform || {
              x: state.canvasWidth / 2,
              y: state.canvasHeight * 0.65,
              scale: 1,
              rotation: 0,
              rotateX: 0,
              rotateY: 0,
            },
            lockedAxis,
          });
        } else {
          actions.endDragHistory();
        }
      } else {
        setDragging({
          type: 'move',
          elementId: clickedChar.id,
          startX: x,
          startY: y,
          origTransform: clickedTransform || {
            x: state.canvasWidth / 2,
            y: state.canvasHeight * 0.65,
            scale: 1,
            rotation: 0,
          },
        });
      }
    } else {
      actions.selectElement(null);
    }
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleFactor = canvasSize.width / state.canvasWidth;

    if (!dragging) {
      if (transformMode === 'rotate3d' && state.selectedElementId) {
        const isCaption = state.selectedElementId.startsWith('caption_');
        if (!isCaption) {
          const char = state.characters.find(c => c.id === state.selectedElementId);
          const activeBlocks = getActiveBlocks(state.dialogueBlocks, state.currentTime);
          const block = activeBlocks.find(b => b.characterId === state.selectedElementId);
          if (char && block) {
            const defaultTransform = state.characterTransforms[char.id] || { x: state.canvasWidth / 2, y: state.canvasHeight * 0.65, scale: 1, rotation: 0 };
            const baseTransform = char.keyframingEnabled && char.keyframes?.length > 0
              ? getInterpolatedKeyframeTransform(char.keyframes, state.currentTime)
              : defaultTransform;
            const animTransform = getAnimatedTransform(block, baseTransform, state.currentTime);
            if (animTransform) {
              const cx = animTransform.x * scaleFactor;
              const cy = animTransform.y * scaleFactor;
              const w = 640 * animTransform.scale * scaleFactor;
              const h = 640 * animTransform.scale * scaleFactor;
              const rotation = animTransform.rotation || 0;

              const dx = x - cx;
              const dy = y - cy;
              const rad = -rotation * Math.PI / 180;
              const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
              const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

              let axis = null;
              const distX = Math.abs(localY);
              const distY = Math.abs(localX);

              if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
                if (distX <= 18 && distY <= 18) {
                  axis = distX < distY ? 'X' : 'Y';
                } else if (distX <= 18) {
                  axis = 'X';
                } else if (distY <= 18) {
                  axis = 'Y';
                }
              }
              setHoveredAxis(axis);
              return;
            }
          }
        }
      }
      setHoveredAxis(null);
      return;
    }

    if (dragging.type === 'resize') {
      const currentDist = Math.sqrt((x - dragging.cx) ** 2 + (y - dragging.cy) ** 2);
      const newScale = Math.max(0.2, Math.min(3, dragging.origTransform.scale * (currentDist / dragging.origDist)));
      
      const isCaption = dragging.elementId.startsWith('caption_');
      const char = isCaption ? null : state.characters.find(c => c.id === dragging.elementId);
      if (char && char.keyframingEnabled) {
        const newTransform = {
          ...dragging.origTransform,
          scale: newScale,
        };
        actions.addCharacterKeyframe(char.id, state.currentTime, newTransform);
      } else {
        actions.setCharacterTransform(dragging.elementId, {
          ...dragging.origTransform,
          scale: newScale,
        });
      }
    } else if (dragging.type === 'move') {
      const dx = x - dragging.startX;
      const dy = y - dragging.startY;
      const newX = dragging.origTransform.x + dx / scaleFactor;
      const newY = dragging.origTransform.y + dy / scaleFactor;

      const isCaption = dragging.elementId.startsWith('caption_');
      const char = isCaption ? null : state.characters.find(c => c.id === dragging.elementId);
      if (char && char.keyframingEnabled) {
        const newTransform = {
          ...dragging.origTransform,
          x: newX,
          y: newY,
        };
        if (dragging.keyframeIndex !== undefined) {
          actions.updateCharacterKeyframe(char.id, dragging.keyframeIndex, newTransform);
        } else {
          actions.addCharacterKeyframe(char.id, state.currentTime, newTransform);
        }
      } else {
        actions.setCharacterTransform(dragging.elementId, {
          ...dragging.origTransform,
          x: newX,
          y: newY,
        });
      }
    } else if (dragging.type === 'rotate') {
      const angle = Math.atan2(y - dragging.cy, x - dragging.cx) * 180 / Math.PI;
      const deltaAngle = angle - dragging.startAngle;
      const newRotation = Math.round((dragging.origTransform.rotation + deltaAngle + 360) % 360);
      
      const isCaption = dragging.elementId.startsWith('caption_');
      const char = isCaption ? null : state.characters.find(c => c.id === dragging.elementId);
      if (char && char.keyframingEnabled) {
        const newTransform = {
          ...dragging.origTransform,
          rotation: newRotation,
        };
        actions.addCharacterKeyframe(char.id, state.currentTime, newTransform);
      } else {
        actions.setCharacterTransform(dragging.elementId, {
          ...dragging.origTransform,
          rotation: newRotation,
        });
      }
    } else if (dragging.type === 'skew') {
      const dx = x - dragging.startX;
      const dy = y - dragging.startY;
      
      const prevSkewX = dragging.origTransform.skewX ?? 0;
      const prevSkewY = dragging.origTransform.skewY ?? 0;
      
      let newSkewX = prevSkewX;
      let newSkewY = prevSkewY;
      
      // Determine skew based on which handle was dragged (just like in Photoshop)
      if (dragging.handleIndex === 0) { // Top-Left
        newSkewX = Math.max(-60, Math.min(60, Math.round(prevSkewX - dx / 3)));
      } else if (dragging.handleIndex === 1) { // Top-Right
        newSkewX = Math.max(-60, Math.min(60, Math.round(prevSkewX + dx / 3)));
      } else if (dragging.handleIndex === 2) { // Bottom-Left
        newSkewY = Math.max(-60, Math.min(60, Math.round(prevSkewY + dy / 3)));
      } else if (dragging.handleIndex === 3) { // Bottom-Right
        newSkewY = Math.max(-60, Math.min(60, Math.round(prevSkewY - dy / 3)));
      }
      
      const isCaption = dragging.elementId.startsWith('caption_');
      const char = isCaption ? null : state.characters.find(c => c.id === dragging.elementId);
      if (char && char.keyframingEnabled) {
        const newTransform = {
          ...dragging.origTransform,
          skewX: newSkewX,
          skewY: newSkewY,
        };
        actions.addCharacterKeyframe(char.id, state.currentTime, newTransform);
      } else {
        actions.setCharacterTransform(dragging.elementId, {
          ...dragging.origTransform,
          skewX: newSkewX,
          skewY: newSkewY,
        });
      }
    } else if (dragging.type === 'rotate3d') {
      const dx = x - dragging.startX;
      const dy = y - dragging.startY;
      
      const prevRotateX = dragging.origTransform.rotateX ?? 0;
      const prevRotateY = dragging.origTransform.rotateY ?? 0;
      
      let newRotateX = prevRotateX;
      let newRotateY = prevRotateY;
      
      if (dragging.lockedAxis === 'X') {
        newRotateX = Math.max(-90, Math.min(90, Math.round(prevRotateX - dy / 2)));
      } else if (dragging.lockedAxis === 'Y') {
        newRotateY = Math.max(-90, Math.min(90, Math.round(prevRotateY + dx / 2)));
      }
      
      const isCaption = dragging.elementId.startsWith('caption_');
      const char = isCaption ? null : state.characters.find(c => c.id === dragging.elementId);
      if (char && char.keyframingEnabled) {
        const newTransform = {
          ...dragging.origTransform,
          rotateX: newRotateX,
          rotateY: newRotateY,
        };
        actions.addCharacterKeyframe(char.id, state.currentTime, newTransform);
      } else {
        actions.setCharacterTransform(dragging.elementId, {
          ...dragging.origTransform,
          rotateX: newRotateX,
          rotateY: newRotateY,
        });
      }
    }
  };

  const handleCanvasMouseUp = () => {
    setDragging(null);
    actions.endDragHistory();
  };

  const handleCanvasWheel = (e) => {
    if (!state.selectedElementId) return;
    e.preventDefault();
    const isCaption = state.selectedElementId.startsWith('caption_');
    const char = isCaption ? null : state.characters.find(c => c.id === state.selectedElementId);
    
    let currentTransform = state.characterTransforms[state.selectedElementId] || {
      x: state.canvasWidth / 2,
      y: isCaption ? state.canvasHeight * 0.85 : state.canvasHeight * 0.65,
      scale: 1,
      rotation: 0,
    };
    
    if (char && char.keyframingEnabled && char.keyframes?.length > 0) {
      currentTransform = getInterpolatedKeyframeTransform(char.keyframes, state.currentTime);
    }
    
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.2, Math.min(3, currentTransform.scale + delta));
    
    if (char && char.keyframingEnabled) {
      const newTransform = {
        ...currentTransform,
        scale: newScale,
      };
      actions.addCharacterKeyframe(char.id, state.currentTime, newTransform);
    } else {
      actions.setCharacterTransform(state.selectedElementId, {
        ...currentTransform,
        scale: newScale,
      });
    }
  };

  return (
    <div className="preview-panel">
      <div className="panel__header">
        <span className="panel__title">Preview</span>
        <div className="panel__actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Transform mode toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', padding: 1.5, borderRadius: 4, marginRight: 8 }}>
            <button
              onClick={() => setTransformMode('standard')}
              style={{
                fontSize: '9px', padding: '2px 6px', height: 20, border: 'none', borderRadius: 3,
                background: transformMode === 'standard' ? 'var(--surface-1)' : 'transparent',
                color: transformMode === 'standard' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: transformMode === 'standard' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
              title="Standard Scale and Rotate transform"
            >
              Scale/Rotate
            </button>
            <button
              onClick={() => setTransformMode('skew')}
              style={{
                fontSize: '9px', padding: '2px 6px', height: 20, border: 'none', borderRadius: 3,
                background: transformMode === 'skew' ? 'var(--surface-1)' : 'transparent',
                color: transformMode === 'skew' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: transformMode === 'skew' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
              title="Photoshop-style Skew transform by pulling corners"
            >
              Skew Corners
            </button>
            <button
              onClick={() => setTransformMode('rotate3d')}
              style={{
                fontSize: '9px', padding: '2px 6px', height: 20, border: 'none', borderRadius: 3,
                background: transformMode === 'rotate3d' ? 'var(--surface-1)' : 'transparent',
                color: transformMode === 'rotate3d' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: transformMode === 'rotate3d' ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
              title="Drag inside boundaries to rotate/tilt the PNG in 3D space"
            >
              3D Rotate
            </button>
          </div>

          {window.electronAPI && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }} title="Toggle Electron GPU Acceleration (Requires Restart)">
              <input
                type="checkbox"
                checked={gpuEnabled}
                onChange={handleGpuToggle}
                style={{ cursor: 'pointer' }}
              />
              GPU Accel
            </label>
          )}

          {preRenderProgress !== null ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-primary)', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Pre-rendering: {preRenderProgress}%
            </span>
          ) : (
            state.backgroundVideo && (
              <button
                className="panel__action-btn"
                onClick={handlePreRender}
                title="Pre-render background video frames into GPU memory for smooth playback"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, width: 'auto', height: 22 }}
              >
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Pre-render {preRenderedFramesRef.current.length > 0 && '✓'}
              </button>
            )
          )}

          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {state.canvasWidth}×{state.canvasHeight}
          </span>
        </div>
      </div>

      <div
        className="preview-canvas-wrapper"
        ref={containerRef}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          try {
            const dataStr = e.dataTransfer.getData('application/json');
            if (!dataStr) return;
            const dragData = JSON.parse(dataStr);
            const item = state.mediaItems.find(m => m.id === dragData.id) || dragData;
            if (item.type === 'video') {
              actions.setBackgroundVideo(item);
              actions.addToast(`Set "${item.name}" as background video`, 'success');
            } else if (item.type === 'audio') {
              actions.setAudio(item);
              actions.addToast(`Set "${item.name}" as dialogue audio`, 'success');
            } else if (item.type === 'image') {
              if (state.selectedElementId && !state.selectedElementId.startsWith('caption_')) {
                actions.assignCharacterAsset(state.selectedElementId, item);
                actions.addToast(`Assigned "${item.name}" to character`, 'success');
              } else if (state.characters.length > 0) {
                actions.assignCharacterAsset(state.characters[0].id, item);
                actions.addToast(`Assigned "${item.name}" to ${state.characters[0].name}`, 'success');
              } else {
                actions.addToast('Parse a script first to create characters!', 'warning');
              }
            }
          } catch (err) {
            console.error(err);
          }
        }}
      >
        <div className="preview-canvas" style={{ width: canvasSize.width, height: canvasSize.height }}>
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleCanvasWheel}
            style={{ cursor: dragging ? 'grabbing' : state.activeTool === 'hand' ? 'grab' : 'default', willChange: 'transform', transform: 'translate3d(0,0,0)' }}
          />
        </div>
      </div>

      <div className="preview-controls">
        <button
          className="preview-btn"
          onClick={() => actions.setCurrentTime(0)}
          title="Go to start"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h2v12H6zm3 6l8-6v12z"/></svg>
        </button>
        <button
          className="preview-btn"
          onClick={() => actions.setCurrentTime(Math.max(0, state.currentTime - 5))}
          title="Rewind 5s"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button
          className="preview-btn preview-btn--play"
          onClick={() => actions.setPlaying(!state.isPlaying)}
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <button
          className="preview-btn"
          onClick={() => actions.setCurrentTime(Math.min(state.totalDuration, state.currentTime + 5))}
          title="Forward 5s"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13 6v12l8.5-6L13 6zm-.5 6L4 18V6l8.5 6z"/></svg>
        </button>
        <span className="preview-time">{formatTime(state.currentTime)}</span>
        <span style={{ color: 'var(--text-disabled)', fontSize: 'var(--text-xs)' }}>/</span>
        <span className="preview-time" style={{ color: 'var(--text-tertiary)' }}>
          {formatTime(state.totalDuration)}
        </span>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

