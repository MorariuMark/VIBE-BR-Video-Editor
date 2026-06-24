import os
import requests

# Set local folders
project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
default_voices_dir = os.path.join(project_dir, "assets", "default_voices")
os.makedirs(default_voices_dir, exist_ok=True)

# Default voice URLs (open test samples)
voices = {
    "peter_ref.wav": {
        "url": "https://github.com/gabriele-mastrapasqua/qwen3-tts/raw/main/samples/english_ryan.wav",
        "transcript": "A custom voice is generated when the user provides a reference audio clip of a speaker."
    },
    "stewie_ref.wav": {
        "url": "https://github.com/gabriele-mastrapasqua/qwen3-tts/raw/main/samples/italian_vivian.wav", 
        "backup_url": "https://github.com/gabriele-mastrapasqua/qwen3-tts/raw/main/samples/english_ryan.wav", # fall back to Ryan if needed
        "transcript": "Buongiorno a tutti, questa è una dimostrazione della sintesi vocale."
    }
}

def download_file(url, path):
    try:
        print(f"Downloading from {url}...")
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            with open(path, "wb") as f:
                f.write(response.content)
            print(f"Saved: {path}")
            return True
        else:
            print(f"Failed to download (Status Code: {response.status_code})")
            return False
    except Exception as e:
        print(f"Error downloading: {str(e)}")
        return False

def main():
    print("===================================================")
    print(" Downloading Default Reference Voices")
    print("===================================================")
    
    for filename, info in voices.items():
        dest_path = os.path.join(default_voices_dir, filename)
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
            print(f"{filename} already exists. Skipping.")
            continue
            
        success = download_file(info["url"], dest_path)
        if not success and "backup_url" in info:
            print(f"Trying backup URL for {filename}...")
            download_file(info["backup_url"], dest_path)
            
        # Write transcript metadata
        tx_path = dest_path + ".txt"
        with open(tx_path, "w", encoding="utf-8") as f:
            f.write(info["transcript"])
            
    print("\nDefault voices setup complete!")

if __name__ == "__main__":
    main()
