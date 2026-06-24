import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { parseScript, recalculateTimings, addCustomCharacter, DEFAULT_TEXT_STYLE } from '../engine/scriptParser';

const ProjectContext = createContext(null);

// ─── Initial State ───
const initialState = {
  // Project metadata
  projectName: 'Untitled Project',
  
  // Media library
  mediaItems: [], // { id, name, type: 'video'|'audio'|'image', path, dataUrl, duration? }
  
  // Script
  scriptText: '',
  dialogueBlocks: [],
  characters: [], // { id, name, color, asset, colorIndex, textStyle }
  
  // Timeline
  tracks: [],
  pixelsPerSecond: 60,
  totalDuration: 30,
  currentTime: 0,
  isPlaying: false,
  selectedClipId: null,
  
  // Character transforms (for preview canvas)
  characterTransforms: {}, // characterId -> { x, y, scale, rotation }
  
  // Preview
  canvasWidth: 1080,
  canvasHeight: 1920,
  selectedElementId: null,
  
  // Audio
  audioFile: null, // { name, path, dataUrl, duration }
  audioBuffer: null,
  
  // Background video
  backgroundVideo: null, // { name, path, dataUrl, duration }
  
  // Export
  isExporting: false,
  exportProgress: 0,
  exportSettings: {
    width: 1080,
    height: 1920,
    fps: 60,
    codec: 'libx264',
    crf: 18,
  },
  
  // UI state
  activeTool: 'select', // 'select' | 'cut' | 'hand'
  activePanel: 'script', // 'script' | 'media' | 'export'
  showExportModal: false,
  toasts: [],
  
  // Voice configurations per character
  voiceConfigs: {},
};

// ─── Action Types ───
const ActionTypes = {
  SET_SCRIPT: 'SET_SCRIPT',
  PARSE_SCRIPT: 'PARSE_SCRIPT',
  UPDATE_BLOCK: 'UPDATE_BLOCK',
  UPDATE_BLOCK_TIMING: 'UPDATE_BLOCK_TIMING',
  SET_BLOCKS: 'SET_BLOCKS',
  ADD_CHARACTER: 'ADD_CHARACTER',
  UPDATE_CHARACTER: 'UPDATE_CHARACTER',
  REMOVE_CHARACTER: 'REMOVE_CHARACTER',
  ASSIGN_CHARACTER_ASSET: 'ASSIGN_CHARACTER_ASSET',
  
  ADD_MEDIA: 'ADD_MEDIA',
  REMOVE_MEDIA: 'REMOVE_MEDIA',
  RENAME_MEDIA: 'RENAME_MEDIA',
  SET_AUDIO: 'SET_AUDIO',
  SET_AUDIO_BUFFER: 'SET_AUDIO_BUFFER',
  SET_BACKGROUND_VIDEO: 'SET_BACKGROUND_VIDEO',
  
  SET_TRACKS: 'SET_TRACKS',
  SET_CURRENT_TIME: 'SET_CURRENT_TIME',
  SET_PLAYING: 'SET_PLAYING',
  SET_PIXELS_PER_SECOND: 'SET_PIXELS_PER_SECOND',
  SET_TOTAL_DURATION: 'SET_TOTAL_DURATION',
  SELECT_CLIP: 'SELECT_CLIP',
  
  SET_CHARACTER_TRANSFORM: 'SET_CHARACTER_TRANSFORM',
  SELECT_ELEMENT: 'SELECT_ELEMENT',
  
  SET_ACTIVE_TOOL: 'SET_ACTIVE_TOOL',
  SET_ACTIVE_PANEL: 'SET_ACTIVE_PANEL',
  SET_SHOW_EXPORT_MODAL: 'SET_SHOW_EXPORT_MODAL',
  SET_EXPORT_SETTINGS: 'SET_EXPORT_SETTINGS',
  SET_EXPORTING: 'SET_EXPORTING',
  SET_EXPORT_PROGRESS: 'SET_EXPORT_PROGRESS',
  
  ADD_TOAST: 'ADD_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',

  UPDATE_CHARACTER_STYLE: 'UPDATE_CHARACTER_STYLE',
  UPDATE_BLOCK_ANIMATION: 'UPDATE_BLOCK_ANIMATION',
  BATCH_UPDATE_ANIMATION: 'BATCH_UPDATE_ANIMATION',

  ADD_TRACK: 'ADD_TRACK',
  REMOVE_TRACK: 'REMOVE_TRACK',
  UPDATE_TRACK_PROPERTIES: 'UPDATE_TRACK_PROPERTIES',
  ADD_CLIP_TO_TRACK: 'ADD_CLIP_TO_TRACK',
  REMOVE_CLIP_FROM_TRACK: 'REMOVE_CLIP_FROM_TRACK',
  UPDATE_CLIP_TIMING: 'UPDATE_CLIP_TIMING',
  UPDATE_CLIP_PROPERTIES: 'UPDATE_CLIP_PROPERTIES',
  SET_VOICE_CONFIGS: 'SET_VOICE_CONFIGS',
};

// ─── Reducer ───
function projectReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_SCRIPT:
      return { ...state, scriptText: action.payload };
    
    case ActionTypes.PARSE_SCRIPT: {
      const { blocks, characters } = parseScript(action.payload || state.scriptText);
      
      // Merge with existing character assets and text styles
      const mergedCharacters = characters.map(char => {
        const existing = state.characters.find(c => c.id === char.id);
        return existing ? { ...char, asset: existing.asset, textStyle: existing.textStyle || char.textStyle } : char;
      });
      
      // Generate timeline tracks
      const tracks = generateTracksFromBlocks(blocks, mergedCharacters, state);
      
      // Calculate total duration
      const lastBlock = blocks[blocks.length - 1];
      const totalDuration = lastBlock
        ? Math.max(state.totalDuration, lastBlock.startTime + lastBlock.duration + 2)
        : state.totalDuration;
      
      return {
        ...state,
        dialogueBlocks: blocks,
        characters: mergedCharacters,
        tracks,
        totalDuration,
      };
    }
    
    case ActionTypes.UPDATE_BLOCK: {
      const blocks = state.dialogueBlocks.map(b =>
        b.id === action.payload.id ? { ...b, ...action.payload.changes } : b
      );
      const tracks = generateTracksFromBlocks(blocks, state.characters, state);
      return { ...state, dialogueBlocks: blocks, tracks };
    }
    
    case ActionTypes.UPDATE_BLOCK_TIMING: {
      const { blockId, startTime, duration } = action.payload;
      let blocks = state.dialogueBlocks.map(b =>
        b.id === blockId ? { ...b, startTime: startTime ?? b.startTime, duration: duration ?? b.duration } : b
      );
      const idx = blocks.findIndex(b => b.id === blockId);
      if (idx >= 0) {
        blocks = recalculateTimings(blocks, idx);
      }
      const tracks = generateTracksFromBlocks(blocks, state.characters, state);
      return { ...state, dialogueBlocks: blocks, tracks };
    }
    
    case ActionTypes.SET_BLOCKS: {
      const tracks = generateTracksFromBlocks(action.payload, state.characters, state);
      return { ...state, dialogueBlocks: action.payload, tracks };
    }
    
    case ActionTypes.ADD_CHARACTER: {
      const newChar = addCustomCharacter(state.characters, action.payload);
      return { ...state, characters: [...state.characters, newChar] };
    }
    
    case ActionTypes.UPDATE_CHARACTER: {
      const characters = state.characters.map(c =>
        c.id === action.payload.id ? { ...c, ...action.payload.changes } : c
      );
      return { ...state, characters };
    }
    
    case ActionTypes.REMOVE_CHARACTER:
      return {
        ...state,
        characters: state.characters.filter(c => c.id !== action.payload),
      };
    
    case ActionTypes.ASSIGN_CHARACTER_ASSET: {
      const { characterId, asset } = action.payload;
      const characters = state.characters.map(c =>
        c.id === characterId ? { ...c, asset } : c
      );
      return { ...state, characters };
    }

    case ActionTypes.UPDATE_CHARACTER_STYLE: {
      const { characterId, style } = action.payload;
      const characters = state.characters.map(c =>
        c.id === characterId ? { ...c, textStyle: { ...(c.textStyle || DEFAULT_TEXT_STYLE), ...style } } : c
      );
      return { ...state, characters };
    }

    case ActionTypes.UPDATE_BLOCK_ANIMATION: {
      const { blockId, animation } = action.payload;
      const blocks = state.dialogueBlocks.map(b =>
        b.id === blockId ? { ...b, animation: { ...(b.animation || {}), ...animation } } : b
      );
      const tracks = generateTracksFromBlocks(blocks, state.characters, state);
      return { ...state, dialogueBlocks: blocks, tracks };
    }

    case ActionTypes.BATCH_UPDATE_ANIMATION: {
      const { characterId, animation } = action.payload;
      const blocks = state.dialogueBlocks.map(b => {
        if (!characterId || b.characterId === characterId) {
          return { ...b, animation: { ...(b.animation || {}), ...animation } };
        }
        return b;
      });
      const tracks = generateTracksFromBlocks(blocks, state.characters, state);
      return { ...state, dialogueBlocks: blocks, tracks };
    }
    
    case ActionTypes.ADD_MEDIA:
      return { ...state, mediaItems: [...state.mediaItems, action.payload] };
    
    case ActionTypes.REMOVE_MEDIA:
      return { ...state, mediaItems: state.mediaItems.filter(m => m.id !== action.payload) };
    
    case ActionTypes.RENAME_MEDIA: {
      const { id, name } = action.payload;
      const mediaItems = state.mediaItems.map(m => m.id === id ? { ...m, name } : m);
      return { ...state, mediaItems };
    }
    
    case ActionTypes.SET_AUDIO: {
      const audio = action.payload;
      const tracks = state.tracks.map(track => {
        if (track.id === 'track_audio_1') {
          return {
            ...track,
            clips: audio ? [{
              id: 'clip_audio',
              name: audio.name || 'Dialogue Audio',
              startTime: 0,
              duration: audio.duration || state.totalDuration,
              color: '#00e5ff',
              path: audio.path,
              dataUrl: audio.dataUrl,
              type: 'audio',
            }] : [],
          };
        }
        return track;
      });
      return { ...state, audioFile: audio, tracks };
    }
    
    case ActionTypes.SET_AUDIO_BUFFER:
      return { ...state, audioBuffer: action.payload };
    
    case ActionTypes.SET_BACKGROUND_VIDEO: {
      const video = action.payload;
      const tracks = state.tracks.map(track => {
        if (track.id === 'track_bg_1') {
          return {
            ...track,
            clips: video ? [{
              id: 'clip_bg',
              name: video.name || 'Background',
              startTime: 0,
              duration: state.totalDuration,
              color: '#444466',
              path: video.path,
              dataUrl: video.dataUrl,
              type: 'video',
            }] : [],
          };
        }
        return track;
      });
      return { ...state, backgroundVideo: video, tracks };
    }

    case ActionTypes.ADD_TRACK: {
      const { type, name } = action.payload;
      const trackId = `${type}_track_${Date.now()}`;
      const color = type === 'audio' ? '#00e5ff' : '#444466';
      const newTrack = {
        id: trackId,
        name: name || `${type === 'audio' ? 'Audio' : 'Video'} Track`,
        type,
        color,
        clips: [],
      };
      return { ...state, tracks: [...state.tracks, newTrack] };
    }
    
    case ActionTypes.REMOVE_TRACK: {
      const trackId = action.payload;
      return { ...state, tracks: state.tracks.filter(t => t.id !== trackId) };
    }
    
    case ActionTypes.UPDATE_TRACK_PROPERTIES: {
      const { trackId, properties } = action.payload;
      const tracks = state.tracks.map(track => {
        if (track.id !== trackId) return track;
        return { ...track, ...properties };
      });
      return { ...state, tracks };
    }
    
    case ActionTypes.ADD_CLIP_TO_TRACK: {
      const { trackId, clip } = action.payload;
      const hasTrack = state.tracks.some(t => t.id === trackId);
      let tracks;
      if (!hasTrack) {
        const type = clip.type || 'video';
        const color = type === 'audio' ? '#00e5ff' : '#444466';
        const newTrack = {
          id: trackId,
          name: type === 'audio' ? 'Audio Track' : 'Video Track',
          type,
          color,
          clips: [clip],
        };
        tracks = [...state.tracks, newTrack];
      } else {
        tracks = state.tracks.map(track => {
          if (track.id !== trackId) return track;
          return {
            ...track,
            clips: [...track.clips, clip],
          };
        });
      }
      return { ...state, tracks };
    }
    
    case ActionTypes.REMOVE_CLIP_FROM_TRACK: {
      const { trackId, clipId } = action.payload;
      const tracks = state.tracks.map(track => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          clips: track.clips.filter(c => c.id !== clipId),
        };
      });
      return { ...state, tracks };
    }
    
    case ActionTypes.UPDATE_CLIP_TIMING: {
      const { trackId, clipId, startTime, duration } = action.payload;
      const tracks = state.tracks.map(track => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          clips: track.clips.map(clip => {
            if (clip.id !== clipId) return clip;
            return {
              ...clip,
              startTime: startTime ?? clip.startTime,
              duration: duration ?? clip.duration,
            };
          }),
        };
      });
      return { ...state, tracks };
    }
    
    case ActionTypes.UPDATE_CLIP_PROPERTIES: {
      const { trackId, clipId, properties } = action.payload;
      const tracks = state.tracks.map(track => {
        if (track.id !== trackId) return track;
        return {
          ...track,
          clips: track.clips.map(clip => {
            if (clip.id !== clipId) return clip;
            return { ...clip, ...properties };
          }),
        };
      });
      return { ...state, tracks };
    }
    
    case ActionTypes.SET_TRACKS:
      return { ...state, tracks: action.payload };
    
    case ActionTypes.SET_CURRENT_TIME:
      return { ...state, currentTime: action.payload };
    
    case ActionTypes.SET_PLAYING:
      return { ...state, isPlaying: action.payload };
    
    case ActionTypes.SET_PIXELS_PER_SECOND:
      return { ...state, pixelsPerSecond: action.payload };
    
    case ActionTypes.SET_TOTAL_DURATION:
      return { ...state, totalDuration: action.payload };
    
    case ActionTypes.SELECT_CLIP:
      return { ...state, selectedClipId: action.payload };
    
    case ActionTypes.SET_CHARACTER_TRANSFORM: {
      const { characterId, transform } = action.payload;
      return {
        ...state,
        characterTransforms: {
          ...state.characterTransforms,
          [characterId]: {
            ...(state.characterTransforms[characterId] || {}),
            ...transform,
          },
        },
      };
    }
    
    case ActionTypes.SELECT_ELEMENT:
      return { ...state, selectedElementId: action.payload };
    
    case ActionTypes.SET_ACTIVE_TOOL:
      return { ...state, activeTool: action.payload };
    
    case ActionTypes.SET_ACTIVE_PANEL:
      return { ...state, activePanel: action.payload };
    
    case ActionTypes.SET_SHOW_EXPORT_MODAL:
      return { ...state, showExportModal: action.payload };
    
    case ActionTypes.SET_EXPORT_SETTINGS:
      return { ...state, exportSettings: { ...state.exportSettings, ...action.payload } };
    
    case ActionTypes.SET_EXPORTING:
      return { ...state, isExporting: action.payload };
    
    case ActionTypes.SET_EXPORT_PROGRESS:
      return { ...state, exportProgress: action.payload };
    
    case ActionTypes.ADD_TOAST:
      return { ...state, toasts: [...state.toasts, action.payload] };
    
    case ActionTypes.REMOVE_TOAST:
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
      
    case ActionTypes.SET_VOICE_CONFIGS:
      return { ...state, voiceConfigs: { ...(state.voiceConfigs || {}), ...action.payload } };
    
    default:
      return state;
  }
}

/**
 * Generate timeline tracks from dialogue blocks
 */
function generateTracksFromBlocks(blocks, characters, state) {
  // 1. Character tracks (placed at the top of the stack)
  const charTracks = characters.map(char => {
    const charBlocks = blocks.filter(b => b.characterId === char.id);
    return {
      id: `track_${char.id}`,
      name: char.name,
      type: 'character',
      color: char.color,
      characterId: char.id,
      clips: charBlocks.map(block => ({
        id: block.id,
        name: `${char.name}: "${block.text.substring(0, 30)}..."`,
        startTime: block.startTime,
        duration: block.duration,
        color: char.color,
        blockId: block.id,
      })),
    };
  });

  // 2. Keep user tracks (video & audio tracks), but sync any clips that have a blockId!
  const userTracks = (state.tracks || []).filter(t => t.type === 'video' || t.type === 'audio');
  
  const syncedUserTracks = userTracks.map(track => {
    return {
      ...track,
      clips: track.clips.map(clip => {
        if (clip.blockId) {
          const correspondingBlock = blocks.find(b => b.id === clip.blockId);
          if (correspondingBlock) {
            return {
              ...clip,
              startTime: correspondingBlock.startTime,
              duration: correspondingBlock.duration,
            };
          }
        }
        return clip;
      }),
    };
  });

  // If there are no user tracks yet, create default Video 1 and Audio 1 tracks
  if (syncedUserTracks.length === 0) {
    syncedUserTracks.push({
      id: 'track_bg_1',
      name: 'Video 1',
      type: 'video',
      color: '#444466',
      clips: state.backgroundVideo ? [{
        id: 'clip_bg',
        name: state.backgroundVideo.name || 'Background',
        startTime: 0,
        duration: state.totalDuration,
        color: '#444466',
        path: state.backgroundVideo.path,
        dataUrl: state.backgroundVideo.dataUrl,
        type: 'video',
      }] : [],
    });
    
    syncedUserTracks.push({
      id: 'track_audio_1',
      name: 'Audio 1',
      type: 'audio',
      color: '#00e5ff',
      clips: state.audioFile ? [{
        id: 'clip_audio',
        name: state.audioFile.name || 'Dialogue Audio',
        startTime: 0,
        duration: state.audioFile.duration || state.totalDuration,
        color: '#00e5ff',
        path: state.audioFile.path,
        dataUrl: state.audioFile.dataUrl,
        type: 'audio',
      }] : [],
    });
  }

  // Combined tracks
  const combined = [...charTracks, ...syncedUserTracks];
  
  // Sort tracks by existing order if available
  if (state.tracks && state.tracks.length > 0) {
    const existingIds = state.tracks.map(t => t.id);
    combined.sort((a, b) => {
      const idxA = existingIds.indexOf(a.id);
      const idxB = existingIds.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }
  
  return combined;
}

// ─── Context Provider ───
export function ProjectProvider({ children }) {
  const [state, dispatch] = useReducer(projectReducer, initialState);

  // ── Action creators ──
  const actions = {
    setScript: useCallback((text) => {
      dispatch({ type: ActionTypes.SET_SCRIPT, payload: text });
    }, []),
    
    parseScript: useCallback((text) => {
      dispatch({ type: ActionTypes.PARSE_SCRIPT, payload: text });
    }, []),
    
    updateBlock: useCallback((id, changes) => {
      dispatch({ type: ActionTypes.UPDATE_BLOCK, payload: { id, changes } });
    }, []),
    
    updateBlockTiming: useCallback((blockId, startTime, duration) => {
      dispatch({ type: ActionTypes.UPDATE_BLOCK_TIMING, payload: { blockId, startTime, duration } });
    }, []),
    
    setBlocks: useCallback((blocks) => {
      dispatch({ type: ActionTypes.SET_BLOCKS, payload: blocks });
    }, []),
    
    addCharacter: useCallback((name) => {
      dispatch({ type: ActionTypes.ADD_CHARACTER, payload: name });
    }, []),
    
    updateCharacter: useCallback((id, changes) => {
      dispatch({ type: ActionTypes.UPDATE_CHARACTER, payload: { id, changes } });
    }, []),
    
    removeCharacter: useCallback((id) => {
      dispatch({ type: ActionTypes.REMOVE_CHARACTER, payload: id });
    }, []),
    
    assignCharacterAsset: useCallback((characterId, asset) => {
      dispatch({ type: ActionTypes.ASSIGN_CHARACTER_ASSET, payload: { characterId, asset } });
    }, []),
    
    addMedia: useCallback((item) => {
      dispatch({ type: ActionTypes.ADD_MEDIA, payload: item });
    }, []),
    
    removeMedia: useCallback((id) => {
      dispatch({ type: ActionTypes.REMOVE_MEDIA, payload: id });
    }, []),
    
    renameMedia: useCallback((id, name) => {
      dispatch({ type: ActionTypes.RENAME_MEDIA, payload: { id, name } });
    }, []),
    
    setAudio: useCallback((audio) => {
      dispatch({ type: ActionTypes.SET_AUDIO, payload: audio });
    }, []),
    
    setAudioBuffer: useCallback((buffer) => {
      dispatch({ type: ActionTypes.SET_AUDIO_BUFFER, payload: buffer });
    }, []),
    
    setBackgroundVideo: useCallback((video) => {
      dispatch({ type: ActionTypes.SET_BACKGROUND_VIDEO, payload: video });
    }, []),
    
    setCurrentTime: useCallback((time) => {
      dispatch({ type: ActionTypes.SET_CURRENT_TIME, payload: time });
    }, []),
    
    setPlaying: useCallback((playing) => {
      dispatch({ type: ActionTypes.SET_PLAYING, payload: playing });
    }, []),
    
    setPixelsPerSecond: useCallback((pps) => {
      dispatch({ type: ActionTypes.SET_PIXELS_PER_SECOND, payload: pps });
    }, []),
    
    setTotalDuration: useCallback((duration) => {
      dispatch({ type: ActionTypes.SET_TOTAL_DURATION, payload: duration });
    }, []),
    
    selectClip: useCallback((id) => {
      dispatch({ type: ActionTypes.SELECT_CLIP, payload: id });
    }, []),
    
    setCharacterTransform: useCallback((characterId, transform) => {
      dispatch({ type: ActionTypes.SET_CHARACTER_TRANSFORM, payload: { characterId, transform } });
    }, []),
    
    selectElement: useCallback((id) => {
      dispatch({ type: ActionTypes.SELECT_ELEMENT, payload: id });
    }, []),
    
    setActiveTool: useCallback((tool) => {
      dispatch({ type: ActionTypes.SET_ACTIVE_TOOL, payload: tool });
    }, []),
    
    setActivePanel: useCallback((panel) => {
      dispatch({ type: ActionTypes.SET_ACTIVE_PANEL, payload: panel });
    }, []),
    
    setShowExportModal: useCallback((show) => {
      dispatch({ type: ActionTypes.SET_SHOW_EXPORT_MODAL, payload: show });
    }, []),
    
    setExportSettings: useCallback((settings) => {
      dispatch({ type: ActionTypes.SET_EXPORT_SETTINGS, payload: settings });
    }, []),
    
    setExporting: useCallback((exporting) => {
      dispatch({ type: ActionTypes.SET_EXPORTING, payload: exporting });
    }, []),
    
    setExportProgress: useCallback((progress) => {
      dispatch({ type: ActionTypes.SET_EXPORT_PROGRESS, payload: progress });
    }, []),
    
    addToast: useCallback((message, type = 'info') => {
      const id = `toast_${Date.now()}`;
      dispatch({ type: ActionTypes.ADD_TOAST, payload: { id, message, type } });
      setTimeout(() => {
        dispatch({ type: ActionTypes.REMOVE_TOAST, payload: id });
      }, 4000);
    }, []),

    updateCharacterStyle: useCallback((characterId, style) => {
      dispatch({ type: ActionTypes.UPDATE_CHARACTER_STYLE, payload: { characterId, style } });
    }, []),

    updateBlockAnimation: useCallback((blockId, animation) => {
      dispatch({ type: ActionTypes.UPDATE_BLOCK_ANIMATION, payload: { blockId, animation } });
    }, []),

    batchUpdateAnimation: useCallback((characterId, animation) => {
      dispatch({ type: ActionTypes.BATCH_UPDATE_ANIMATION, payload: { characterId, animation } });
    }, []),

    addTrack: useCallback((type, name) => {
      dispatch({ type: ActionTypes.ADD_TRACK, payload: { type, name } });
    }, []),

    removeTrack: useCallback((trackId) => {
      dispatch({ type: ActionTypes.REMOVE_TRACK, payload: trackId });
    }, []),

    updateTrackProperties: useCallback((trackId, properties) => {
      dispatch({ type: ActionTypes.UPDATE_TRACK_PROPERTIES, payload: { trackId, properties } });
    }, []),

    addClipToTrack: useCallback((trackId, clip) => {
      dispatch({ type: ActionTypes.ADD_CLIP_TO_TRACK, payload: { trackId, clip } });
    }, []),

    removeClipFromTrack: useCallback((trackId, clipId) => {
      dispatch({ type: ActionTypes.REMOVE_CLIP_FROM_TRACK, payload: { trackId, clipId } });
    }, []),

    updateClipTiming: useCallback((trackId, clipId, startTime, duration) => {
      dispatch({ type: ActionTypes.UPDATE_CLIP_TIMING, payload: { trackId, clipId, startTime, duration } });
    }, []),

    updateClipProperties: useCallback((trackId, clipId, properties) => {
      dispatch({ type: ActionTypes.UPDATE_CLIP_PROPERTIES, payload: { trackId, clipId, properties } });
    }, []),

    setVoiceConfigs: useCallback((configs) => {
      dispatch({ type: ActionTypes.SET_VOICE_CONFIGS, payload: configs });
    }, []),
  };

  return (
    <ProjectContext.Provider value={{ state, actions, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
}

export { ActionTypes };
