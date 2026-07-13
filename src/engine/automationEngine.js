/**
 * VIBE Build Script (VBS) — Automation Engine
 * 
 * Parses and executes VBS commands sequentially to automate
 * the full video production pipeline: script parsing, voice generation,
 * timeline application, and rendering.
 */

// ─── TTS Server Config ───
const TTS_SERVER = 'http://127.0.0.1:5555';

const MODEL_NAMES = {
  luxtts: 'LuxTTS 1.7B',
  'qwen3tts_0.6b': 'Qwen3-TTS 0.6B',
  'qwen3tts_1.7b': 'Qwen3-TTS 1.7B',
};

const VALID_MODELS = Object.keys(MODEL_NAMES);

// ─── VBS Parser ───

/**
 * Parse a VBS script string into an array of command objects.
 * Handles multi-line strings delimited by triple-quotes (""").
 * Lines starting with # are comments and are skipped.
 * Empty lines are skipped.
 * 
 * @param {string} text - Raw VBS script text
 * @returns {Array<{command: string, args: string, line: number}>}
 */
export function parseVBS(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const commands = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i].trim();
    i++;

    // Skip empty lines and comments
    if (!rawLine || rawLine.startsWith('#')) continue;

    // Extract the command keyword (first word)
    const spaceIdx = rawLine.indexOf(' ');
    const command = spaceIdx === -1 ? rawLine : rawLine.substring(0, spaceIdx);
    let args = spaceIdx === -1 ? '' : rawLine.substring(spaceIdx + 1).trim();

    // Check for multi-line string delimiter """
    if (args.includes('"""')) {
      const tripleIdx = args.indexOf('"""');
      const prefix = args.substring(0, tripleIdx);
      let rest = args.substring(tripleIdx + 3);

      // Check if closing """ is on the same line
      const closeIdx = rest.indexOf('"""');
      if (closeIdx !== -1) {
        args = prefix + rest.substring(0, closeIdx);
      } else {
        // Collect lines until we find closing """
        const multiLines = [rest];
        while (i < lines.length) {
          const nextLine = lines[i];
          i++;
          const endIdx = nextLine.indexOf('"""');
          if (endIdx !== -1) {
            multiLines.push(nextLine.substring(0, endIdx));
            break;
          }
          multiLines.push(nextLine);
        }
        args = prefix + multiLines.join('\n');
      }
    }

    commands.push({
      command: command.toUpperCase(),
      args: args.trim(),
      line: i,
    });
  }

  return commands;
}

/**
 * Strip surrounding single or double quotes from a string.
 * 
 * @param {string} str
 * @returns {string}
 */
export function stripQuotes(str) {
  if (!str) return '';
  const trimmed = str.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.substring(1, trimmed.length - 1);
  }
  return trimmed;
}

/**
 * Parse key=value arguments from a command args string.
 * Supports quoted values: key="value with spaces"
 * Also extracts positional arguments (words not containing =)
 * 
 * @param {string} argsStr
 * @returns {{positional: string[], named: Object<string, string>}}
 */
function parseArgs(argsStr) {
  const positional = [];
  const named = {};

  if (!argsStr) return { positional, named };

  // Match key="value" or key=value or bare words
  const regex = /(\w+)="([^"]*?)"|(\w+)=(\S+)|(\S+)/g;
  let match;
  while ((match = regex.exec(argsStr)) !== null) {
    if (match[1] !== undefined) {
      // key="quoted value"
      named[match[1].toLowerCase()] = match[2];
    } else if (match[3] !== undefined) {
      // key=unquoted_value
      named[match[3].toLowerCase()] = match[4];
    } else if (match[5] !== undefined) {
      // bare positional word
      positional.push(stripQuotes(match[5]));
    }
  }

  return { positional, named };
}


// ─── VBS Executor ───

/**
 * Create a VBS executor bound to the app's actions, state getter, and log function.
 * 
 * @param {Object} actions - The ProjectContext actions object
 * @param {Function} getState - Function that returns current state snapshot
 * @param {Function} log - Function to log messages: log(message, type)
 *   where type is 'info' | 'success' | 'error' | 'warning' | 'system'
 * @returns {{ execute: Function, abort: Function }}
 */
export function createExecutor(actions, getState, log) {
  let aborted = false;
  let generatedVoiceResult = null; // Stores generated voice data between GENERATE_VOICES and APPLY_VOICES
  let activeFetchController = null;

  const abort = () => {
    aborted = true;
    log('⛔ Execution aborted by user.', 'error');
    if (activeFetchController) {
      log('🛑 Cancelling active network request...', 'warning');
      activeFetchController.abort();
    }
  };

  const checkAbort = () => {
    if (aborted) throw new Error('ABORTED');
  };

  // ─── Command Handlers ───

  const handlers = {
    /**
     * LOAD_PRESET <preset_name>
     * Loads a character preset: creating characters, assigning PNGs, setting voice configs.
     */
    async LOAD_PRESET(args) {
      const presetName = stripQuotes(args);
      if (!presetName) {
        throw new Error('LOAD_PRESET requires a preset name. Example: LOAD_PRESET "Peter & Stewie"');
      }

      log(`📦 Loading preset "${presetName}"...`, 'info');

      if (!window.electronAPI) {
        throw new Error('Loading presets requires the Electron desktop app.');
      }

      const isDefault = presetName.toLowerCase() === 'peter & stewie' || 
                        presetName.toLowerCase() === 'peter_stewie' || 
                        presetName.toLowerCase() === 'default';

      let presetData = null;

      if (isDefault) {
        log('   Applying default "Peter & Stewie" preset...', 'info');
        const projectPath = await window.electronAPI.getProjectPath();
        const projectPathNormalized = projectPath.replace(/\\/g, '/');

        presetData = {
          name: 'Peter & Stewie',
          characters: [
            {
              id: 'char_stewie',
              name: 'Stewie',
              colorIndex: 0,
              assetPath: `${projectPathNormalized}/assets/characters/stewie.png`,
              voice: {
                type: 'default',
                refPath: `${projectPathNormalized}/assets/default_voices/stewie_ref.wav`,
                refText: 'all this time spent keeping people from having sex and now i know how the catholic church feels buzzing',
                presetName: 'stewie'
              }
            },
            {
              id: 'char_peter',
              name: 'Peter',
              colorIndex: 1,
              assetPath: `${projectPathNormalized}/assets/characters/peter.png`,
              voice: {
                type: 'default',
                refPath: `${projectPathNormalized}/assets/default_voices/peter_ref.wav`,
                refText: "I'm gonna stare at his wife's boobs so hide that when they both go into the kitchen together it will be discussed",
                presetName: 'peter'
              }
            }
          ]
        };
      } else {
        const userPresets = await window.electronAPI.loadCharacterPresets();
        const match = userPresets.find(p => p.name.toLowerCase() === presetName.toLowerCase());
        if (!match) {
          throw new Error(`Preset "${presetName}" not found. Available: "Peter & Stewie"${userPresets.length > 0 ? ', ' + userPresets.map(p => `"${p.name}"`).join(', ') : ''}`);
        }
        presetData = match;
      }

      const voiceConfigs = { ...(getState().voiceConfigs || {}) };

      for (const charInfo of presetData.characters) {
        const currentCharacters = getState().characters;
        const exists = currentCharacters.some(c => c.id === charInfo.id);
        if (!exists) {
          actions.addCharacter(charInfo.name);
          await sleep(150);
        }

        if (charInfo.assetPath) {
          const fileData = await window.electronAPI.readFile(charInfo.assetPath);
          if (!fileData.error) {
            const asset = {
              name: fileData.name,
              path: fileData.path,
              dataUrl: `data:${fileData.mime};base64,${fileData.data}`,
            };
            actions.assignCharacterAsset(charInfo.id, asset);
          } else {
            log(`   ⚠️ Failed to load PNG for "${charInfo.name}": ${fileData.error}`, 'warning');
          }
        }

        if (charInfo.voice) {
          voiceConfigs[charInfo.id] = {
            type: charInfo.voice.type || 'default',
            refPath: charInfo.voice.refPath,
            refText: charInfo.voice.refText,
            presetName: charInfo.voice.presetName || '',
          };
        }
      }

      actions.setVoiceConfigs(voiceConfigs);
      log(`✅ Preset "${presetData.name}" loaded successfully!`, 'success');
    },

    /**
     * PARSE_SCRIPT """multi-line script"""
     */
    async PARSE_SCRIPT(args) {
      if (!args) {
        throw new Error('PARSE_SCRIPT requires a script text argument. Use triple quotes: PARSE_SCRIPT """..."""');
      }
      log('📜 Parsing script into dialogue blocks...', 'info');
      actions.setScript(args);
      actions.parseScript(args);

      // Allow React to process the state update
      await sleep(100);

      const state = getState();
      const blockCount = state.dialogueBlocks?.length || 0;
      const charCount = state.characters?.length || 0;
      log(`✅ Parsed ${blockCount} dialogue blocks with ${charCount} characters.`, 'success');

      if (charCount > 0) {
        const names = state.characters.map(c => c.name).join(', ');
        log(`   Characters: ${names}`, 'info');
      }
    },

    /**
     * LOAD_MODEL <model_name>
     * Valid: luxtts, qwen3tts_0.6b, qwen3tts_1.7b
     */
    async LOAD_MODEL(args) {
      const { positional } = parseArgs(args);
      const modelName = positional[0]?.toLowerCase();
      
      if (!modelName) {
        throw new Error('LOAD_MODEL requires a model name. Valid: ' + VALID_MODELS.join(', '));
      }

      // Normalize common user-friendly names
      const modelMap = {
        'luxtts': 'luxtts',
        'qwen3tts': 'qwen3tts_0.6b',
        'qwen3_tts': 'qwen3tts_0.6b',
        'qwen3tts_0.6b': 'qwen3tts_0.6b',
        'qwen_3_tts_0.6b': 'qwen3tts_0.6b',
        'qwen3_tts_0.6b': 'qwen3tts_0.6b',
        'qwen3tts_1.7b': 'qwen3tts_1.7b',
        'qwen_3_tts_1.7b': 'qwen3tts_1.7b',
        'qwen3_tts_1.7b': 'qwen3tts_1.7b',
      };

      const resolvedModel = modelMap[modelName] || modelName;

      if (!VALID_MODELS.includes(resolvedModel)) {
        throw new Error(`Unknown model "${modelName}". Valid: ${VALID_MODELS.join(', ')}`);
      }

      const displayName = MODEL_NAMES[resolvedModel];

      // Check server status first
      log(`🔌 Checking TTS server status...`, 'system');
      let statusData;
      try {
        const statusRes = await fetch(`${TTS_SERVER}/status`);
        statusData = await statusRes.json();
      } catch (err) {
        throw new Error(`TTS server is not running at ${TTS_SERVER}. Start the Python voice server first.`);
      }

      if (statusData.model_loaded && statusData.model_name === resolvedModel) {
        log(`✅ ${displayName} is already loaded in VRAM.`, 'success');
        return;
      }

      // Unload existing model if different one is loaded
      if (statusData.model_loaded) {
        log(`🔄 Unloading current model to switch to ${displayName}...`, 'info');
        await fetch(`${TTS_SERVER}/unload`, { method: 'POST' });
      }

      log(`⏳ Loading ${displayName} into VRAM...`, 'info');
      const loadRes = await fetch(`${TTS_SERVER}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: resolvedModel }),
      });
      const loadData = await loadRes.json();

      if (!loadData.success) {
        throw new Error(`Failed to load ${displayName}: ${loadData.error}`);
      }

      log(`✅ ${displayName} loaded successfully.`, 'success');
    },

    /**
     * SET_VOICE <character_name> type=default|custom [ref="path"] [text="transcript"]
     */
    async SET_VOICE(args) {
      const { positional, named } = parseArgs(args);
      const charName = positional[0]?.toLowerCase();

      if (!charName) {
        throw new Error('SET_VOICE requires a character name. Example: SET_VOICE stewie type=default');
      }

      const voiceType = named.type || 'default';
      const state = getState();

      const charNameLower = charName.trim().toLowerCase();
      // 1. Try exact match
      let char = state.characters.find(c => c.name.toLowerCase() === charNameLower);
      
      // 2. Try partial includes match
      if (!char) {
        char = state.characters.find(c => 
          c.name.toLowerCase().includes(charNameLower) || charNameLower.includes(c.name.toLowerCase())
        );
      }
      
      // 3. Try character ID match
      if (!char) {
        char = state.characters.find(c => c.id.toLowerCase().includes(charNameLower));
      }

      if (!char) {
        const availableChars = state.characters.map(c => `"${c.name}"`).join(', ');
        throw new Error(`Character "${charName}" not found. Available characters in timeline: ${availableChars || 'None'}`);
      }

      if (voiceType === 'default') {
        // Auto-resolve from default voices
        log(`🎤 Resolving default voice for "${char.name}"...`, 'info');

        if (!window.electronAPI?.listDefaultVoices) {
          throw new Error('Default voices are only available in the Electron desktop app.');
        }

        const defaultVoices = await window.electronAPI.listDefaultVoices();
        const match = defaultVoices.find(v => 
          charName.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(charName)
        );

        if (!match) {
          throw new Error(`No default voice found matching "${charName}". Available: ${defaultVoices.map(v => v.name).join(', ')}`);
        }

        const configs = { ...(state.voiceConfigs || {}) };
        configs[char.id] = {
          type: 'default',
          refPath: match.path,
          refText: match.transcript,
          presetName: match.name,
        };
        actions.setVoiceConfigs(configs);
        log(`✅ Voice set for "${char.name}" → default voice "${match.name}"`, 'success');

      } else if (voiceType === 'custom') {
        const refPath = named.ref;
        const refText = named.text;

        if (!refPath || !refText) {
          throw new Error('Custom voice requires ref="path/to/audio.wav" and text="transcript of the audio"');
        }

        const configs = { ...(state.voiceConfigs || {}) };
        configs[char.id] = {
          type: 'custom',
          refPath,
          refText,
          presetName: '',
        };
        actions.setVoiceConfigs(configs);
        log(`✅ Voice set for "${char.name}" → custom ref "${refPath}"`, 'success');
      } else {
        throw new Error(`Unknown voice type "${voiceType}". Use "default" or "custom".`);
      }
    },

    async GENERATE_VOICES() {
      const state = getState();

      if (!state.dialogueBlocks || state.dialogueBlocks.length === 0) {
        throw new Error('No dialogue blocks found. Run PARSE_SCRIPT first.');
      }

      // Validate all characters have voice configs
      const missing = [];
      state.characters.forEach(char => {
        const config = state.voiceConfigs?.[char.id];
        if (!config || !config.refPath || !config.refText) {
          missing.push(char.name);
        }
      });

      if (missing.length > 0) {
        throw new Error(`Missing voice references for: ${missing.join(', ')}. Use SET_VOICE for each character.`);
      }

      // Verify TTS server is online with a model loaded
      let statusData;
      try {
        activeFetchController = new AbortController();
        const statusRes = await fetch(`${TTS_SERVER}/status`, { signal: activeFetchController.signal });
        statusData = await statusRes.json();
        activeFetchController = null;
      } catch (err) {
        activeFetchController = null;
        throw new Error(`TTS server is not running at ${TTS_SERVER}. Start the Python voice server first.`);
      }

      if (!statusData.model_loaded) {
        throw new Error('No TTS model loaded. Run LOAD_MODEL first.');
      }

      const isQwen = (statusData.model_name || '').startsWith('qwen');

      log(`🎙️ Generating voices for ${state.dialogueBlocks.length} dialogue blocks...`, 'info');
      log(`   Model: ${MODEL_NAMES[statusData.model_name] || statusData.model_name}`, 'info');

      const projectPath = window.electronAPI ? await window.electronAPI.getProjectPath() : '.';
      const projectPathNormalized = projectPath.replace(/\\/g, '/');
      const timestamp = Math.floor(Date.now() / 1000);
      const voicesDir = `${projectPathNormalized}/dist/voices/generation_${timestamp}`;
      const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_');

      const updatedBlocks = JSON.parse(JSON.stringify(state.dialogueBlocks));

      for (let i = 0; i < state.dialogueBlocks.length; i++) {
        checkAbort();

        const block = state.dialogueBlocks[i];
        const config = state.voiceConfigs[block.characterId];
        const charName = sanitizeFilename(block.characterName || 'character');
        const savePath = `${voicesDir}/voice_${i + 1}_${charName}.wav`;

        log(`   [${i + 1}/${state.dialogueBlocks.length}] "${block.characterName}": "${block.text.substring(0, 50)}${block.text.length > 50 ? '...' : ''}"`, 'info');

        const bodyPayload = {
          text: block.text,
          language: 'English',
          ref_audio: config.refPath,
          ref_text: config.refText,
          save_path: savePath,
          temperature: isQwen ? 0.0 : 0.5,
        };

        if (!isQwen) {
          bodyPayload.speed = 1.0;
        }

        let data;
        try {
          activeFetchController = new AbortController();
          const response = await fetch(`${TTS_SERVER}/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            signal: activeFetchController.signal,
          });
          data = await response.json();
          activeFetchController = null;
        } catch (err) {
          activeFetchController = null;
          throw err;
        }

        if (!data.success) {
          throw new Error(`Failed generating clip ${i + 1} (${block.characterName}): ${data.error}`);
        }

        updatedBlocks[i].wavPath = data.wav_path;
        updatedBlocks[i].duration = data.duration;
        updatedBlocks[i].words = data.words || [];

        log(`   ✓ Generated ${data.duration.toFixed(2)}s clip. Applying to timeline...`, 'success');

        // Apply this single voice clip immediately
        if (window.electronAPI?.applyTimelineVoices) {
          const singleVoice = {
            audioPath: data.wav_path,
            characterName: block.characterName,
            blockId: block.id,
            characterId: block.characterId,
            duration: data.duration,
            index: i,
            words: data.words || [],
          };

          const syncRes = await window.electronAPI.applyTimelineVoices({
            voices: [singleVoice],
            voiceConfigs: state.voiceConfigs,
            isRedo: false,
          });

          if (syncRes.success) {
            // Wait for media item to be processed and state updated
            await sleep(400);

            const currentState = getState();
            const mediaItem = currentState.mediaItems.find(m => m.blockId === block.id);
            if (mediaItem) {
              const applyItem = {
                blockId: block.id,
                duration: data.duration,
                words: data.words || [],
                name: mediaItem.name,
                path: mediaItem.path,
                dataUrl: mediaItem.dataUrl,
              };
              actions.applyVoices([applyItem]);
              await sleep(150);
            }
          }
        }
      }

      // Store results just in case
      generatedVoiceResult = { dialogueBlocks: updatedBlocks };
      log(`✅ All ${state.dialogueBlocks.length} voice clips generated and applied to timeline!`, 'success');
    },

    /**
     * APPLY_VOICES
     * Applies the most recently generated voice clips to the timeline.
     */
    async APPLY_VOICES() {
      const state = getState();
      const hasAudioClips = state.tracks.some(track => 
        track.type === 'audio' && track.clips.some(c => c.blockId)
      );

      if (hasAudioClips) {
        log('✓ Voice clips already applied on-the-fly.', 'success');
        return;
      }

      if (!generatedVoiceResult || !generatedVoiceResult.dialogueBlocks) {
        throw new Error('No generated voices to apply. Run GENERATE_VOICES first.');
      }

      log('📎 Applying voice clips to timeline...', 'info');
      const updatedBlocks = generatedVoiceResult.dialogueBlocks;

      // Build voice items for the IPC call (same format as VoiceCloneWindow)
      if (window.electronAPI && window.electronAPI.applyTimelineVoices) {
        const voices = updatedBlocks.map((block, idx) => ({
          audioPath: block.wavPath,
          characterName: block.characterName,
          blockId: block.id,
          characterId: block.characterId,
          duration: block.duration,
          index: idx,
          words: block.words || [],
        }));

        const syncRes = await window.electronAPI.applyTimelineVoices({
          voices,
          voiceConfigs: state.voiceConfigs,
          isRedo: false,
        });

        if (!syncRes.success) {
          throw new Error(`Failed to apply voices: ${syncRes.error}`);
        }

        // Wait for the IPC message to be processed by App.jsx
        await sleep(500);

        // Now apply voices to timeline using BATCH_APPLY_VOICES
        // Read media items that were just added
        const currentState = getState();
        const voiceMediaItems = currentState.mediaItems.filter(m => m.isVoiceClone);

        if (voiceMediaItems.length > 0) {
          const applyItems = voiceMediaItems
            .filter(m => updatedBlocks.some(b => b.id === m.blockId))
            .map(m => {
              const block = updatedBlocks.find(b => b.id === m.blockId);
              return {
                blockId: m.blockId,
                duration: block?.duration || m.duration,
                words: block?.words || m.words || [],
                name: m.name,
                path: m.path,
                dataUrl: m.dataUrl,
              };
            });

          if (applyItems.length > 0) {
            actions.applyVoices(applyItems);
            await sleep(200);
          }
        }

        log(`✅ ${voices.length} voice clips applied to timeline!`, 'success');
      } else {
        throw new Error('Voice application requires the Electron desktop app.');
      }

      generatedVoiceResult = null;
    },

    /**
     * RENDER [output="path"] [codec=libx264] [crf=18] [fps=30]
     */
    async RENDER(args) {
      const { named } = parseArgs(args);

      if (!window.electronAPI) {
        throw new Error('Rendering requires the Electron desktop app.');
      }

      const state = getState();

      if (!state.backgroundVideo && state.dialogueBlocks.length === 0) {
        throw new Error('Nothing to render! Add a background video or parse a script first.');
      }

      // Resolve output path
      let outputPath = named.output;
      if (!outputPath) {
        // Prompt user with save dialog
        outputPath = await window.electronAPI.saveFileDialog({
          defaultPath: `brainrot_${Date.now()}.mp4`,
        });
        if (!outputPath) {
          log('⚠️ Export cancelled by user.', 'warning');
          return;
        }
      } else {
        // Resolve relative paths against user's Downloads folder
        if (!outputPath.includes(':') && !outputPath.startsWith('/') && !outputPath.startsWith('\\')) {
          // Relative path - put in Downloads if it looks like just a filename
          let downloadsDir = 'C:\\Users\\User\\Downloads';
          if (window.electronAPI?.getDownloadsPath) {
            downloadsDir = await window.electronAPI.getDownloadsPath();
          }
          outputPath = `${downloadsDir}\\${outputPath}`;
        }
        // Ensure .mp4 extension
        if (!outputPath.toLowerCase().endsWith('.mp4')) {
          outputPath += '.mp4';
        }
      }

      // Apply export settings overrides
      const exportSettings = { ...state.exportSettings };
      if (named.fps) exportSettings.fps = parseInt(named.fps, 10);
      if (named.codec) exportSettings.codec = named.codec;
      if (named.crf) exportSettings.crf = parseInt(named.crf, 10);
      if (named.width && named.height) {
        exportSettings.width = parseInt(named.width, 10);
        exportSettings.height = parseInt(named.height, 10);
      }

      actions.setExportSettings(exportSettings);

      log(`🎬 Starting render...`, 'info');
      log(`   Output: ${outputPath}`, 'info');
      log(`   Resolution: ${exportSettings.width}x${exportSettings.height} @ ${exportSettings.fps}fps`, 'info');
      log(`   Codec: ${exportSettings.codec}, CRF: ${exportSettings.crf}`, 'info');

      // Mix audio tracks
      const audioClips = [];
      state.tracks.forEach(track => {
        if (track.type === 'audio') {
          track.clips.forEach(clip => {
            if (clip.path) {
              audioClips.push({
                path: clip.path,
                startTime: clip.startTime,
                duration: clip.duration,
              });
            }
          });
        }
      });

      let finalAudioPath = '';
      if (audioClips.length > 0 && window.electronAPI.mixAudioClips) {
        log(`🔊 Mixing ${audioClips.length} audio clips...`, 'info');
        const projectPath = await window.electronAPI.getProjectPath();
        const tempAudioOutput = `${projectPath.replace(/\\/g, '/')}/dist/temp_mix_${Date.now()}.wav`;
        const mixRes = await window.electronAPI.mixAudioClips({
          clips: audioClips,
          outputPath: tempAudioOutput,
        });
        if (mixRes.success) {
          finalAudioPath = tempAudioOutput;
          log(`   ✓ Audio mixed successfully.`, 'success');
        } else {
          log(`   ⚠️ Audio mixing failed: ${mixRes.error}. Using first clip.`, 'warning');
          finalAudioPath = audioClips[0].path;
        }
      }

      // Preload character images
      const { drawFrame } = await import('./renderEngine.js');

      const loadedImages = {};
      for (const char of state.characters) {
        if (char.asset && char.asset.dataUrl) {
          await new Promise((resolve) => {
            const img = new Image();
            img.src = char.asset.dataUrl;
            img.onload = () => { loadedImages[char.id] = img; resolve(); };
            img.onerror = () => resolve();
          });
        }
      }

      // Preload timeline image clips
      for (const track of state.tracks) {
        if (track.type === 'video') {
          for (const clip of track.clips) {
            if (clip.type === 'image' && clip.dataUrl) {
              await new Promise((resolve) => {
                const img = new Image();
                img.src = clip.dataUrl;
                img.onload = () => { loadedImages[clip.id] = img; resolve(); };
                img.onerror = () => resolve();
              });
            }
          }
        }
      }

      // Setup export canvas
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportSettings.width;
      exportCanvas.height = exportSettings.height;
      const exportCtx = exportCanvas.getContext('2d');

      const fps = exportSettings.fps;
      const totalFrames = Math.ceil(state.totalDuration * fps);

      log(`   Total frames: ${totalFrames} (${state.totalDuration.toFixed(2)}s)`, 'info');

      // Start FFmpeg frame-by-frame export
      const exportPromise = window.electronAPI.startFrameExport({
        settings: exportSettings,
        audioPath: finalAudioPath,
        backgroundVideoPath: state.backgroundVideo?.path || '',
        totalDuration: state.totalDuration,
        outputPath,
      });

      const maxInFlight = 8;
      const activePromises = [];

      for (let i = 0; i < totalFrames; i++) {
        checkAbort();

        const time = i / fps;

        drawFrame(exportCtx, {
          state,
          time,
          width: exportCanvas.width,
          height: exportCanvas.height,
          loadedImages,
          videoElement: null,
          drawHandles: false,
          transparentBackground: true,
        });

        const imgData = exportCtx.getImageData(0, 0, exportCanvas.width, exportCanvas.height).data;
        const sendPromise = window.electronAPI.sendFrame(imgData);
        activePromises.push(sendPromise);

        if (activePromises.length >= maxInFlight) {
          const success = await activePromises.shift();
          if (!success) {
            throw new Error('FFmpeg frame write failed.');
          }
        }

        // Progress logging every 10%
        if (i > 0 && i % Math.floor(totalFrames / 10) === 0) {
          const pct = Math.round((i / totalFrames) * 100);
          log(`   ⏳ Rendering: ${pct}% (frame ${i}/${totalFrames})`, 'info');
        }
      }

      // Wait for remaining frames
      const results = await Promise.all(activePromises);
      if (results.some(r => !r)) {
        throw new Error('FFmpeg final frame write failed.');
      }

      await window.electronAPI.endFrameExport();
      const result = await exportPromise;

      if (result.success) {
        log(`✅ Render complete! Saved to: ${outputPath}`, 'success');
      } else {
        throw new Error(`Render failed: ${result.error}`);
      }
    },

    /**
     * UNLOAD_MODEL
     * Frees TTS model from VRAM.
     */
    async UNLOAD_MODEL() {
      log('🧹 Unloading TTS model from VRAM...', 'info');
      try {
        const res = await fetch(`${TTS_SERVER}/unload`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          log('✅ Model unloaded successfully. VRAM freed.', 'success');
        } else {
          log(`⚠️ Unload returned: ${data.error || 'unknown error'}`, 'warning');
        }
      } catch (err) {
        log(`⚠️ Could not unload model (server may be offline): ${err.message}`, 'warning');
      }
    },

    /**
     * WAIT <seconds>
     * Pauses execution for the specified number of seconds.
     */
    async WAIT(args) {
      const seconds = parseFloat(args);
      if (isNaN(seconds) || seconds <= 0) {
        throw new Error('WAIT requires a positive number of seconds.');
      }
      log(`⏸️ Waiting ${seconds}s...`, 'info');
      await sleep(seconds * 1000);
      log(`   ✓ Wait complete.`, 'success');
    },

    /**
     * SET <property> <value>
     * Sets project properties.
     */
    async SET(args) {
      const { positional } = parseArgs(args);
      const prop = positional[0]?.toLowerCase();
      const value = positional.slice(1).join(' ');

      if (!prop) {
        throw new Error('SET requires a property name. Example: SET resolution 1080x1920');
      }

      switch (prop) {
        case 'resolution': {
          const match = value.match(/(\d+)x(\d+)/);
          if (!match) throw new Error('Resolution format: WIDTHxHEIGHT (e.g., 1080x1920)');
          const width = parseInt(match[1], 10);
          const height = parseInt(match[2], 10);
          actions.setProjectResolution(width, height);
          log(`✅ Resolution set to ${width}x${height}`, 'success');
          break;
        }
        case 'fps': {
          const fps = parseInt(value, 10);
          if (isNaN(fps) || fps <= 0) throw new Error('FPS must be a positive integer.');
          actions.setExportSettings({ fps });
          log(`✅ FPS set to ${fps}`, 'success');
          break;
        }
        case 'name':
        case 'project_name':
        case 'projectname': {
          log(`✅ Project name set to "${value}"`, 'success');
          break;
        }
        default:
          throw new Error(`Unknown property "${prop}". Valid: resolution, fps, name`);
      }
    },
  };

  // ─── Main Executor ───

  async function execute(commands) {
    aborted = false;
    generatedVoiceResult = null;

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
    log('🚀 VBS Execution Started', 'system');
    log(`   ${commands.length} commands to execute`, 'system');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');

    const startTime = Date.now();

    for (let i = 0; i < commands.length; i++) {
      checkAbort();

      const cmd = commands[i];
      const handler = handlers[cmd.command];

      if (!handler) {
        log(`❌ Unknown command: "${cmd.command}" (line ${cmd.line})`, 'error');
        throw new Error(`Unknown command "${cmd.command}". Valid commands: ${Object.keys(handlers).join(', ')}`);
      }

      log(`\n[${i + 1}/${commands.length}] ${cmd.command} ${cmd.args ? '...' : ''}`, 'system');

      try {
        await handler(cmd.args);
      } catch (err) {
        log(`🔄 Error/Abort encountered. Automatically unloading model from GPU memory to free VRAM...`, 'warning');
        try {
          await handlers.UNLOAD_MODEL();
        } catch (unloadErr) {
          log(`⚠️ Unload fallback failed: ${unloadErr.message}`, 'warning');
        }

        if (err.message === 'ABORTED') {
          log('⛔ Execution aborted.', 'error');
          return { success: false, aborted: true };
        }
        log(`❌ Error in ${cmd.command}: ${err.message}`, 'error');
        return { success: false, error: err.message };
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
    log(`✅ VBS Execution Complete! (${elapsed}s)`, 'success');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');

    return { success: true };
  }

  return { execute, abort };
}


// ─── Utilities ───

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ─── Example VBS Script ───

export const EXAMPLE_VBS = `# ═══════════════════════════════════════════════
# VIBE Build Script — Family Guy Brain Rot
# Automated video production pipeline
# ═══════════════════════════════════════════════

# Step 1: Load preset characters, assets, and voice setups
LOAD_PRESET "Peter & Stewie"

# Step 2: Parse the dialogue script
PARSE_SCRIPT """
**Stewie:** I can't believe you ate my cereal, Peter.
**Peter:** Hehehehe, it was delicious Stewie.
**Stewie:** You absolute buffoon. That was imported from Switzerland.
**Peter:** Switzerland? I thought it was from Stop and Shop.
**Stewie:** I will destroy you.
"""

# Step 3: Load the TTS model
LOAD_MODEL luxtts

# Step 4: Configure character voices
SET_VOICE stewie type=default
SET_VOICE peter type=default

# Step 5: Generate audio clips
GENERATE_VOICES

# Step 6: Apply generated audio to timeline
APPLY_VOICES

# Step 7: Set export settings and render
SET fps 30
RENDER output="family_guy_brainrot_ep1.mp4"

# Step 7: Clean up GPU memory
UNLOAD_MODEL
`;
