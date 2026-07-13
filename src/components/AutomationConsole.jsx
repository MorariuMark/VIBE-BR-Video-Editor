import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProject } from '../store/ProjectContext';
import { parseVBS, createExecutor, EXAMPLE_VBS } from '../engine/automationEngine';

/**
 * AutomationConsole — A collapsible bottom drawer with a VBS command editor
 * and a live execution log output area.
 */
export default function AutomationConsole({ isOpen, onToggle }) {
  const { state, actions } = useProject();
  const [script, setScript] = useState('');
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const executorRef = useRef(null);
  const logEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [consoleHeight, setConsoleHeight] = useState(240);
  const resizingRef = useRef(false);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { message, type, timestamp }]);

    // Update current step display for status bar
    if (type === 'system' && message.startsWith('[')) {
      setCurrentStep(message);
    }
  }, []);

  const getStateSnapshot = useCallback(() => state, [state]);

  const handleRun = useCallback(async () => {
    if (!script.trim()) {
      addLog('⚠️ No script to execute. Write or paste a VBS command.', 'warning');
      return;
    }

    // Parse the VBS script
    let commands;
    try {
      commands = parseVBS(script);
    } catch (err) {
      addLog(`❌ Parse error: ${err.message}`, 'error');
      return;
    }

    if (commands.length === 0) {
      addLog('⚠️ No commands found in script (only comments/empty lines).', 'warning');
      return;
    }

    setIsRunning(true);
    setLogs([]);

    const executor = createExecutor(actions, getStateSnapshot, addLog);
    executorRef.current = executor;

    try {
      const result = await executor.execute(commands);
      if (result.success) {
        actions.addToast('VBS script executed successfully!', 'success');
      } else if (result.aborted) {
        actions.addToast('VBS script execution aborted.', 'warning');
      } else {
        actions.addToast(`VBS script failed: ${result.error}`, 'error');
      }
    } catch (err) {
      addLog(`❌ Unexpected error: ${err.message}`, 'error');
      actions.addToast(`VBS execution error: ${err.message}`, 'error');
    } finally {
      setIsRunning(false);
      setCurrentStep('');
      executorRef.current = null;
    }
  }, [script, actions, getStateSnapshot, addLog]);

  const handleStop = useCallback(() => {
    if (executorRef.current) {
      executorRef.current.abort();
    }
  }, []);

  const handleClear = useCallback(() => {
    setLogs([]);
    setCurrentStep('');
  }, []);

  const handleLoadExample = useCallback(() => {
    setScript(EXAMPLE_VBS);
    addLog('📋 Example VBS script loaded. Click ▶ Run to execute.', 'info');
  }, [addLog]);

  // Console resize handler
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizingRef.current = true;
    const startY = e.clientY;
    const startHeight = consoleHeight;

    const handleMouseMove = (e) => {
      if (!resizingRef.current) return;
      const dy = startY - e.clientY;
      setConsoleHeight(Math.max(160, Math.min(600, startHeight + dy)));
    };

    const handleMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [consoleHeight]);

  // Tab key handling in textarea
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newVal = script.substring(0, start) + '  ' + script.substring(end);
      setScript(newVal);
      requestAnimationFrame(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      });
    }
  }, [script]);

  const getLogColor = (type) => {
    switch (type) {
      case 'success': return 'var(--vbs-success, #4caf50)';
      case 'error': return 'var(--vbs-error, #ff5252)';
      case 'warning': return 'var(--vbs-warning, #ffc107)';
      case 'system': return 'var(--vbs-system, #00e5ff)';
      default: return 'var(--vbs-info, #b0bec5)';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="automation-console" style={{ height: consoleHeight }}>
      {/* Resize handle */}
      <div
        className="automation-console__resize-handle"
        onMouseDown={handleResizeStart}
      />

      {/* Header bar */}
      <div className="automation-console__header">
        <div className="automation-console__header-left">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span className="automation-console__title">VBS Console</span>
          <span className="automation-console__badge">VIBE Build Script</span>
        </div>
        <div className="automation-console__header-right">
          {currentStep && (
            <span className="automation-console__status">{currentStep}</span>
          )}
          <button
            className="automation-console__btn automation-console__btn--example"
            onClick={handleLoadExample}
            disabled={isRunning}
            title="Load example VBS script"
          >
            📋 Example
          </button>
          <button
            className={`automation-console__btn ${isRunning ? 'automation-console__btn--disabled' : 'automation-console__btn--run'}`}
            onClick={handleRun}
            disabled={isRunning}
            title="Execute VBS script"
          >
            ▶ Run
          </button>
          <button
            className={`automation-console__btn ${!isRunning ? 'automation-console__btn--disabled' : 'automation-console__btn--stop'}`}
            onClick={handleStop}
            disabled={!isRunning}
            title="Stop execution"
          >
            ⏹ Stop
          </button>
          <button
            className="automation-console__btn automation-console__btn--clear"
            onClick={handleClear}
            title="Clear log output"
          >
            🗑 Clear
          </button>
          <button
            className="automation-console__btn automation-console__btn--close"
            onClick={onToggle}
            title="Close console"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main content: editor + log split */}
      <div className="automation-console__body">
        {/* Left: Script Editor */}
        <div className="automation-console__editor">
          <div className="automation-console__editor-label">
            <span>Script</span>
            <span className="automation-console__line-count">
              {script.split('\n').length} lines
            </span>
          </div>
          <textarea
            ref={textareaRef}
            className="automation-console__textarea"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`# Paste your VBS command here...\n# Example:\nPARSE_SCRIPT """\n**Character:** Dialogue text here.\n"""\n\nLOAD_MODEL qwen3tts_0.6b\nSET_VOICE character type=default\nGENERATE_VOICES\nAPPLY_VOICES\nRENDER output="video.mp4"\nUNLOAD_MODEL`}
            spellCheck={false}
            disabled={isRunning}
          />
        </div>

        {/* Divider */}
        <div className="automation-console__divider" />

        {/* Right: Log Output */}
        <div className="automation-console__log">
          <div className="automation-console__editor-label">
            <span>Output</span>
            {isRunning && (
              <span className="automation-console__running-indicator">
                <span className="automation-console__pulse" />
                Running
              </span>
            )}
          </div>
          <div className="automation-console__log-area">
            {logs.length === 0 ? (
              <div className="automation-console__empty">
                <span style={{ fontSize: '24px', marginBottom: 8 }}>⌘</span>
                <span>Output will appear here when you run a VBS script.</span>
                <span style={{ fontSize: '11px', opacity: 0.5, marginTop: 4 }}>
                  Click "📋 Example" to load a sample script.
                </span>
              </div>
            ) : (
              logs.map((entry, idx) => (
                <div
                  key={idx}
                  className="automation-console__log-entry"
                  style={{ color: getLogColor(entry.type) }}
                >
                  <span className="automation-console__log-time">{entry.timestamp}</span>
                  <span className="automation-console__log-msg">{entry.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
