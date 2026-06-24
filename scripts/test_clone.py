import os
import sys

# Configure project-local Hugging Face home directory
project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["HF_HOME"] = os.path.join(project_dir, ".hf_cache")

print("1. Importing PyTorch & torchaudio...")
import torch
import soundfile as sf
print("2. Importing Qwen3TTSModel...")
from qwen_tts import Qwen3TTSModel

device = "cuda:0" if torch.cuda.is_available() else "cpu"
dtype = torch.float32

print(f"3. Loading model Qwen/Qwen3-TTS-12Hz-0.6B-Base on {device}...")
model = Qwen3TTSModel.from_pretrained(
    "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    device_map=device,
    dtype=dtype,
    attn_implementation="eager"
)
print("Model loaded successfully!")

ref_audio = os.path.join(project_dir, "assets", "default_voices", "peter_ref.wav")
ref_text = "A custom voice is generated when the user provides a reference audio clip of a speaker."

print(f"4. Running generate_voice_clone with reference audio {ref_audio}...")
wavs, sr = model.generate_voice_clone(
    text="Hello, this is a test of the zero shot voice cloning system.",
    language="English",
    ref_audio=ref_audio,
    ref_text=ref_text
)

print(f"5. Saving output to test_out.wav...")
sf.write("test_out.wav", wavs[0], sr)
print("Test completed successfully!")
