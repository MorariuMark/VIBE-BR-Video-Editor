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
    'bounce': {
      name: 'Bounce In',
      apply: (progress, element) => {
        const bounce = Math.abs(Math.cos(progress * Math.PI * 2.5)) * (1 - progress) * 300;
        return {
          x: element.x,
          y: element.y - bounce,
          opacity: Math.min(1, progress * 2),
          scale: element.scale,
          rotation: element.rotation,
        };
      },
    },
    'flip': {
      name: 'Flip In',
      apply: (progress, element) => ({
        scale: element.scale * progress,
        rotation: element.rotation + (1 - progress) * 360,
        opacity: progress,
        x: element.x,
        y: element.y,
      }),
    },
    'slide-rotate': {
      name: 'Slide Rotate In',
      apply: (progress, element) => ({
        x: element.x - (1 - easeOutBack(progress)) * 300,
        y: element.y,
        rotation: element.rotation - (1 - progress) * 90,
        scale: element.scale,
        opacity: progress,
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
    'bounce': {
      name: 'Bounce Out',
      apply: (progress, element) => {
        const bounce = Math.abs(Math.cos((1 - progress) * Math.PI * 2.5)) * progress * 300;
        return {
          x: element.x,
          y: element.y - bounce,
          opacity: 1 - progress,
          scale: element.scale,
          rotation: element.rotation,
        };
      },
    },
    'flip': {
      name: 'Flip Out',
      apply: (progress, element) => ({
        scale: element.scale * (1 - progress),
        rotation: element.rotation + progress * 360,
        opacity: 1 - progress,
        x: element.x,
        y: element.y,
      }),
    },
    'slide-rotate': {
      name: 'Slide Rotate Out',
      apply: (progress, element) => ({
        x: element.x + progress * 300,
        y: element.y,
        rotation: element.rotation + progress * 90,
        scale: element.scale,
        opacity: 1 - progress,
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
    skewX: element.skewX ?? 0,
    skewY: element.skewY ?? 0,
    rotateX: element.rotateX ?? 0,
    rotateY: element.rotateY ?? 0,
    flipX: element.flipX ?? 1,
    flipY: element.flipY ?? 1,
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
  } else if (sustain === 'bounce-idle') {
    const t = currentTime;
    const dy = -Math.abs(Math.sin(t * sustainSpeed * 10)) * sustainIntensity * 30;
    baseTransform.y += dy;
  } else if (sustain === 'breath') {
    const t = currentTime;
    const ds = Math.sin(t * sustainSpeed * 6) * sustainIntensity * 0.15;
    baseTransform.scale *= (1 + ds);
  } else if (sustain === 'float') {
    const t = currentTime;
    const dy = Math.sin(t * sustainSpeed * 4) * sustainIntensity * 25;
    baseTransform.y += dy;
  } else if (sustain === 'dance') {
    const t = currentTime;
    const dx = Math.sin(t * sustainSpeed * 6) * sustainIntensity * 20;
    const dr = Math.cos(t * sustainSpeed * 6) * sustainIntensity * 10;
    baseTransform.x += dx;
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

/**
 * Calculate the interpolated transform of a character based on its keyframes at a given time.
 */
export function getInterpolatedKeyframeTransform(keyframes, time) {
  if (!keyframes || keyframes.length === 0) return null;
  
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  
  if (time <= sorted[0].time) {
    return { ...sorted[0] };
  }
  if (time >= sorted[sorted.length - 1].time) {
    return { ...sorted[sorted.length - 1] };
  }
  
  let i = 0;
  for (; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time < sorted[i+1].time) {
      break;
    }
  }
  
  const kf1 = sorted[i];
  const kf2 = sorted[i+1];
  const progress = (time - kf1.time) / (kf2.time - kf1.time);
  
  const lerp = (v1, v2, p) => v1 + (v2 - v1) * p;
  
  return {
    time,
    x: lerp(kf1.x, kf2.x, progress),
    y: lerp(kf1.y, kf2.y, progress),
    scale: lerp(kf1.scale, kf2.scale, progress),
    rotation: lerp(kf1.rotation ?? 0, kf2.rotation ?? 0, progress),
    opacity: lerp(kf1.opacity ?? 1, kf2.opacity ?? 1, progress),
    skewX: lerp(kf1.skewX ?? 0, kf2.skewX ?? 0, progress),
    skewY: lerp(kf1.skewY ?? 0, kf2.skewY ?? 0, progress),
    rotateX: lerp(kf1.rotateX ?? 0, kf2.rotateX ?? 0, progress),
    rotateY: lerp(kf1.rotateY ?? 0, kf2.rotateY ?? 0, progress),
    flipX: lerp(kf1.flipX ?? 1, kf2.flipX ?? 1, progress),
    flipY: lerp(kf1.flipY ?? 1, kf2.flipY ?? 1, progress),
  };
}
