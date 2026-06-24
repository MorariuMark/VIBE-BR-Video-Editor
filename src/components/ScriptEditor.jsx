import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useProject } from '../store/ProjectContext';

/**
 * Script Editor & Inspector Panel
 * Features: Raw Script parsing, Dialogue Blocks list, and an Inspector Tab
 * to configure text styling options and character animations.
 */
export default function ScriptEditor() {
  const { state, actions } = useProject();
  const [activeTab, setActiveTab] = useState('script'); // 'script' | 'dialogue' | 'animations' | 'inspector'
  const [editingKeyword, setEditingKeyword] = useState(null);
  const [newKeywordName, setNewKeywordName] = useState('');
  const [styleTarget, setStyleTarget] = useState('character'); // 'character' | 'clip'
  const textareaRef = useRef(null);

  const handleApplyAnimToAll = (characterId) => {
    const block = state.dialogueBlocks.find(b => b.id === state.selectedClipId);
    if (!block) return;
    const anim = block.animation || {
      entrance: 'slide-up',
      exit: 'slide-down',
      entranceDuration: 0.3,
      exitDuration: 0.3,
      sustain: 'none',
      sustainIntensity: 0.5,
      sustainSpeed: 0.5,
    };
    actions.batchUpdateAnimation(characterId, anim);
    if (characterId) {
      actions.addToast(`Applied animation to all clips of ${block.characterName}`, 'success');
    } else {
      actions.addToast('Applied animation to all clips in project', 'success');
    }
  };

  // Auto-switch tabs when elements are selected
  useEffect(() => {
    if (state.selectedElementId) {
      setActiveTab('inspector');
    } else if (state.selectedClipId) {
      setActiveTab('animations');
    }
  }, [state.selectedElementId, state.selectedClipId]);

  const handleScriptChange = (e) => {
    actions.setScript(e.target.value);
  };

  const handleParse = () => {
    actions.parseScript(state.scriptText);
    setActiveTab('dialogue');
    actions.addToast('Script parsed successfully!', 'success');
  };

  const handleBlockTimingChange = (blockId, field, value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;
    if (field === 'startTime') {
      actions.updateBlockTiming(blockId, numValue, undefined);
    } else if (field === 'duration') {
      actions.updateBlockTiming(blockId, undefined, numValue);
    }
  };

  const handleAddKeyword = () => {
    if (newKeywordName.trim()) {
      actions.addCharacter(newKeywordName.trim());
      setNewKeywordName('');
      actions.addToast(`Added character: ${newKeywordName.trim()}`, 'success');
    }
  };

  const handleAssignAsset = async (characterId) => {
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFileDialog({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });
      if (paths && paths.length > 0) {
        const fileData = await window.electronAPI.readFile(paths[0]);
        if (!fileData.error) {
          const asset = {
            name: fileData.name,
            path: fileData.path,
            dataUrl: `data:${fileData.mime};base64,${fileData.data}`,
          };
          actions.assignCharacterAsset(characterId, asset);
          actions.addToast(`Assigned asset to character`, 'success');
        }
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        const asset = {
          name: file.name,
          path: file.name,
          dataUrl,
        };
        actions.assignCharacterAsset(characterId, asset);
        actions.addToast(`Assigned ${file.name} to character`, 'success');
      };
      input.click();
    }
  };

  const handleAutoTime = () => {
    if (state.dialogueBlocks.length === 0) return;
    let currentTime = 0;
    const updatedBlocks = state.dialogueBlocks.map(block => {
      const newBlock = { ...block, startTime: currentTime };
      currentTime += block.duration;
      return newBlock;
    });
    actions.setBlocks(updatedBlocks);
    actions.addToast('Auto-timed dialogue blocks', 'success');
  };

  const handleSilenceDetect = async () => {
    if (!state.audioFile) {
      actions.addToast('No audio file loaded', 'error');
      return;
    }

    try {
      const audioCtx = new AudioContext();
      let arrayBuffer;
      if (window.electronAPI && state.audioFile.path) {
        const fileBuffer = await window.electronAPI.readFileBuffer(state.audioFile.path);
        if (fileBuffer && !fileBuffer.error && fileBuffer.byteLength > 0) {
          arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
          new Uint8Array(arrayBuffer).set(fileBuffer);
        } else {
          throw new Error(fileBuffer?.error || "Failed to read file buffer or buffer is empty");
        }
      } else {
        const response = await fetch(state.audioFile.dataUrl);
        arrayBuffer = await response.arrayBuffer();
      }
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      actions.setAudioBuffer(audioBuffer);
      
      const { detectSilenceSegments, matchBlocksToSegments } = await import('../engine/scriptParser');
      const segments = detectSilenceSegments(audioBuffer);
      
      if (segments.length > 0 && state.dialogueBlocks.length > 0) {
        const updatedBlocks = matchBlocksToSegments(state.dialogueBlocks, segments);
        actions.setBlocks(updatedBlocks);
        actions.addToast(`Matched ${Math.min(segments.length, state.dialogueBlocks.length)} segments`, 'success');
      } else {
        actions.addToast('No speech segments detected', 'info');
      }
    } catch (err) {
      actions.addToast(`Audio analysis failed: ${err.message}`, 'error');
    }
  };

  const loadSampleScript = async () => {
    const sample = `**Stewie:** Look, Peter, building a video editor inside Electron is easy if you don't choke the UI thread. You just overlay a fast canvas for the free-transform handles and offload the heavy rendering to a local FFmpeg binary.

**Peter:** Yeah, well, what about the script parsing, smart guy? If I edit a paragraph or change a keyword, the whole timeline array has to recalculate its positions and shift every character animation block.

**Stewie:** It's basic reactive state tracking, you absolute buffoon! When a block's duration changes, you just apply a delta offset to the timestamps of every block that follows it on the timeline. It's junior-year data structures!

**Peter:** Oh yeah? Well I bet you can't even make the characters slide in and out smoothly. Every time I try, they just pop in like a broken PowerPoint.

**Stewie:** That's because you're not using proper easing functions, you philistine! A simple cubic bezier with an overshoot parameter gives you that bouncy entrance that the kids love. And for the exit, a quick ease-in-cubic fades them out before they slide off.

**Peter:** Hehehe... bouncy. Like that time I bounced on that trampoline at Chris's birthday party.`;

    actions.setScript(sample);
    actions.parseScript(sample);
    setActiveTab('dialogue');

    if (window.electronAPI) {
      try {
        const projectPath = await window.electronAPI.getProjectPath();
        const projectPathNormalized = projectPath.replace(/\\/g, '/');

        // Character asset paths
        const stewieImgPath = `${projectPathNormalized}/assets/characters/stewie.png`;
        const peterImgPath = `${projectPathNormalized}/assets/characters/peter.png`;

        // Voice reference audio files paths
        const stewieWavPath = `${projectPathNormalized}/assets/default_voices/stewie_ref.wav`;
        const peterWavPath = `${projectPathNormalized}/assets/default_voices/peter_ref.wav`;

        // Reading files to populate character PNG base64 data URLs
        const [stewieFileData, peterFileData] = await Promise.all([
          window.electronAPI.readFile(stewieImgPath),
          window.electronAPI.readFile(peterImgPath)
        ]);

        if (!stewieFileData.error) {
          const stewieAsset = {
            name: stewieFileData.name,
            path: stewieFileData.path,
            dataUrl: `data:${stewieFileData.mime};base64,${stewieFileData.data}`,
          };
          actions.assignCharacterAsset('char_stewie', stewieAsset);
        } else {
          console.warn("Stewie image file not found:", stewieFileData.error);
        }

        if (!peterFileData.error) {
          const peterAsset = {
            name: peterFileData.name,
            path: peterFileData.path,
            dataUrl: `data:${peterFileData.mime};base64,${peterFileData.data}`,
          };
          actions.assignCharacterAsset('char_peter', peterAsset);
        } else {
          console.warn("Peter image file not found:", peterFileData.error);
        }

        // Voice config references
        const stewieRefText = "all this time spent keeping people from having sex and now i know how the catholic church feels buzzing";
        const peterRefText = "going to stare at his wife's boobs so hide that when they both go into the kitchen together it will be discussed";

        const defaultVoiceConfigs = {
          char_stewie: {
            type: 'default',
            refPath: stewieWavPath,
            refText: stewieRefText,
            presetName: 'stewie'
          },
          char_peter: {
            type: 'default',
            refPath: peterWavPath,
            refText: peterRefText,
            presetName: 'peter'
          }
        };

        actions.setVoiceConfigs(defaultVoiceConfigs);
        actions.addToast('Sample script loaded with default voices and assets!', 'success');
      } catch (err) {
        console.error('Failed to load default assets and voices:', err);
        actions.addToast(`Sample script loaded, but assets failed: ${err.message}`, 'warning');
      }
    } else {
      actions.addToast('Sample script loaded!', 'success');
    }
  };

  // Helper to retrieve character styles safely
  const getCharacterStyle = (char) => {
    return char?.textStyle || {
      fontFamily: 'Impact',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 4,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 10,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      glowColor: 'rgba(124, 77, 255, 0)',
      glowBlur: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      backgroundPadding: 10,
      showBackground: true,
      letterSpacing: 2,
      lineHeight: 1.4,
      wordsPerLine: 3,
      caseMode: 'uppercase',
    };
  };

  const updateStyle = (charId, key, value) => {
    const char = state.characters.find(c => c.id === charId);
    if (!char) return;
    const currentStyle = getCharacterStyle(char);
    const selectedBlock = state.dialogueBlocks.find(b => b.id === state.selectedClipId);

    if (styleTarget === 'clip' && selectedBlock && selectedBlock.characterId === charId) {
      const blockStyle = selectedBlock.textStyle || {};
      actions.updateBlock(selectedBlock.id, {
        textStyle: { ...blockStyle, [key]: value }
      });
    } else {
      // Apply globally to character
      actions.updateCharacterStyle(charId, { ...currentStyle, [key]: value });
      
      // Clear block-level overrides for this style property to ensure consistency
      const updatedBlocks = state.dialogueBlocks.map(b => {
        if (b.characterId === charId && b.textStyle && b.textStyle.hasOwnProperty(key)) {
          const nextStyle = { ...b.textStyle };
          delete nextStyle[key];
          return { ...b, textStyle: nextStyle };
        }
        return b;
      });
      actions.setBlocks(updatedBlocks);
    }
  };

  // Render Inspector Panel based on what is selected
  const renderInspector = () => {
    // 1. Check if Character or Caption is selected
    let selectedChar = null;
    let isCaption = false;

    if (state.selectedElementId) {
      if (state.selectedElementId.startsWith('caption_')) {
        const charId = state.selectedElementId.replace('caption_', '');
        selectedChar = state.characters.find(c => c.id === charId);
        isCaption = true;
      } else {
        selectedChar = state.characters.find(c => c.id === state.selectedElementId);
      }
    }

    if (selectedChar) {
      const selectedBlock = state.dialogueBlocks.find(b => b.id === state.selectedClipId);
      const style = {
        ...getCharacterStyle(selectedChar),
        ...((selectedBlock && selectedBlock.characterId === selectedChar.id && selectedBlock.textStyle) || {})
      };
      return (
        <div className="inspector-panel">
          <div className="inspector-header">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: selectedChar.color }}>
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.13 19.58 10.53 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
            </svg>
            <span className="inspector-title">Caption Styling: {selectedChar.name}</span>
          </div>

          {/* Apply To Selector */}
          <div className="inspector-section" style={{ background: 'var(--accent-primary-glow)', borderColor: 'var(--border-accent)', padding: '10px 12px', gap: 6 }}>
            <label className="form-label" style={{ margin: 0 }}>Apply Style Changes To:</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', userSelect: 'none' }}>
                <input
                  type="radio"
                  name="style-target"
                  value="character"
                  checked={styleTarget === 'character'}
                  onChange={() => setStyleTarget('character')}
                  style={{ cursor: 'pointer', width: 12, height: 12, accentColor: 'var(--accent-primary)' }}
                />
                All Character Clips
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', userSelect: 'none' }}>
                <input
                  type="radio"
                  name="style-target"
                  value="clip"
                  checked={styleTarget === 'clip'}
                  onChange={() => setStyleTarget('clip')}
                  style={{ cursor: 'pointer', width: 12, height: 12, accentColor: 'var(--accent-primary)' }}
                />
                Selected Clip Only
              </label>
            </div>
          </div>

          <div className="inspector-section">
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Character Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={selectedChar.name}
                  onChange={(e) => actions.updateCharacter(selectedChar.id, { name: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Color</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-color-picker"
                    value={selectedChar.color}
                    onChange={(e) => actions.updateCharacter(selectedChar.id, { color: e.target.value })}
                  />
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{selectedChar.color}</span>
                </div>
              </div>
            </div>

            {/* Active Dialogue Text box for editing captions */}
            {(() => {
              const activeBlocks = state.dialogueBlocks.filter(b => b.characterId === selectedChar.id);
              const activeBlock = activeBlocks.find(b => state.currentTime >= b.startTime && state.currentTime <= b.startTime + b.duration);
              if (activeBlock) {
                return (
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label">Active Dialogue Text (Edit Text Box)</label>
                    <textarea
                      className="form-input"
                      style={{ height: 60, resize: 'vertical', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}
                      value={activeBlock.text}
                      onChange={(e) => actions.updateBlock(activeBlock.id, { text: e.target.value })}
                    />
                  </div>
                );
              }
              return null;
            })()}

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Avatar Asset (Drag image here)</label>
              <div
                className="inspector-avatar-drop"
                onClick={() => handleAssignAsset(selectedChar.id)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  try {
                    const dataStr = e.dataTransfer.getData('application/json');
                    if (!dataStr) return;
                    const dragData = JSON.parse(dataStr);
                    const item = state.mediaItems.find(m => m.id === dragData.id) || dragData;
                    if (item.type === 'image') {
                      actions.assignCharacterAsset(selectedChar.id, item);
                      actions.addToast(`Assigned ${item.name}`, 'success');
                    }
                  } catch (err) {}
                }}
              >
                {selectedChar.asset ? (
                  <>
                    <img src={selectedChar.asset.dataUrl} alt="" className="avatar-preview" />
                    <span className="avatar-label truncate">{selectedChar.asset.name}</span>
                  </>
                ) : (
                  <span className="avatar-placeholder">📁 Click or drop PNG asset here</span>
                )}
              </div>
            </div>
          </div>

          <div className="inspector-section-title">Font & Typography</div>
          <div className="inspector-section">
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Font Family</label>
                <select
                  className="form-select"
                  value={style.fontFamily}
                  onChange={(e) => updateStyle(selectedChar.id, 'fontFamily', e.target.value)}
                >
                  <option value="Impact">Impact (Meme)</option>
                  <option value="Inter">Inter (Sleek)</option>
                  <option value="Arial">Arial (Standard)</option>
                  <option value="Montserrat">Montserrat (Modern)</option>
                  <option value="Comic Sans MS">Comic Sans (Funny)</option>
                  <option value="Georgia">Georgia (Serif)</option>
                  <option value="Courier New">Courier (Mono)</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Case Mode</label>
                <select
                  className="form-select"
                  value={style.caseMode}
                  onChange={(e) => updateStyle(selectedChar.id, 'caseMode', e.target.value)}
                >
                  <option value="none">Normal</option>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="lowercase">lowercase</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Words Per Line</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max="10"
                  value={style.wordsPerLine}
                  onChange={(e) => updateStyle(selectedChar.id, 'wordsPerLine', parseInt(e.target.value) || 3)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Text Color</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-color-picker"
                    value={style.color}
                    onChange={(e) => updateStyle(selectedChar.id, 'color', e.target.value)}
                  />
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{style.color}</span>
                </div>
              </div>
            </div>

            <div className="form-row-slider" style={{ marginTop: 12 }}>
              <div className="slider-header">
                <span>Font Size</span>
                <span>{style.fontSize ?? 36}px</span>
              </div>
              <input
                type="range"
                min="12"
                max="100"
                value={style.fontSize ?? 36}
                onChange={(e) => updateStyle(selectedChar.id, 'fontSize', parseInt(e.target.value))}
              />
            </div>

            <div className="form-row-slider">
              <div className="slider-header">
                <span>Letter Spacing</span>
                <span>{style.letterSpacing}px</span>
              </div>
              <input
                type="range"
                min="-5"
                max="20"
                value={style.letterSpacing}
                onChange={(e) => updateStyle(selectedChar.id, 'letterSpacing', parseInt(e.target.value))}
              />
            </div>

            <div className="form-row-slider">
              <div className="slider-header">
                <span>Line Height</span>
                <span>{style.lineHeight}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.1"
                value={style.lineHeight}
                onChange={(e) => updateStyle(selectedChar.id, 'lineHeight', parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className="inspector-section-title">Outline & Glow</div>
          <div className="inspector-section">
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Outline Color</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-color-picker"
                    value={style.strokeColor}
                    onChange={(e) => updateStyle(selectedChar.id, 'strokeColor', e.target.value)}
                  />
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{style.strokeColor}</span>
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Glow Color</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="color"
                    className="form-color-picker"
                    value={style.glowColor}
                    onChange={(e) => updateStyle(selectedChar.id, 'glowColor', e.target.value)}
                  />
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>{style.glowColor}</span>
                </div>
              </div>
            </div>

            <div className="form-row-slider">
              <div className="slider-header">
                <span>Outline Thickness</span>
                <span>{style.strokeWidth}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={style.strokeWidth}
                onChange={(e) => updateStyle(selectedChar.id, 'strokeWidth', parseInt(e.target.value))}
              />
            </div>

            <div className="form-row-slider">
              <div className="slider-header">
                <span>Glow Blur Intensity</span>
                <span>{style.glowBlur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={style.glowBlur}
                onChange={(e) => updateStyle(selectedChar.id, 'glowBlur', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="inspector-section-title">Backdrop Box & Drop Shadow</div>
          <div className="inspector-section">
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
              <input
                type="checkbox"
                id="showBackground"
                checked={style.showBackground}
                onChange={(e) => updateStyle(selectedChar.id, 'showBackground', e.target.checked)}
              />
              <label htmlFor="showBackground" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Show Backdrop Box</label>
            </div>

            {style.showBackground && (
              <>
                <div className="form-group">
                  <label className="form-label">Backdrop Color</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="color"
                      className="form-color-picker"
                      value={style.backgroundColor.slice(0, 7)}
                      onChange={(e) => {
                        const opacity = parseFloat(style.backgroundColor.match(/rgba\(.+,\s*(.+)\)/)?.[1] || '0.7');
                        const r = parseInt(e.target.value.slice(1, 3), 16) || 0;
                        const g = parseInt(e.target.value.slice(3, 5), 16) || 0;
                        const b = parseInt(e.target.value.slice(5, 7), 16) || 0;
                        updateStyle(selectedChar.id, 'backgroundColor', `rgba(${r},${g},${b},${opacity})`);
                      }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      style={{ flex: 1 }}
                      value={parseFloat(style.backgroundColor.match(/rgba\(.+,\s*(.+)\)/)?.[1] || '0.7')}
                      onChange={(e) => {
                        const opacity = parseFloat(e.target.value);
                        let hex = style.backgroundColor;
                        if (!hex.startsWith('rgba')) {
                          const r = parseInt(hex.slice(1, 3), 16) || 0;
                          const g = parseInt(hex.slice(3, 5), 16) || 0;
                          const b = parseInt(hex.slice(5, 7), 16) || 0;
                          updateStyle(selectedChar.id, 'backgroundColor', `rgba(${r},${g},${b},${opacity})`);
                        } else {
                          const rgb = hex.match(/rgba\((\d+,\s*\d+,\s*\d+),.+/);
                          if (rgb) {
                            updateStyle(selectedChar.id, 'backgroundColor', `rgba(${rgb[1]},${opacity})`);
                          }
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="form-row-slider">
                  <div className="slider-header">
                    <span>Backdrop Padding</span>
                    <span>{style.backgroundPadding}px</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="30"
                    value={style.backgroundPadding}
                    onChange={(e) => updateStyle(selectedChar.id, 'backgroundPadding', parseInt(e.target.value))}
                  />
                </div>
              </>
            )}

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Shadow Color</label>
                <input
                  type="color"
                  className="form-color-picker"
                  value={style.shadowColor.startsWith('#') ? style.shadowColor : '#000000'}
                  onChange={(e) => updateStyle(selectedChar.id, 'shadowColor', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Shadow Blur</label>
                <input
                  type="number"
                  className="form-input"
                  value={style.shadowBlur}
                  onChange={(e) => updateStyle(selectedChar.id, 'shadowBlur', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Shadow Offset X</label>
                <input
                  type="number"
                  className="form-input"
                  value={style.shadowOffsetX}
                  onChange={(e) => updateStyle(selectedChar.id, 'shadowOffsetX', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Shadow Offset Y</label>
                <input
                  type="number"
                  className="form-input"
                  value={style.shadowOffsetY}
                  onChange={(e) => updateStyle(selectedChar.id, 'shadowOffsetY', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 2. Check if Dialogue Block/Clip is selected
    if (state.selectedClipId) {
      const block = state.dialogueBlocks.find(b => b.id === state.selectedClipId);
      if (block) {
        return (
          <div className="inspector-panel">
            <div className="inspector-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: block.color }}>
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4zm2 14H4V8h16v10z"/>
              </svg>
              <span className="inspector-title">Clip Timing & Info</span>
            </div>

            <div className="inspector-section">
              <div className="form-group">
                <label className="form-label">Speaker</label>
                <div style={{ color: block.color, fontWeight: 'bold' }}>{block.characterName}</div>
              </div>

              <div className="form-group">
                <label className="form-label">Dialogue Text (Edit Box)</label>
                <textarea
                  className="form-input"
                  style={{ height: 80, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
                  value={block.text}
                  onChange={(e) => actions.updateBlock(block.id, { text: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Start Time (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={block.startTime.toFixed(1)}
                    onChange={(e) => handleBlockTimingChange(block.id, 'startTime', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Duration (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={block.duration.toFixed(1)}
                    onChange={(e) => handleBlockTimingChange(block.id, 'duration', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      }
    }

    // 3. Fallback / Empty State
    return (
      <div className="empty-state" style={{ height: '80%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style={{ color: 'var(--text-disabled)', margin: '0 auto 16px' }}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <div className="empty-state__title">No Element Selected</div>
        <div className="empty-state__desc" style={{ padding: '0 32px' }}>
          Select a character in the list or click a caption on the Preview Canvas to inspect and style it.
        </div>
      </div>
    );
  };

  const renderAnimations = () => {
    if (!state.selectedClipId) {
      return (
        <div className="empty-state" style={{ height: '80%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style={{ color: 'var(--text-disabled)', margin: '0 auto 16px' }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <div className="empty-state__title">No Clip Selected</div>
          <div className="empty-state__desc" style={{ padding: '0 32px' }}>
            Select a dialogue block in the Blocks list or timeline track to configure its transitions and sustained animations.
          </div>
        </div>
      );
    }

    const block = state.dialogueBlocks.find(b => b.id === state.selectedClipId);
    if (!block) return null;

    const anim = block.animation || {
      entrance: 'slide-up',
      exit: 'slide-down',
      entranceDuration: 0.3,
      exitDuration: 0.3,
      sustain: 'none',
      sustainIntensity: 0.5,
      sustainSpeed: 0.5,
    };

    const handleAnimChange = (key, val) => {
      actions.updateBlockAnimation(block.id, { [key]: val });
    };

    return (
      <div className="inspector-panel">
        <div className="inspector-header">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: block.color }}>
            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4zm2 14H4V8h16v10z"/>
          </svg>
          <span className="inspector-title">Clip Animation Settings</span>
        </div>

        <div className="inspector-section">
          <div className="form-group">
            <label className="form-label">Speaker</label>
            <div style={{ color: block.color, fontWeight: 'bold' }}>{block.characterName}</div>
          </div>

          <div className="form-group">
            <label className="form-label">Dialogue Text</label>
            <div style={{ fontStyle: 'italic', background: 'var(--surface-1)', padding: 8, borderRadius: 4, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              "{block.text}"
            </div>
          </div>
        </div>

        <div className="inspector-section-title">Entrance Animation</div>
        <div className="inspector-section">
          <div className="form-group">
            <label className="form-label">Preset Style</label>
            <select
              className="form-select"
              value={anim.entrance}
              onChange={(e) => handleAnimChange('entrance', e.target.value)}
            >
              <option value="slide-up">Slide Up</option>
              <option value="slide-down">Slide Down</option>
              <option value="slide-left">Slide Left</option>
              <option value="slide-right">Slide Right</option>
              <option value="pop">Bouncy Pop</option>
              <option value="fade">Fade In</option>
              <option value="zoom-spin">Zoom Spin</option>
            </select>
          </div>

          <div className="form-row-slider">
            <div className="slider-header">
              <span>Entrance Duration</span>
              <span>{anim.entranceDuration}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={anim.entranceDuration}
              onChange={(e) => handleAnimChange('entranceDuration', parseFloat(e.target.value))}
            />
          </div>
        </div>

        <div className="inspector-section-title">Exit Animation</div>
        <div className="inspector-section">
          <div className="form-group">
            <label className="form-label">Preset Style</label>
            <select
              className="form-select"
              value={anim.exit}
              onChange={(e) => handleAnimChange('exit', e.target.value)}
            >
              <option value="slide-up">Slide Up</option>
              <option value="slide-down">Slide Down</option>
              <option value="slide-left">Slide Left</option>
              <option value="slide-right">Slide Right</option>
              <option value="pop">Pop Out</option>
              <option value="fade">Fade Out</option>
              <option value="zoom-spin">Zoom Spin Out</option>
            </select>
          </div>

          <div className="form-row-slider">
            <div className="slider-header">
              <span>Exit Duration</span>
              <span>{anim.exitDuration}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={anim.exitDuration}
              onChange={(e) => handleAnimChange('exitDuration', parseFloat(e.target.value))}
            />
          </div>
        </div>

        <div className="inspector-section-title">Sustain / Idle Animation</div>
        <div className="inspector-section">
          <div className="form-group">
            <label className="form-label">Preset Style</label>
            <select
              className="form-select"
              value={anim.sustain || 'none'}
              onChange={(e) => handleAnimChange('sustain', e.target.value)}
            >
              <option value="none">None</option>
              <option value="shake">Shake</option>
              <option value="move-around">Move Around</option>
            </select>
          </div>

          {anim.sustain && anim.sustain !== 'none' && (
            <>
              <div className="form-row-slider">
                <div className="slider-header">
                  <span>Intensity</span>
                  <span>{(anim.sustainIntensity ?? 0.5).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={anim.sustainIntensity ?? 0.5}
                  onChange={(e) => handleAnimChange('sustainIntensity', parseFloat(e.target.value))}
                />
              </div>

              <div className="form-row-slider">
                <div className="slider-header">
                  <span>Speed</span>
                  <span>{(anim.sustainSpeed ?? 0.5).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.05"
                  value={anim.sustainSpeed ?? 0.5}
                  onChange={(e) => handleAnimChange('sustainSpeed', parseFloat(e.target.value))}
                />
              </div>
            </>
          )}
        </div>

        {/* Batch Apply Animations */}
        <div className="inspector-section-title">Apply Settings to Others</div>
        <div className="inspector-section" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn--secondary"
            style={{ width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)', height: 28 }}
            onClick={() => handleApplyAnimToAll(block.characterId)}
          >
            Apply to all of {block.characterName}
          </button>
          <button
            className="btn btn--secondary"
            style={{ width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)', height: 28 }}
            onClick={() => handleApplyAnimToAll(null)}
          >
            Apply to all clips in project
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="script-panel panel">
      {/* Tab headers */}
      <div className="panel__header" style={{ padding: 0 }}>
        <div className="editor-tabs" style={{ width: '100%' }}>
          <button
            className={`editor-tab ${activeTab === 'script' ? 'editor-tab--active' : ''}`}
            onClick={() => setActiveTab('script')}
          >
            Script
          </button>
          <button
            className={`editor-tab ${activeTab === 'dialogue' ? 'editor-tab--active' : ''}`}
            onClick={() => setActiveTab('dialogue')}
          >
            Blocks
          </button>
          <button
            className={`editor-tab ${activeTab === 'animations' ? 'editor-tab--active' : ''}`}
            onClick={() => setActiveTab('animations')}
          >
            Animations
          </button>
          <button
            className={`editor-tab ${activeTab === 'inspector' ? 'editor-tab--active' : ''}`}
            onClick={() => setActiveTab('inspector')}
          >
            Inspector
          </button>
        </div>
        
        {activeTab === 'script' && (
          <button
            className="panel__action-btn"
            onClick={loadSampleScript}
            title="Load Demo Script"
            style={{ fontSize: '11px', width: 'auto', padding: '0 8px', margin: '5px 8px 5px 0', border: '1px solid var(--border-default)' }}
          >
            Demo
          </button>
        )}
      </div>

      <div className="script-panel__content">
        {/* ── Sidebar: Character Keywords (Always visible on left side of script panel) ── */}
        <div className="script-panel__sidebar">
          <div className="keyword-list__title" style={{ padding: '8px 12px 4px' }}>
            Characters
          </div>
          <div className="keyword-list">
            {state.characters.map(char => (
              <div
                key={char.id}
                className={`keyword-item ${state.selectedElementId === char.id ? 'keyword-item--selected' : ''}`}
                onClick={() => actions.selectElement(char.id)}
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
                    if (item.type === 'image') {
                      actions.assignCharacterAsset(char.id, item);
                      actions.addToast(`Assigned "${item.name}" to character ${char.name}`, 'success');
                    } else {
                      actions.addToast('Please drop an image file.', 'warning');
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                <div
                  className="keyword-item__color"
                  style={{ background: char.color }}
                />
                {editingKeyword === char.id ? (
                  <input
                    style={{
                      flex: 1, background: 'var(--surface-2)', border: '1px solid var(--accent-primary)',
                      borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
                    }}
                    defaultValue={char.name}
                    autoFocus
                    onBlur={(e) => {
                      actions.updateCharacter(char.id, { name: e.target.value });
                      setEditingKeyword(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        actions.updateCharacter(char.id, { name: e.target.value });
                        setEditingKeyword(null);
                      }
                    }}
                  />
                ) : (
                  <span
                    className="keyword-item__name"
                    onDoubleClick={() => setEditingKeyword(char.id)}
                  >
                    {char.name}
                  </span>
                )}
                {char.asset ? (
                  <img
                    className="keyword-item__avatar"
                    src={char.asset.dataUrl}
                    alt={char.name}
                    onClick={(e) => { e.stopPropagation(); handleAssignAsset(char.id); }}
                    title="Click to change asset"
                  />
                ) : (
                  <button
                    style={{
                      width: 20, height: 20, background: 'var(--surface-2)',
                      border: '1px dashed var(--border-default)', borderRadius: 4,
                      color: 'var(--text-disabled)', fontSize: '10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onClick={(e) => { e.stopPropagation(); handleAssignAsset(char.id); }}
                    title="Assign PNG asset"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add keyword */}
          <div style={{ padding: '4px 8px 8px' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                style={{
                  flex: 1, padding: '4px 8px', background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)', borderRadius: 4,
                  color: 'var(--text-primary)', fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-sans)',
                }}
                placeholder="New keyword..."
                value={newKeywordName}
                onChange={(e) => setNewKeywordName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddKeyword(); }}
              />
              <button
                className="panel__action-btn"
                onClick={handleAddKeyword}
                style={{ fontSize: '14px' }}
              >
                +
              </button>
            </div>
          </div>

          {/* Timing tools */}
          <div style={{ padding: '4px 8px 8px', borderTop: '1px solid var(--border-subtle)' }}>
            <div className="keyword-list__title" style={{ padding: '4px 0' }}>Timing</div>
            <button
              className="keyword-add-btn"
              onClick={handleAutoTime}
              style={{ width: '100%', marginLeft: 0, marginRight: 0 }}
            >
              ⏱ Auto-Time
            </button>
            <button
              className="keyword-add-btn"
              onClick={handleSilenceDetect}
              style={{ width: '100%', marginLeft: 0, marginRight: 0 }}
            >
              🔊 Detect Silence
            </button>
          </div>
        </div>

        {/* ── Main Tab Area ── */}
        <div className="script-panel__editor">
          {activeTab === 'script' && (
            <>
              <textarea
                ref={textareaRef}
                className="script-textarea"
                value={state.scriptText}
                onChange={handleScriptChange}
                placeholder={`Paste your script here...\n\nFormat: **Character Name:** Dialogue text\n\nExample:\n**Stewie:** Look, this is how you build it.\n**Peter:** What about the timeline though?`}
                spellCheck={false}
              />
              <div style={{
                padding: '8px 16px', background: 'var(--surface-1)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {state.scriptText.split(/\s+/).filter(w => w).length} words
                </span>
                <button className="btn btn--primary" onClick={handleParse} style={{ height: 28, fontSize: 'var(--text-xs)' }}>
                  🔄 Parse Script
                </button>
              </div>
            </>
          )}

          {activeTab === 'dialogue' && (
            <div className="dialogue-blocks">
              {state.dialogueBlocks.length === 0 ? (
                <div className="empty-state">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style={{ color: 'var(--text-disabled)', margin: '0 auto 16px' }}>
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                  </svg>
                  <div className="empty-state__title">No dialogue parsed</div>
                  <div className="empty-state__desc">
                    Go to the Script tab and paste a script, or click "Demo" to load a sample.
                  </div>
                </div>
              ) : (
                state.dialogueBlocks.map((block, index) => (
                  <div
                    key={block.id}
                    className={`dialogue-block ${state.currentTime >= block.startTime && state.currentTime <= block.startTime + block.duration ? 'dialogue-block--active' : ''} ${state.selectedClipId === block.id ? 'dialogue-block--selected' : ''}`}
                    style={{ '--block-color': block.color }}
                    onClick={() => {
                      actions.setCurrentTime(block.startTime);
                      actions.selectClip(block.id);
                    }}
                  >
                    <div className="dialogue-block__character">
                      <span
                        className="dialogue-block__character-dot"
                        style={{ background: block.color }}
                      />
                      <span style={{ color: block.color }}>{block.characterName}</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 'var(--text-xs)',
                        color: 'var(--text-disabled)', fontFamily: 'var(--font-mono)',
                      }}>
                        #{index + 1}
                      </span>
                    </div>
                    <div className="dialogue-block__text">{block.text}</div>
                    <div className="dialogue-block__timing">
                      <span>Start:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={block.startTime.toFixed(1)}
                        onChange={(e) => handleBlockTimingChange(block.id, 'startTime', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>Dur:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={block.duration.toFixed(1)}
                        onChange={(e) => handleBlockTimingChange(block.id, 'duration', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{ marginLeft: 'auto' }}>
                        {formatTime(block.startTime)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'animations' && renderAnimations()}
          {activeTab === 'inspector' && renderInspector()}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}
