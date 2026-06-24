import os
import sys
import uuid
import time
import gc

# Configure project-local Hugging Face home directory before loading anything else
project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["HF_HOME"] = os.path.join(project_dir, ".hf_cache")
sys.path.append(os.path.join(project_dir, "LuxTTS"))

from flask import Flask, request, jsonify
import numpy as np
import soundfile as sf

# Flask application
app = Flask(__name__)

# Global model reference
model = None

# Create temp directories inside project
temp_dir = os.path.join(project_dir, "dist", "voice_temp")
os.makedirs(temp_dir, exist_ok=True)

@app.route("/status", methods=["GET"])
def status():
    import torch
    cuda_avail = torch.cuda.is_available()
    return jsonify({
        "status": "active",
        "cuda_available": cuda_avail,
        "model_loaded": model is not None,
        "gpu_name": torch.cuda.get_device_name(0) if cuda_avail else "CPU",
        "vram_total": torch.cuda.get_device_properties(0).total_memory / (1024**3) if cuda_avail else 0
    })

@app.route("/load", methods=["POST"])
def load_model():
    global model
    try:
        import torch
        if model is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[Python Server] Loading LuxTTS model on {device}...", flush=True)
            
            from zipvoice.luxvoice import LuxTTS
            model = LuxTTS(device=device)
            print("[Python Server] LuxTTS model loaded successfully.", flush=True)
            return jsonify({"success": True, "message": "Model loaded successfully"})
        else:
            return jsonify({"success": True, "message": "Model already loaded"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Python Server] Failed to load model: {str(e)}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/unload", methods=["POST"])
def unload_model():
    global model
    try:
        import torch
        if model is not None:
            print("[Python Server] Unloading model...", flush=True)
            del model
            model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("[Python Server] Model unloaded and VRAM cleared.", flush=True)
            return jsonify({"success": True, "message": "Model unloaded and VRAM cleared"})
        return jsonify({"success": True, "message": "Model was not loaded"})
    except Exception as e:
        print(f"[Python Server] Failed to unload model: {str(e)}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/clone", methods=["POST"])
def clone_voice():
    global model
    if model is None:
        return jsonify({"success": False, "error": "Model not loaded. Call /load first."}), 400
    
    try:
        import torch
        data = request.json or {}
        text = data.get("text", "")
        language = data.get("language", "English")
        ref_audio = data.get("ref_audio", "")
        ref_text = data.get("ref_text", "")
        
        if not text:
            return jsonify({"success": False, "error": "Target text is required."}), 400
        if not ref_audio or not os.path.exists(ref_audio):
            return jsonify({"success": False, "error": f"Reference audio file not found: {ref_audio}"}), 400

        print(f"[Python Server] Generating voice clone for text: '{text[:30]}...'", flush=True)
        
        # Encode reference prompt
        encoded_prompt = model.encode_prompt(ref_audio, prompt_text=ref_text)
        
        # Generate speech
        wav = model.generate_speech(text, encoded_prompt)
        
        # Audio sample array conversion
        audio_data = wav[0].numpy() if wav.ndim > 1 else wav.numpy()
        sr = 48000
        duration = len(audio_data) / sr
        
        # Write to file
        save_path = data.get("save_path", "")
        if save_path:
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            wav_path = save_path
        else:
            file_id = str(uuid.uuid4())
            wav_path = os.path.join(temp_dir, f"clip_{file_id}.wav")
            
        sf.write(wav_path, audio_data, sr, subtype='PCM_16')
        
        print(f"[Python Server] Generated WAV saved to {wav_path} (duration: {duration:.2f}s)", flush=True)
        return jsonify({
            "success": True,
            "wav_path": wav_path,
            "duration": duration
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Python Server] Voice clone failed: {str(e)}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/concatenate", methods=["POST"])
def concatenate_voices():
    try:
        data = request.json or {}
        wav_paths = data.get("wav_paths", [])
        pause_duration = float(data.get("pause_duration", 0.3))
        
        if not wav_paths:
            return jsonify({"success": False, "error": "No wav paths provided"}), 400
            
        print(f"[Python Server] Concatenating {len(wav_paths)} audio files with {pause_duration}s pause...", flush=True)
        
        combined_audio = []
        target_sr = None
        
        for path in wav_paths:
            if not os.path.exists(path):
                print(f"[Python Server] Warning: file not found: {path}", flush=True)
                continue
                
            audio_data, sr = sf.read(path)
            if target_sr is None:
                target_sr = sr
            
            combined_audio.append(audio_data)
            
            # Add silence between files
            if pause_duration > 0:
                silence = np.zeros(int(target_sr * pause_duration))
                combined_audio.append(silence)
                
        # Remove trailing silence if added
        if len(combined_audio) > 0 and pause_duration > 0:
            combined_audio.pop()
            
        if not combined_audio:
            return jsonify({"success": False, "error": "No valid audio data was loaded"}), 400
            
        concatenated = np.concatenate(combined_audio)
        total_duration = len(concatenated) / target_sr
        
        # Save master WAV in dist/
        master_path = os.path.join(project_dir, "dist", f"voiceover_{int(time.time())}.wav")
        sf.write(master_path, concatenated, target_sr, subtype='PCM_16')
        
        # Clean up temporary voice files
        for path in wav_paths:
            try:
                if os.path.exists(path) and "voice_temp" in path:
                    os.remove(path)
            except Exception as clean_err:
                print(f"[Python Server] Failed to clean up temp file {path}: {str(clean_err)}", flush=True)
                
        print(f"[Python Server] Concatenation successful. Master saved to {master_path} (duration: {total_duration:.2f}s)", flush=True)
        return jsonify({
            "success": True,
            "output_path": master_path,
            "duration": total_duration
        })
        
    except Exception as e:
        print(f"[Python Server] Concatenation failed: {str(e)}", flush=True)
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    # Start server on local port 5555
    print("[Python Server] Starting Flask Voice Cloning Server on port 5555...", flush=True)
    app.run(host="127.0.0.1", port=5555, debug=False)
