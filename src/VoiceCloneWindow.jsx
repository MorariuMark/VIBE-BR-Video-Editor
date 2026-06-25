import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function VoiceCloneWindow() {
  const [serverOnline, setServerOnline] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [serverStatus, setServerStatus] = useState('Checking...');
  const [gpuName, setGpuName] = useState('Detecting...');
  const [vramTotal, setVramTotal] = useState(null); // GB, null = unknown
  const [loadingModel, setLoadingModel] = useState(false);
  const [unloadingModel, setUnloadingModel] = useState(false);
  const [selectedModel, setSelectedModel] = useState('luxtts');
  const [autoUnload, setAutoUnload] = useState(false); // false = keep model in VRAM after generation
  const [splitPercent, setSplitPercent] = useState(60); // left panel % width
  const mainLayoutRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Project state loaded from main process
  const [characters, setCharacters] = useState([]);
  const [dialogueBlocks, setDialogueBlocks] = useState([]);

  // Default voices & Presets
  const [defaultVoices, setDefaultVoices] = useState([]);
  const [presets, setPresets] = useState([]);

  // Voice configuration per character ID
  // Map of characterId -> { type: 'default'|'preset'|'custom', refPath: '', refText: '', presetName: '' }
  const [voiceConfigs, setVoiceConfigs] = useState({});

  // Generation settings
  const [pauseDuration, setPauseDuration] = useState(0.3);
  const [generating, setGenerating] = useState(false);
  const [genLogs, setGenLogs] = useState([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(-1);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Audio Playback
  const [playingAudio, setPlayingAudio] = useState(null);
  const [playingBlobUrl, setPlayingBlobUrl] = useState(null);
  const [generatedResult, setGeneratedResult] = useState(null);
  const audioRef = useRef(new Audio());

  // Theme synchronization from local storage
  useEffect(() => {
    const applyTheme = () => {
      const activeTheme = localStorage.getItem('theme') || 'default';
      document.body.classList.remove('theme-dark-gay', 'theme-premiere');
      if (activeTheme === 'dark-gay') {
        document.body.classList.add('theme-dark-gay');
      } else if (activeTheme === 'premiere') {
        document.body.classList.add('theme-premiere');
      }
    };

    applyTheme();

    const handleStorageChange = (e) => {
      if (e.key === 'theme') {
        applyTheme();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 1. Initial Load & Heartbeat
  useEffect(() => {
    // Read project state sent by main window
    const loadProjectState = async () => {
      if (window.electronAPI && window.electronAPI.getActiveProjectState) {
        const state = await window.electronAPI.getActiveProjectState();
        if (state) {
          setCharacters(state.characters || []);
          setDialogueBlocks(state.dialogueBlocks || []);
          
          // Initialize configs
          const configs = {};
          state.characters.forEach(char => {
            if (state.voiceConfigs && state.voiceConfigs[char.id]) {
              configs[char.id] = state.voiceConfigs[char.id];
            } else {
              configs[char.id] = {
                type: 'default',
                refPath: '',
                refText: '',
                presetName: ''
              };
            }
          });
          setVoiceConfigs(configs);
          return { characters: state.characters || [], voiceConfigs: state.voiceConfigs || {} };
        }
      }
      return { characters: [], voiceConfigs: {} };
    };

    // Load presets & default voices
    const loadMetadata = async (loadedState) => {
      const activeCharacters = loadedState?.characters || [];
      const activeVoiceConfigs = loadedState?.voiceConfigs || {};

      if (window.electronAPI) {
        const defaultList = await window.electronAPI.listDefaultVoices();
        setDefaultVoices(defaultList || []);

        const presetList = await window.electronAPI.loadVoicePresets();
        setPresets(presetList || []);

        // Auto-assign default voices to characters if matches (e.g. Peter, Stewie)
        if (defaultList && defaultList.length > 0) {
          setVoiceConfigs(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(charId => {
              if (activeVoiceConfigs[charId] && activeVoiceConfigs[charId].refPath) {
                next[charId] = activeVoiceConfigs[charId];
                return;
              }
              const char = activeCharacters.find(c => c.id === charId);
              const charName = char ? char.name.toLowerCase() : '';
              
              // Find matching default voice
              const match = defaultList.find(v => charName.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(charName));
              if (match) {
                next[charId] = {
                  type: 'default',
                  refPath: match.path,
                  refText: match.transcript,
                  presetName: match.name
                };
              }
            });
            return next;
          });
        }
      }
    };

    loadProjectState().then(loadMetadata);

    // Heartbeat check Flask server
    const checkServer = async () => {
      try {
        const res = await fetch('http://127.0.0.1:5555/status');
        if (res.ok) {
          const data = await res.json();
          setServerOnline(true);
          setModelLoaded(data.model_loaded);
          if (data.model_loaded && data.model_type) {
            setSelectedModel(data.model_type);
          }
          setGpuName(data.gpu_name || 'CPU');
          if (data.vram_total != null) {
            setVramTotal(data.vram_total);
          }
          setServerStatus('Online');
        } else {
          setServerOnline(false);
          setServerStatus('Error');
        }
      } catch (err) {
        setServerOnline(false);
        setServerStatus('Offline (Waiting for .venv startup...)');
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 3000);
    return () => clearInterval(interval);
  }, [characters.length]);

  // Beforeunload: free GPU VRAM when window is closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use keepalive: true so the fetch completes even if the page is unloading
      try {
        navigator.sendBeacon('http://127.0.0.1:5555/unload', '{}');
      } catch (e) {
        fetch('http://127.0.0.1:5555/unload', { method: 'POST', keepalive: true }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Draggable resizer for the main layout panels
  const handleResizerMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const container = mainLayoutRef.current;
    if (!container) return;

    const onMouseMove = (ev) => {
      if (!isDraggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const newPercent = Math.max(25, Math.min(75, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPercent(newPercent);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // 2. Model Controls
  const handleLoadModel = async () => {
    setLoadingModel(true);
    const modelNameDisplay = selectedModel === 'qwen3tts_0.6b' ? 'Qwen3-TTS 0.6B' : 'LuxTTS 1.7B';
    addLog(`System: Requesting ${modelNameDisplay} load into VRAM...`);
    try {
      const res = await fetch('http://127.0.0.1:5555/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: selectedModel })
      });
      const data = await res.json();
      if (data.success) {
        setModelLoaded(true);
        addLog(`System: ${modelNameDisplay} loaded successfully.`);
      } else {
        addLog(`System Error: ${data.error}`);
      }
    } catch (err) {
      addLog(`System Error: Failed to connect to server - ${err.message}`);
    } finally {
      setLoadingModel(false);
    }
  };

  const handleUnloadModel = async () => {
    setUnloadingModel(true);
    addLog('System: Requesting model unload to free VRAM...');
    try {
      const res = await fetch('http://127.0.0.1:5555/unload', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setModelLoaded(false);
        addLog('System: Model unloaded. GPU VRAM cleared.');
      } else {
        addLog(`System Error: ${data.error}`);
      }
    } catch (err) {
      addLog(`System Error: ${err.message}`);
    } finally {
      setUnloadingModel(false);
    }
  };

  const handleModelChange = async (e) => {
    const val = e.target.value;
    setSelectedModel(val);
    
    if (modelLoaded) {
      setLoadingModel(true);
      const modelNameDisplay = val === 'qwen3tts_0.6b' ? 'Qwen3-TTS 0.6B' : 'LuxTTS 1.7B';
      addLog(`System: Hot-swapping model to ${modelNameDisplay}...`);
      try {
        const res = await fetch('http://127.0.0.1:5555/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: val })
        });
        const data = await res.json();
        if (data.success) {
          addLog(`System: ${modelNameDisplay} loaded successfully.`);
        } else {
          addLog(`System Error: ${data.error}`);
          setModelLoaded(false);
        }
      } catch (err) {
        addLog(`System Error: ${err.message}`);
      } finally {
        setLoadingModel(false);
      }
    }
  };

  // 3. File dialog for custom reference audio
  const handleSelectAudioFile = async (charId) => {
    if (!window.electronAPI) return;
    const files = await window.electronAPI.openFileDialog({
      filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg'] }]
    });
    if (files && files.length > 0) {
      const filePath = files[0];
      setVoiceConfigs(prev => ({
        ...prev,
        [charId]: {
          ...prev[charId],
          type: 'custom',
          refPath: filePath
        }
      }));
    }
  };

  // 4. Save Preset
  const handleSaveAsPreset = async (charId, charName) => {
    const config = voiceConfigs[charId];
    if (!config || !config.refPath || !config.refText) {
      alert('Please provide reference audio and reference transcript text first.');
      return;
    }
    const presetName = prompt(`Enter a name for this voice preset:`, charName);
    if (!presetName) return;

    const preset = {
      name: presetName,
      refPath: config.refPath,
      refText: config.refText
    };

    if (window.electronAPI && window.electronAPI.saveVoicePreset) {
      const res = await window.electronAPI.saveVoicePreset(preset);
      if (res.success) {
        // Refresh preset list
        const presetList = await window.electronAPI.loadVoicePresets();
        setPresets(presetList || []);
        
        // Switch voiceConfig to this preset
        setVoiceConfigs(prev => ({
          ...prev,
          [charId]: {
            ...prev[charId],
            type: 'preset',
            presetName: preset.name
          }
        }));
        alert(`Preset "${preset.name}" saved successfully!`);
      } else {
        alert(`Failed to save preset: ${res.error}`);
      }
    }
  };

  // 5. Play Reference Audio
  // 5. Play Reference Audio (Safely loaded as Blob URL to prevent file:/// scheme load crashes)
  const togglePlayAudio = async (filePath) => {
    if (playingAudio === filePath) {
      audioRef.current.pause();
      setPlayingAudio(null);
      if (playingBlobUrl) {
        URL.revokeObjectURL(playingBlobUrl);
        setPlayingBlobUrl(null);
      }
    } else {
      try {
        let audioUrl = '';
        if (window.electronAPI) {
          const fileBuffer = await window.electronAPI.readFileBuffer(filePath);
          if (fileBuffer && !fileBuffer.error) {
            const arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
            new Uint8Array(arrayBuffer).set(fileBuffer);
            const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
            audioUrl = URL.createObjectURL(blob);
            setPlayingBlobUrl(audioUrl);
          } else {
            console.error("Failed to read file buffer for preview:", fileBuffer?.error);
            audioUrl = `file:///${filePath.replace(/\\/g, '/')}`;
          }
        } else {
          audioUrl = `file:///${filePath.replace(/\\/g, '/')}`;
        }
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        setPlayingAudio(filePath);
        audioRef.current.onended = () => {
          setPlayingAudio(null);
          if (audioUrl.startsWith('blob:')) {
            URL.revokeObjectURL(audioUrl);
            setPlayingBlobUrl(null);
          }
        };
      } catch (err) {
        console.error("Audio playback error:", err);
      }
    }
  };

  const handleApplyResult = async () => {
    if (!generatedResult || !generatedResult.dialogueBlocks) return;
    
    addLog("Media Library: Sending generated audio clips to Media Library...");
    try {
      if (window.electronAPI && window.electronAPI.applyTimelineVoices) {
        const voices = generatedResult.dialogueBlocks.map((block, idx) => ({
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
          voiceConfigs
        });
        
        if (syncRes.success) {
          addLog("Success: All generated audio files added to Media Library! You can close this window.");
        } else {
          throw new Error(`Failed to import voices: ${syncRes.error}`);
        }
      } else {
        addLog("Warning: Development mode - skipped import (Electron context missing).");
      }
    } catch (err) {
      addLog(`Fatal Error during apply: ${err.message}`);
    }
  };

  const handleDiscardResult = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingAudio(null);
    if (playingBlobUrl) {
      URL.revokeObjectURL(playingBlobUrl);
      setPlayingBlobUrl(null);
    }
    setGeneratedResult(null);
    setGenerationProgress(0);
    addLog("System: Discarded generated voiceover. Ready to re-generate.");
  };

  // 6. Handle Config Changes
  const handleConfigTypeChange = (charId, type) => {
    let refPath = '';
    let refText = '';
    let presetName = '';

    if (type === 'default' && defaultVoices.length > 0) {
      const char = characters.find(c => c.id === charId);
      const charName = char ? char.name.toLowerCase() : '';
      const match = defaultVoices.find(v => charName.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(charName)) || defaultVoices[0];
      refPath = match.path;
      refText = match.transcript;
      presetName = match.name;
    } else if (type === 'preset' && presets.length > 0) {
      refPath = presets[0].refPath;
      refText = presets[0].refText;
      presetName = presets[0].name;
    }

    setVoiceConfigs(prev => ({
      ...prev,
      [charId]: {
        type,
        refPath,
        refText,
        presetName
      }
    }));
  };

  const handleSelectPreset = (charId, presetName) => {
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setVoiceConfigs(prev => ({
        ...prev,
        [charId]: {
          ...prev[charId],
          refPath: preset.refPath,
          refText: preset.refText,
          presetName: preset.name
        }
      }));
    }
  };

  const handleSelectDefaultVoice = (charId, voiceName) => {
    const voice = defaultVoices.find(v => v.name === voiceName);
    if (voice) {
      setVoiceConfigs(prev => ({
        ...prev,
        [charId]: {
          ...prev[charId],
          refPath: voice.path,
          refText: voice.transcript,
          presetName: voice.name
        }
      }));
    }
  };

  const handleTranscriptChange = (charId, text) => {
    setVoiceConfigs(prev => ({
      ...prev,
      [charId]: {
        ...prev[charId],
        refText: text
      }
    }));
  };

  // 7. Generation Loop
  const addLog = (msg) => {
    const timeStr = new Date().toLocaleTimeString();
    setGenLogs(prev => [`[${timeStr}] ${msg}`, ...prev]);
  };

  const handleGenerateVoiceover = async () => {
    if (dialogueBlocks.length === 0) {
      alert("No dialogue script parsed. Write a script in the main editor first.");
      return;
    }
    
    // Validate that every character has a voice configuration
    const missing = [];
    characters.forEach(char => {
      const config = voiceConfigs[char.id];
      if (!config || !config.refPath || !config.refText) {
        missing.push(char.name);
      }
    });

    if (missing.length > 0) {
      alert(`Missing voice references for: ${missing.join(', ')}. Please assign a voice clip before starting.`);
      return;
    }

    setGenerating(true);
    setGenLogs([]);
    addLog("Start: Setting up voice synthesis pipeline...");

    try {
      // 1. Force load model
      if (!modelLoaded) {
        const modelNameDisplay = selectedModel === 'qwen3tts_0.6b' ? 'Qwen3-TTS 0.6B' : 'LuxTTS 1.7B';
        addLog(`System: Model not loaded. Loading ${modelNameDisplay} now...`);
        const loadRes = await fetch('http://127.0.0.1:5555/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: selectedModel })
        });
        const loadData = await loadRes.json();
        if (!loadData.success) {
          throw new Error(`Failed to load model: ${loadData.error}`);
        }
        setModelLoaded(true);
        addLog(`System: ${modelNameDisplay} loaded successfully.`);
      }

      const projectPath = window.electronAPI ? await window.electronAPI.getProjectPath() : '.';
      const projectPathNormalized = projectPath.replace(/\\/g, '/');
      const timestamp = Math.floor(Date.now() / 1000);
      const voicesDir = `${projectPathNormalized}/dist/voices/generation_${timestamp}`;
      const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_');

      const updatedBlocks = JSON.parse(JSON.stringify(dialogueBlocks)); // deep clone

      // 2. Loop blocks sequentially
      for (let i = 0; i < dialogueBlocks.length; i++) {
        setCurrentBlockIndex(i);
        const block = dialogueBlocks[i];
        const config = voiceConfigs[block.characterId];
        const charName = sanitizeFilename(block.characterName || 'character');
        const savePath = `${voicesDir}/voice_${i + 1}_${charName}.wav`;

        addLog(`Speech Generation [${i + 1}/${dialogueBlocks.length}]: Character '${block.characterName}' speaking...`);

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
          throw new Error(`Failed generating clip for line ${i + 1} (${block.characterName}): ${data.error}`);
        }

        updatedBlocks[i].wavPath = data.wav_path;
        updatedBlocks[i].duration = data.duration; // Update block with actual speaking duration
        updatedBlocks[i].words = data.words || [];

        setGenerationProgress(((i + 1) / dialogueBlocks.length) * 100);
      }

      setGenerationProgress(100);
      addLog("Success: Audio files generated successfully! You can preview individual lines in the list above, then click Accept to import them into the Media Library.");
      
      setGeneratedResult({
        dialogueBlocks: updatedBlocks
      });

      // 3. Conditionally unload model from VRAM depending on user preference
      if (autoUnload) {
        addLog("GPU: Auto-unload is ON — freeing VRAM...");
        await handleUnloadModel();
      } else {
        addLog("GPU: Auto-unload is OFF — model stays loaded in VRAM for re-use.");
      }

    } catch (err) {
      addLog(`Fatal Error: ${err.message}`);
      setGenerationProgress(0);
    } finally {
      setGenerating(false);
      setCurrentBlockIndex(-1);
    }
  };

  return (
    <div className="clone-container">
      <style>{`
        .clone-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: var(--bg-primary, #060609);
          color: var(--text-primary, #e3e3e8);
          font-family: var(--font-sans, 'Outfit', 'Inter', sans-serif);
          padding: 24px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
          padding-bottom: 16px;
          margin-bottom: 20px;
        }

        .header__title {
          font-size: 20px;
          font-weight: 700;
          color: var(--accent-primary, #00e5ff);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-bar {
          background: var(--bg-secondary, rgba(255, 255, 255, 0.03));
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.05));
          border-radius: var(--radius-md, 8px);
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .dot--green { background: #00e676; box-shadow: 0 0 8px #00e676; }
        .dot--yellow { background: #ffd740; box-shadow: 0 0 8px #ffd740; }
        .dot--red { background: #ff4081; box-shadow: 0 0 8px #ff4081; }

        .btn {
          background: var(--accent-primary, #7c4dff);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: var(--radius-sm, 4px);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .btn:hover {
          background: var(--accent-primary-hover, #651fff);
        }

        .btn--secondary {
          background: var(--bg-elevated, rgba(255, 255, 255, 0.08));
          color: var(--text-secondary, #e3e3e8);
        }

        .btn--secondary:hover {
          background: var(--bg-hover, rgba(255, 255, 255, 0.15));
        }

        .btn--accent {
          background: var(--accent-secondary, #00e5ff);
          color: var(--bg-primary, #060609);
        }

        .btn--accent:hover {
          background: var(--accent-primary-hover, #00b0ff);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .main-layout {
          display: flex;
          flex: 1;
          gap: 0;
          min-height: 0;
        }

        .left-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
          padding-right: 12px;
          min-width: 0;
        }

        .resizer-bar {
          width: 6px;
          flex-shrink: 0;
          cursor: col-resize;
          background: transparent;
          position: relative;
          margin: 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .resizer-bar::after {
          content: '';
          display: block;
          width: 2px;
          height: 60px;
          background: var(--border-default, rgba(255, 255, 255, 0.12));
          border-radius: 2px;
          transition: background 0.2s;
        }

        .resizer-bar:hover::after {
          background: var(--accent-primary, #00e5ff);
        }

        .right-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: var(--bg-secondary, rgba(255, 255, 255, 0.02));
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.04));
          border-radius: var(--radius-md, 8px);
          padding: 16px;
          min-height: 0;
          min-width: 0;
        }

        .card {
          background: var(--bg-secondary, rgba(255, 255, 255, 0.02));
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.05));
          border-radius: var(--radius-md, 8px);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .card__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card__title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary, #fff);
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .form-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
        }

        .form-control {
          background: var(--bg-primary, #0f0f15);
          border: 1px solid var(--border-strong, rgba(255, 255, 255, 0.1));
          color: var(--text-primary, #fff);
          border-radius: var(--radius-sm, 4px);
          padding: 6px 10px;
          font-size: 13px;
          flex: 1;
        }

        .form-control:focus {
          border-color: var(--accent-primary, #00e5ff);
          outline: none;
        }

        .textarea-control {
          height: 60px;
          resize: none;
        }

        .input-number {
          width: 70px;
          flex: none;
        }

        .logs-container {
          background: var(--bg-primary, #020204);
          border: 1px solid var(--border-default, rgba(255, 255, 255, 0.05));
          border-radius: var(--radius-sm, 6px);
          padding: 10px;
          flex: 1;
          overflow-y: auto;
          font-family: monospace;
          font-size: 12px;
          color: var(--text-secondary, #a0a0b0);
          display: flex;
          flex-direction: column;
        }

        .log-entry {
          margin-bottom: 4px;
          line-height: 1.4;
        }

        .progress-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 600;
        }

        .bar-outer {
          height: 8px;
          background: var(--border-default, rgba(255, 255, 255, 0.05));
          border-radius: 4px;
          overflow: hidden;
        }

        .bar-inner {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary, #00e5ff));
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .script-preview {
          list-style: none;
          padding: 0;
          margin: 0;
          overflow-y: auto;
          flex: 1;
        }

        .script-item {
          padding: 8px 10px;
          border-radius: var(--radius-sm, 4px);
          margin-bottom: 6px;
          font-size: 12px;
          line-height: 1.4;
          background: var(--bg-secondary, rgba(255, 255, 255, 0.01));
          border-left: 3px solid var(--border-strong, rgba(255, 255, 255, 0.1));
        }

        .script-item--active {
          background: var(--accent-primary-glow, rgba(124, 77, 255, 0.08));
          border-left-color: var(--accent-primary, #7c4dff);
        }

        .script-item__char {
          font-weight: 700;
          margin-right: 6px;
        }

        .play-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--bg-elevated, rgba(255, 255, 255, 0.08));
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: none;
          color: white;
        }

        .play-btn--active {
          background: var(--accent-secondary, #00e5ff);
          color: var(--bg-primary, #060609);
        }
      `}</style>

      {/* Header */}
      <div className="header">
        <h1 className="header__title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          Voice Clone & TTS Engine
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--secondary" onClick={() => window.close()}>Close Window</button>
        </div>
      </div>

      {/* GPU / Server Status */}
      <div className="status-bar">
        <div className="status-indicator">
          <span className={`dot ${serverOnline ? 'dot--green' : 'dot--red'}`}></span>
          <span>TTS Service: <strong>{serverStatus}</strong></span>
        </div>
        
        {serverOnline && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              GPU: <strong style={{ color: '#00e5ff' }}>{gpuName}</strong>
              {vramTotal != null && (
                <span style={{ color: '#a0a0b0', fontSize: '12px', marginLeft: 4 }}>({vramTotal.toFixed(1)} GB VRAM)</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Model:</span>
              <select
                value={selectedModel}
                onChange={handleModelChange}
                disabled={loadingModel || generating || unloadingModel}
                style={{
                  background: '#1a1a24',
                  color: '#ffffff',
                  border: '1px solid var(--border-default)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              >
                <option value="luxtts">LuxTTS 1.7B Distilled (~1 GB VRAM)</option>
                <option value="qwen3tts_0.6b">Qwen3-TTS 0.6B Base (~3 GB VRAM)</option>
              </select>
            </div>
            <div className="status-indicator">
              <span className={`dot ${modelLoaded ? 'dot--green' : 'dot--yellow'}`}></span>
              <span>Model: <strong>{modelLoaded ? 'In VRAM' : 'Unloaded'}</strong></span>
            </div>
            {/* Auto-Unload Toggle */}
            <label
              title="When ON, the model is unloaded from GPU VRAM after generation finishes. When OFF, it stays loaded for faster re-generation."
              style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px',
                cursor: 'pointer', color: autoUnload ? '#ffd740' : '#a0a0b0',
                userSelect: 'none'
              }}
            >
              <input
                type="checkbox"
                checked={autoUnload}
                onChange={e => setAutoUnload(e.target.checked)}
                style={{ accentColor: '#ffd740' }}
              />
              Auto-Unload
            </label>
            {modelLoaded ? (
              <button className="btn btn--secondary" onClick={handleUnloadModel} disabled={unloadingModel || generating}>
                {unloadingModel ? 'Clearing...' : 'Release GPU VRAM'}
              </button>
            ) : (
              <button className="btn btn--accent" onClick={handleLoadModel} disabled={loadingModel || generating}>
                {loadingModel ? 'Loading...' : 'Preload Model'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Layout */}
      <div className="main-layout" ref={mainLayoutRef}>
        
        {/* Left Config Panel */}
        <div className="left-panel" style={{ width: `${splitPercent}%`, flexShrink: 0 }}>
          {characters.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              No characters found in active script. Set up a dialogue in the main workspace first.
            </div>
          ) : (
            characters.map(char => {
              const config = voiceConfigs[char.id] || { type: 'default', refPath: '', refText: '', presetName: '' };
              return (
                <div key={char.id} className="card" style={{ borderLeft: `4px solid ${char.color}` }}>
                  <div className="card__header">
                    <h3 className="card__title">
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: char.color }} />
                      {char.name}
                    </h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn--secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleSaveAsPreset(char.id, char.name)} disabled={generating}>
                        Save Preset
                      </button>
                    </div>
                  </div>

                  <div className="form-row">
                    <span style={{ width: 85, color: '#a0a0b0' }}>Voice Source:</span>
                    <select
                      className="form-control"
                      value={config.type}
                      onChange={(e) => handleConfigTypeChange(char.id, e.target.value)}
                      disabled={generating}
                    >
                      <option value="default">Default Library Voice</option>
                      <option value="preset" disabled={presets.length === 0}>Saved Preset Voice</option>
                      <option value="custom">Custom Voice Clip (.wav)</option>
                    </select>
                  </div>

                  {/* Config options based on type */}
                  {config.type === 'default' && (
                    <div className="form-row">
                      <span style={{ width: 85, color: '#a0a0b0' }}>Library Select:</span>
                      <select
                        className="form-control"
                        value={config.presetName}
                        onChange={(e) => handleSelectDefaultVoice(char.id, e.target.value)}
                        disabled={generating}
                      >
                        {defaultVoices.map(v => (
                          <option key={v.name} value={v.name}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {config.type === 'preset' && (
                    <div className="form-row">
                      <span style={{ width: 85, color: '#a0a0b0' }}>Preset Select:</span>
                      <select
                        className="form-control"
                        value={config.presetName}
                        onChange={(e) => handleSelectPreset(char.id, e.target.value)}
                        disabled={generating}
                      >
                        {presets.map(p => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {config.type === 'custom' && (
                    <div className="form-row">
                      <span style={{ width: 85, color: '#a0a0b0' }}>File Path:</span>
                      <input
                        type="text"
                        className="form-control"
                        value={config.refPath}
                        readOnly
                        placeholder="Click choose file..."
                        disabled={generating}
                      />
                      <button className="btn btn--secondary" onClick={() => handleSelectAudioFile(char.id)} disabled={generating}>
                        Browse
                      </button>
                    </div>
                  )}

                  {/* Reference audio playback & transcript */}
                  {config.refPath && (
                    <>
                      <div className="form-row">
                        <span style={{ width: 85, color: '#a0a0b0' }}>Preview Reference:</span>
                        <button
                          className={`play-btn ${playingAudio === config.refPath ? 'play-btn--active' : ''}`}
                          onClick={() => togglePlayAudio(config.refPath)}
                        >
                          {playingAudio === config.refPath ? '■' : '▶'}
                        </button>
                        <span style={{ fontSize: '11px', color: '#a0a0b0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                          {config.refPath.split(/[\\/]/).pop()}
                        </span>
                      </div>

                      <div className="form-row" style={{ alignItems: 'flex-start' }}>
                        <span style={{ width: 85, color: '#a0a0b0', marginTop: 6 }}>Reference Text:</span>
                        <textarea
                          className="form-control textarea-control"
                          value={config.refText}
                          onChange={(e) => handleTranscriptChange(char.id, e.target.value)}
                          placeholder="Type exactly what is spoken in the reference voice clip..."
                          disabled={generating || config.type === 'default'}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Draggable Resizer */}
        <div className="resizer-bar" onMouseDown={handleResizerMouseDown} title="Drag to resize panels" />

        {/* Right Output & Progress Panel */}
        <div className="right-panel" style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card__title" style={{ color: '#fff' }}>Audio & Captions Sync</h3>
          </div>

          <div className="form-row">
            <span>Clip Pause:</span>
            <input
              type="number"
              className="form-control input-number"
              value={pauseDuration}
              onChange={(e) => setPauseDuration(parseFloat(e.target.value) || 0)}
              step="0.1"
              min="0"
              disabled={generating}
            />
            <span style={{ fontSize: '11px', color: '#a0a0b0' }}>seconds added between lines</span>
          </div>

          {/* Script sequence list */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <h4 style={{ fontSize: '12px', margin: '12px 0 6px', color: '#a0a0b0' }}>Script Order Preview</h4>
            <div className="script-preview">
              {dialogueBlocks.map((block, idx) => {
                const genBlock = generatedResult?.dialogueBlocks?.find(b => b.id === block.id);
                const wavPath = genBlock?.wavPath;
                return (
                  <div key={block.id} className={`script-item ${idx === currentBlockIndex ? 'script-item--active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {wavPath && (
                      <button
                        className={`play-btn ${playingAudio === wavPath ? 'play-btn--active' : ''}`}
                        style={{ flexShrink: 0, marginRight: '4px' }}
                        onClick={() => togglePlayAudio(wavPath)}
                      >
                        {playingAudio === wavPath ? '■' : '▶'}
                      </button>
                    )}
                    <div style={{ flex: 1 }}>
                      <span className="script-item__char" style={{ color: block.color }}>{block.characterName}:</span>
                      <span>{block.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Progress Section */}
          <div className="progress-section">
            <div className="progress-header">
              <span>{generating ? 'Synthesizing voice tracks...' : 'Pipeline Ready'}</span>
              <span>{Math.round(generationProgress)}%</span>
            </div>
            <div className="bar-outer">
              <div className="bar-inner" style={{ width: `${generationProgress}%` }} />
            </div>
          </div>

          {/* Action / Preview / Apply Buttons */}
          {generatedResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
              <button
                className="btn btn--secondary"
                style={{ width: '100%', padding: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={handleDiscardResult}
                disabled={generating}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Discard Generated Clips
              </button>
              <button
                className="btn btn--success"
                style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 'bold', background: '#00e676', color: '#060609', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={handleApplyResult}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                Accept & Add to Media Library
              </button>
            </div>
          ) : (
            <button
              className="btn btn--accent"
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={handleGenerateVoiceover}
              disabled={generating || !serverOnline}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
              {generating ? 'Running AI Voiceover...' : 'Generate Voiceover'}
            </button>
          )}

          {/* System Logs */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '140px', minHeight: '140px' }}>
            <span style={{ fontSize: '11px', color: '#a0a0b0', marginBottom: 4 }}>Operations Log</span>
            <div className="logs-container">
              {genLogs.length === 0 ? (
                <div style={{ color: '#444455' }}>No active processes logged yet.</div>
              ) : (
                genLogs.map((log, idx) => (
                  <div key={idx} className="log-entry">{log}</div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
