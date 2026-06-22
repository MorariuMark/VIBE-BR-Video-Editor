/**
 * Animation Engine
 * 
 * Handles character PNG entrance, sustain, and exit animations
 * for the preview canvas rendering.
 */

// Available animation presets
export const ANIMATION_PRESETS = {
  entrance: {
    'slide-up': {
      name: 'Slide Up',
      apply: (progress, element) => ({
        x: element.x,
        y: element.y + (1 - easeOutBack(progress)) * 200,
        opacity: easeOutCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'slide-down': {
      name: 'Slide Down',
      apply: (progress, element) => ({
        x: element.x,
        y: element.y - (1 - easeOutBack(progress)) * 200,
        opacity: easeOutCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'slide-left': {
      name: 'Slide Left',
      apply: (progress, element) => ({
        x: element.x + (1 - easeOutBack(progress)) * 300,
        y: element.y,
        opacity: easeOutCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'slide-right': {
      name: 'Slide Right',
      apply: (progress, element) => ({
        x: element.x - (1 - easeOutBack(progress)) * 300,
        y: element.y,
        opacity: easeOutCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'pop': {
      name: 'Bouncy Pop',
      apply: (progress, element) => ({
        scale: element.scale * easeOutBack(progress),
        opacity: easeOutCubic(progress),
        x: element.x,
        y: element.y,
        rotation: element.rotation,
      }),
    },
    'fade': {
      name: 'Fade In',
      apply: (progress, element) => ({
        opacity: easeOutCubic(progress),
        scale: element.scale,
        x: element.x,
        y: element.y,
        rotation: element.rotation,
      }),
    },
    'zoom-spin': {
      name: 'Zoom Spin',
      apply: (progress, element) => ({
        scale: element.scale * easeOutBack(progress),
        rotation: element.rotation + (1 - easeOutCubic(progress)) * 180,
        opacity: easeOutCubic(progress),
        x: element.x,
        y: element.y,
      }),
    },
  },
  exit: {
    'slide-up': {
      name: 'Slide Up',
      apply: (progress, element) => ({
        x: element.x,
        y: element.y - easeInCubic(progress) * 200,
        opacity: 1 - easeInCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'slide-down': {
      name: 'Slide Down',
      apply: (progress, element) => ({
        x: element.x,
        y: element.y + easeInCubic(progress) * 200,
        opacity: 1 - easeInCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'slide-left': {
      name: 'Slide Left',
      apply: (progress, element) => ({
        x: element.x - easeInCubic(progress) * 300,
        y: element.y,
        opacity: 1 - easeInCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'slide-right': {
      name: 'Slide Right',
      apply: (progress, element) => ({
        x: element.x + easeInCubic(progress) * 300,
        y: element.y,
        opacity: 1 - easeInCubic(progress),
        scale: element.scale,
        rotation: element.rotation,
      }),
    },
    'pop': {
      name: 'Pop Out',
      apply: (progress, element) => ({
        scale: element.scale * (1 - easeInBack(progress)),
        opacity: 1 - easeInCubic(progress),
        x: element.x,
        y: element.y,
        rotation: element.rotation,
      }),
    },
    'fade': {
      name: 'Fade Out',
      apply: (progress, element) => ({
        opacity: 1 - easeInCubic(progress),
        scale: element.scale,
        x: element.x,
        y: element.y,
        rotation: element.rotation,
      }),
    },
    'zoom-spin': {
      name: 'Zoom Spin Out',
      apply: (progress, element) => ({
        scale: element.scale * (1 - easeInBack(progress)),
        rotation: element.rotation + easeInCubic(progress) * 180,
        opacity: 1 - easeInCubic(progress),
        x: element.x,
        y: element.y,
      }),
    },
  },
};

// ─── Easing Functions ───

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t) {
  return t * t * t;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

/**
 * Calculate the animated properties of a character element at a given time.
 * 
 * @param {Object} block - The dialogue block with timing info
 * @param {Object} element - The element's base transform { x, y, scale, rotation }
 * @param {number} currentTime - Current playback time in seconds
 * @returns {Object|null} - Animated properties or null if not visible
 */
export function getAnimatedTransform(block, element, currentTime) {
  const { startTime, duration, animation } = block;
  const endTime = startTime + duration;
  
  // Fallbacks for animation object
  const anim = animation || {};
  const entrance = anim.entrance || 'slide-up';
  const exit = anim.exit || 'slide-down';
  const entranceDur = anim.entranceDuration ?? 0.3;
  const exitDur = anim.exitDuration ?? 0.3;
  const sustain = anim.sustain || 'none';
  const sustainIntensity = anim.sustainIntensity ?? 0.5;
  const sustainSpeed = anim.sustainSpeed ?? 0.5;
  
  // Not in range at all
  if (currentTime < startTime || currentTime > endTime) {
    return null;
  }
  
  const elapsed = currentTime - startTime;
  const remaining = endTime - currentTime;
  
  // 1. Calculate base transform with sustain effects
  let baseTransform = {
    x: element.x,
    y: element.y,
    scale: element.scale,
    rotation: element.rotation,
    opacity: 1,
  };
  
  if (sustain === 'shake') {
    const t = currentTime;
    const dx = Math.sin(t * sustainSpeed * 25) * sustainIntensity * 15;
    const dy = Math.cos(t * sustainSpeed * 22) * sustainIntensity * 15;
    const dr = Math.sin(t * sustainSpeed * 18) * sustainIntensity * 6;
    baseTransform.x += dx;
    baseTransform.y += dy;
    baseTransform.rotation += dr;
  } else if (sustain === 'move-around') {
    const t = currentTime;
    const dx = Math.sin(t * sustainSpeed * 4) * sustainIntensity * 50;
    const dy = Math.cos(t * sustainSpeed * 3) * sustainIntensity * 40;
    const dr = Math.sin(t * sustainSpeed * 2) * sustainIntensity * 8;
    baseTransform.x += dx;
    baseTransform.y += dy;
    baseTransform.rotation += dr;
  }
  
  // 2. Entrance phase
  if (elapsed < entranceDur && entranceDur > 0) {
    const progress = elapsed / entranceDur;
    const preset = ANIMATION_PRESETS.entrance[entrance];
    if (preset) {
      const entrVal = preset.apply(progress, baseTransform);
      return { ...baseTransform, ...entrVal };
    }
  }
  
  // 3. Exit phase
  if (remaining < exitDur && exitDur > 0) {
    const progress = 1 - (remaining / exitDur);
    const preset = ANIMATION_PRESETS.exit[exit];
    if (preset) {
      const exitVal = preset.apply(progress, baseTransform);
      return { ...baseTransform, ...exitVal };
    }
  }
  
  return baseTransform;
}

/**
 * Check if a character should be visible at the given time.
 */
export function isBlockActive(block, currentTime) {
  return currentTime >= block.startTime && currentTime <= (block.startTime + block.duration);
}

/**
 * Get all active blocks at a given time.
 */
export function getActiveBlocks(blocks, currentTime) {
  return blocks.filter(block => isBlockActive(block, currentTime));
}
