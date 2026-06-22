/**
 * Export Engine
 * 
 * Generates FFmpeg commands to composite the final video
 * from background videos, character PNGs with animations, and audio.
 */

/**
 * Generate FFmpeg filter complex for character overlay animations.
 * 
 * @param {Object} config
 * @param {string} config.backgroundVideo - Path to background video
 * @param {Array} config.blocks - Dialogue blocks with timing
 * @param {Object} config.characterAssets - Map of characterId -> asset path
 * @param {Object} config.characterTransforms - Map of characterId -> { x, y, scale }
 * @param {string} config.audioPath - Path to audio file
 * @param {string} config.outputPath - Path for output file
 * @param {Object} config.settings - Export settings { width, height, fps, codec }
 * @returns {{ args: string[] }}
 */
export function generateFFmpegCommand(config) {
  const {
    backgroundVideo,
    blocks,
    characterAssets,
    characterTransforms,
    audioPath,
    outputPath,
    settings = {},
  } = config;

  const width = settings.width || 1080;
  const height = settings.height || 1920;
  const fps = settings.fps || 60;
  const codec = settings.codec || 'libx264';
  const crf = settings.crf || 18;

  const args = [];
  const inputs = [];
  const filterParts = [];

  // Background setup (Input 0 if video path provided)
  if (backgroundVideo) {
    args.push('-i', backgroundVideo);
    inputs.push('bg');
    filterParts.push(
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1[bg]`
    );
  } else {
    // Generate solid black/dark theme background
    const lastBlock = blocks[blocks.length - 1];
    const duration = lastBlock ? Math.max(30, lastBlock.startTime + lastBlock.duration + 2) : 30;
    filterParts.push(
      `color=c=0x0a0a0f:s=${width}x${height}:d=${duration}[bg]`
    );
  }

  // Add character image inputs
  const usedCharacters = new Map();
  blocks.forEach((block) => {
    if (!usedCharacters.has(block.characterId) && characterAssets[block.characterId]) {
      const inputIndex = inputs.length; // Index in the inputs array
      args.push('-i', characterAssets[block.characterId]);
      usedCharacters.set(block.characterId, inputIndex);
      inputs.push(`char_${block.characterId}`);
    }
  });

  // Build overlay chain
  let currentBase = 'bg';
  let overlayIndex = 0;

  blocks.forEach((block, i) => {
    const inputIndex = usedCharacters.get(block.characterId);
    if (inputIndex === undefined) return;

    const transform = characterTransforms[block.characterId] || { x: width / 2, y: height * 0.65, scale: 1 };
    const startTime = block.startTime;
    const endTime = block.startTime + block.duration;
    const outputLabel = `ov${overlayIndex}`;

    // Scale the character PNG (640 logical pixels base)
    const charScale = Math.round(640 * transform.scale);

    // Calculate overlay position (center the character)
    const overlayX = Math.round(transform.x - charScale / 2);
    const overlayY = Math.round(transform.y - charScale / 2);

    const scaledLabel = `scaled${overlayIndex}`;
    
    filterParts.push(
      `[${inputIndex}:v]scale=${charScale}:${charScale}:flags=lanczos,` +
      `format=rgba[${scaledLabel}]`
    );

    // Overlay with enable/disable based on timing
    filterParts.push(
      `[${currentBase}][${scaledLabel}]overlay=x=${overlayX}:y=${overlayY}:` +
      `enable='between(t,${startTime.toFixed(2)},${endTime.toFixed(2)})'` +
      `[${outputLabel}]`
    );

    currentBase = outputLabel;
    overlayIndex++;
  });

  // ── Subtitles / Captions (top layer) ──
  blocks.forEach((block) => {
    const words = block.text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return;
    
    const chunks = [];
    for (let i = 0; i < words.length; i += 3) {
      chunks.push(words.slice(i, i + 3).join(' '));
    }
    const numChunks = chunks.length;
    const chunkDuration = block.duration / numChunks;
    
    chunks.forEach((chunkText, chunkIndex) => {
      const chunkStart = block.startTime + chunkIndex * chunkDuration;
      const chunkEnd = block.startTime + (chunkIndex + 1) * chunkDuration;
      
      const escapedText = escapeFFmpegText(chunkText);
      const captionKey = `caption_${block.characterId}`;
      const transform = characterTransforms[captionKey] || {
        x: width / 2,
        y: height * 0.85,
        scale: 1
      };
      
      const fontSize = Math.round(36 * transform.scale);
      const outputLabel = `txt${overlayIndex}`;
      
      filterParts.push(
        `[${currentBase}]drawtext=text='${escapedText}':x=${transform.x}-tw/2:y=${transform.y}-th/2:` +
        `fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=${Math.round(fontSize * 0.6)}:` +
        `enable='between(t,${chunkStart.toFixed(2)},${chunkEnd.toFixed(2)})'[${outputLabel}]`
      );
      
      currentBase = outputLabel;
      overlayIndex++;
    });
  });

  // Audio input
  if (audioPath) {
    args.push('-i', audioPath);
  }

  // Build the full filter complex
  const filterComplex = filterParts.join(';\n');
  
  // Construct final args
  const finalArgs = [
    '-y', // Overwrite
    ...args,
    '-filter_complex', filterComplex,
    '-map', `[${currentBase}]`,
  ];

  if (audioPath) {
    const audioIndex = inputs.length; // The audio is the last input
    finalArgs.push('-map', `${audioIndex}:a`);
  }

  // Calculate script duration
  const lastBlock = blocks[blocks.length - 1];
  const scriptDuration = lastBlock ? (lastBlock.startTime + lastBlock.duration) : 30;

  finalArgs.push(
    '-c:v', codec,
    '-preset', 'medium',
    '-crf', String(crf),
    '-r', String(fps),
    '-s', `${width}x${height}`,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', scriptDuration.toFixed(2), // Limit video duration to script length
    '-shortest',
    outputPath
  );

  return { args: finalArgs };
}

function escapeFFmpegText(text) {
  if (!text) return '';
  return text
    .replace(/'/g, '') // remove single quotes
    .replace(/"/g, '') // remove double quotes
    .replace(/:/g, ' ') // replace colons with space
    .replace(/,/g, ' ') // replace commas with space
    .replace(/\\/g, ''); // remove backslashes
}

/**
 * Generate a simpler export command for canvas-based rendering.
 * This creates a sequence of frames that can be encoded by FFmpeg.
 */
export function generateCanvasExportConfig(config) {
  const {
    width = 1080,
    height = 1920,
    fps = 60,
    duration = 30,
  } = config;

  return {
    width,
    height,
    fps,
    totalFrames: Math.ceil(duration * fps),
    frameDuration: 1 / fps,
  };
}

/**
 * Export settings presets
 */
export const EXPORT_PRESETS = {
  'tiktok-vertical': {
    name: 'TikTok / Reels (Vertical)',
    width: 1080,
    height: 1920,
    fps: 60,
    codec: 'libx264',
    crf: 18,
  },
  'youtube-shorts': {
    name: 'YouTube Shorts',
    width: 1080,
    height: 1920,
    fps: 60,
    codec: 'libx264',
    crf: 18,
  },
  'youtube-landscape': {
    name: 'YouTube (Landscape)',
    width: 1920,
    height: 1080,
    fps: 60,
    codec: 'libx264',
    crf: 18,
  },
  'instagram-square': {
    name: 'Instagram (Square)',
    width: 1080,
    height: 1080,
    fps: 30,
    codec: 'libx264',
    crf: 18,
  },
};
