import { getAnimatedTransform, getActiveBlocks } from './animationEngine';

export function getCaptionTextForTime(text, startTime, duration, currentTime, wordsPerLine = 3) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';
  
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    chunks.push(words.slice(i, i + wordsPerLine).join(' '));
  }
  
  const numChunks = chunks.length;
  const chunkDuration = duration / numChunks;
  const elapsed = currentTime - startTime;
  const chunkIndex = Math.floor(elapsed / chunkDuration);
  const activeIndex = Math.max(0, Math.min(numChunks - 1, chunkIndex));
  return chunks[activeIndex];
}

export function drawFrame(ctx, { state, time, width, height, loadedImages, videoElement, drawHandles, transparentBackground }) {
  const scaleFactor = width / state.canvasWidth;
  const activeBlocks = getActiveBlocks(state.dialogueBlocks, time);

  // 2a. Draw solid dark background color or clear for transparency
  if (transparentBackground) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
  }

  // 2b. Draw background video first (always at the very bottom, beneath characters)
  const bgTrack = state.tracks.find(track => track.type === 'video');
  if (bgTrack && videoElement && !transparentBackground) {
    const v = videoElement;
    const canvasRatio = width / height;
    const videoRatio = v.videoWidth / v.videoHeight || (state.canvasWidth / state.canvasHeight);
    
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (videoRatio > canvasRatio) {
      sw = sh * canvasRatio;
      sx = (v.videoWidth - sw) / 2;
    } else {
      sh = sw / canvasRatio;
      sy = (v.videoHeight - sh) / 2;
    }
    
    try {
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, width, height);
    } catch (e) {
      ctx.drawImage(v, 0, 0, width, height);
    }
  }
  
  // 2c. Draw character tracks (reversed so top tracks in the timeline render on top of lower tracks)
  const characterTracks = state.tracks.filter(track => track.type === 'character');
  [...characterTracks].reverse().forEach(track => {
    const charId = track.characterId;
    const char = state.characters.find(c => c.id === charId);
    if (!char) return;

    const block = activeBlocks.find(b => b.characterId === charId);
    if (!block) return;

    const defaultTransform = state.characterTransforms[char.id] || {
      x: state.canvasWidth / 2,
      y: state.canvasHeight * 0.65,
      scale: 1,
      rotation: 0,
    };

    const animTransform = getAnimatedTransform(block, defaultTransform, time);
    if (!animTransform) return;

    ctx.save();
    ctx.globalAlpha = animTransform.opacity ?? 1;

    const displayX = animTransform.x * scaleFactor;
    const displayY = animTransform.y * scaleFactor;
    const charSize = Math.max(0, 640 * (animTransform.scale || 1) * scaleFactor);

    const charImg = loadedImages[char.id];

    if (charImg) {
      ctx.translate(displayX, displayY);
      ctx.rotate(((animTransform.rotation || 0) * Math.PI) / 180);
      ctx.drawImage(charImg, -charSize / 2, -charSize / 2, charSize, charSize);
    } else {
      // Fallback placeholder circle
      ctx.translate(displayX, displayY);
      ctx.rotate(((animTransform.rotation || 0) * Math.PI) / 180);

      ctx.beginPath();
      ctx.arc(0, 0, charSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = char.color + '33';
      ctx.fill();
      ctx.strokeStyle = char.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = char.color;
      ctx.font = `bold ${charSize * 0.4}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.name[0]?.toUpperCase() || '?', 0, 0);
    }

    ctx.restore();
  });

  // 3. Draw captions in track hierarchy order on top of everything (reversed so top tracks draw on top)
  [...state.tracks].reverse().forEach(track => {
    if (track.type !== 'character') return;
    
    const charId = track.characterId;
    const char = state.characters.find(c => c.id === charId);
    if (!char) return;

    const block = activeBlocks.find(b => b.characterId === charId);
    if (!block) return;

    const charTransform = state.characterTransforms[char.id] || {
      x: state.canvasWidth / 2,
      y: state.canvasHeight * 0.65,
      scale: 1,
      rotation: 0,
    };
    const animTransform = getAnimatedTransform(block, charTransform, time);
    if (!animTransform) return;

    ctx.save();
    const captionKey = `caption_${char.id}`;
    const defaultCaptionTransform = {
      x: state.canvasWidth / 2,
      y: state.canvasHeight * 0.85,
      scale: 1,
      rotation: 0,
    };
    const captionTransform = state.characterTransforms[captionKey] || defaultCaptionTransform;

    ctx.globalAlpha = animTransform.opacity ?? 1;

    const displayCx = captionTransform.x * scaleFactor;
    const displayCy = captionTransform.y * scaleFactor;

    // Get text style options
    const style = {
      ...(char.textStyle || {
        fontFamily: 'Impact',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 4,
        shadowColor: 'rgba(0,0,0,0.5)',
        shadowBlur: 10,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        glowColor: 'rgba(124,77,255,0)',
        glowBlur: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backgroundPadding: 10,
        showBackground: true,
        letterSpacing: 2,
        lineHeight: 1.4,
        wordsPerLine: 3,
        caseMode: 'uppercase',
      }),
      ...(block.textStyle || {})
    };

    const wordsPerLine = style.wordsPerLine ?? 3;
    let activeText = getCaptionTextForTime(block.text, block.startTime, block.duration, time, wordsPerLine);
    if (!activeText) {
      ctx.restore();
      return;
    }

    // Apply Case Mode
    if (style.caseMode === 'uppercase') {
      activeText = activeText.toUpperCase();
    } else if (style.caseMode === 'lowercase') {
      activeText = activeText.toLowerCase();
    }

    const fontSize = Math.max(10, Math.floor((style.fontSize || 36) * captionTransform.scale * scaleFactor));
    ctx.font = `900 ${fontSize}px ${style.fontFamily || 'Impact, sans-serif'}`;
    ctx.letterSpacing = `${style.letterSpacing ?? 2}px`;

    // Wrap lines if they exceed max width
    const words = activeText.split(' ');
    const lines = [];
    let currentLine = '';
    const maxLineWidth = Math.max(120, state.canvasWidth * 0.75 * captionTransform.scale * scaleFactor);

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
      const w = ctx.measureText(line).width;
      if (w > blockWidth) blockWidth = w;
    });
    blockWidth = Math.max(50, blockWidth + padding * 2);
    const blockHeight = lines.length * lineHeight + padding * 2;

    const rx = displayCx - blockWidth / 2;
    const ry = displayCy - blockHeight / 2;

    // ─── Backdrop Box ───
    if (style.showBackground) {
      ctx.fillStyle = style.backgroundColor || 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      // Rounded rectangle
      ctx.roundRect(rx, ry, blockWidth, blockHeight, 8 * scaleFactor);
      ctx.fill();
    }

    // Configure text alignment
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ─── Text Drawing Passes (Shadow -> Glow -> Stroke -> Fill) ───
    lines.forEach((line, i) => {
      const lineY = ry + padding + i * lineHeight + lineHeight / 2;

      // Pass 1: Drop Shadow
      if (style.shadowColor && (style.shadowBlur > 0 || style.shadowOffsetX !== 0 || style.shadowOffsetY !== 0)) {
        ctx.save();
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = style.shadowBlur * scaleFactor;
        ctx.shadowOffsetX = style.shadowOffsetX * scaleFactor;
        ctx.shadowOffsetY = style.shadowOffsetY * scaleFactor;
        ctx.fillStyle = style.color || '#ffffff';
        ctx.fillText(line, displayCx, lineY);
        ctx.restore();
      }

      // Pass 2: Glow
      if (style.glowColor && style.glowBlur > 0) {
        ctx.save();
        ctx.shadowColor = style.glowColor;
        ctx.shadowBlur = style.glowBlur * scaleFactor;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = style.color || '#ffffff';
        ctx.fillText(line, displayCx, lineY);
        ctx.restore();
      }

      // Pass 3: Outline / Stroke
      if (style.strokeColor && style.strokeWidth > 0) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth * scaleFactor;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, displayCx, lineY);
      }

      // Pass 4: Core Text Fill
      ctx.fillStyle = style.color || '#ffffff';
      ctx.fillText(line, displayCx, lineY);
    });

    ctx.restore();
  });

  // 4. Draw selection handles in editor preview mode
  if (drawHandles && state.selectedElementId) {
    let cx, cy, w, h;
    const isCaption = state.selectedElementId.startsWith('caption_');
    
    if (isCaption) {
      const charId = state.selectedElementId.replace('caption_', '');
      const block = activeBlocks.find(b => b.characterId === charId);
      const char = state.characters.find(c => c.id === charId);
      if (block && char) {
        const captionTransform = state.characterTransforms[state.selectedElementId] || {
          x: state.canvasWidth / 2,
          y: state.canvasHeight * 0.85,
          scale: 1,
        };
        const displayCx = captionTransform.x * scaleFactor;
        const displayCy = captionTransform.y * scaleFactor;
        
        const style = {
          ...(char.textStyle || {}),
          ...(block.textStyle || {})
        };
        const wordsPerLine = style.wordsPerLine ?? 3;
        let activeText = getCaptionTextForTime(block.text, block.startTime, block.duration, time, wordsPerLine) || '';
        
        if (style.caseMode === 'uppercase') {
          activeText = activeText.toUpperCase();
        } else if (style.caseMode === 'lowercase') {
          activeText = activeText.toLowerCase();
        }

        const fontSize = Math.max(10, Math.floor((style.fontSize || 36) * captionTransform.scale * scaleFactor));
        ctx.font = `900 ${fontSize}px ${style.fontFamily || 'Impact, sans-serif'}`;
        ctx.letterSpacing = `${style.letterSpacing ?? 2}px`;
        
        const words = activeText.split(' ');
        const lines = [];
        let currentLine = '';
        const maxLineWidth = Math.max(120, state.canvasWidth * 0.75 * captionTransform.scale * scaleFactor);
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
        
        cx = displayCx;
        cy = displayCy;
        w = blockWidth;
        h = blockHeight;
      }
    } else {
      const char = state.characters.find(c => c.id === state.selectedElementId);
      const block = activeBlocks.find(b => b.characterId === state.selectedElementId);
      if (char && block) {
        const defaultTransform = state.characterTransforms[char.id] || {
          x: state.canvasWidth / 2,
          y: state.canvasHeight * 0.65,
          scale: 1,
          rotation: 0,
        };
        const animTransform = getAnimatedTransform(block, defaultTransform, time);
        if (animTransform) {
          cx = animTransform.x * scaleFactor;
          cy = animTransform.y * scaleFactor;
          w = 640 * animTransform.scale * scaleFactor;
          h = 640 * animTransform.scale * scaleFactor;
        }
      }
    }
    
    if (cx !== undefined && cy !== undefined && w !== undefined && h !== undefined) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      ctx.setLineDash([]);
      
      const handles = [
        { x: cx - w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy - h / 2 },
        { x: cx - w / 2, y: cy + h / 2 },
        { x: cx + w / 2, y: cy + h / 2 },
      ];
      handles.forEach(hnd => {
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.fillRect(hnd.x - 5, hnd.y - 5, 10, 10);
        ctx.strokeRect(hnd.x - 5, hnd.y - 5, 10, 10);
      });
      ctx.restore();
    }
  }
}
