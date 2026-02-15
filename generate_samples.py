"""Generate sample WAV audio files for demo purposes."""
import wave
import struct
import math
import os

SAMPLE_RATE = 44100

# Telugu-themed demo track data
TRACKS = [
    {"name": "Amma_Paata", "artist": "Demo Artist", "album": "Telugu Melodies", "freq": 261.63, "duration": 15},
    {"name": "Vaana_Villulu", "artist": "Demo Artist", "album": "Telugu Melodies", "freq": 293.66, "duration": 12},
    {"name": "Chandamama", "artist": "Priya", "album": "Telugu Melodies", "freq": 329.63, "duration": 14},
    {"name": "Naa_Hrudayam", "artist": "Priya", "album": "Prema Geethalu", "freq": 349.23, "duration": 13},
    {"name": "Gali_Chirugali", "artist": "Ravi Kumar", "album": "Prema Geethalu", "freq": 392.00, "duration": 16},
    {"name": "Edo_Oka_Raagam", "artist": "Ravi Kumar", "album": "Prema Geethalu", "freq": 440.00, "duration": 11},
    {"name": "Telangana_Beats", "artist": "Demo Beats", "album": "Folk Rhythms", "freq": 493.88, "duration": 10},
    {"name": "Janapadham", "artist": "Demo Beats", "album": "Folk Rhythms", "freq": 523.25, "duration": 14},
    {"name": "Pacha_Bottesina", "artist": "Demo Beats", "album": "Folk Rhythms", "freq": 587.33, "duration": 12},
    {"name": "Swaraalu", "artist": "Sangeetha", "album": "Classical Notes", "freq": 659.25, "duration": 15},
    {"name": "Raaga_Tarangalu", "artist": "Sangeetha", "album": "Classical Notes", "freq": 698.46, "duration": 13},
    {"name": "Nuvvu_Naaku", "artist": "Sangeetha", "album": "Classical Notes", "freq": 783.99, "duration": 11},
]

def generate_melody_wav(filepath, base_freq, duration_sec):
    """Generate a pleasant melody WAV file with harmonics and envelope."""
    n_samples = SAMPLE_RATE * duration_sec

    with wave.open(filepath, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)

        frames = []
        # Simple melody: base note with harmonics and a gentle vibrato
        for i in range(n_samples):
            t = i / SAMPLE_RATE

            # Envelope: fade in/out
            env = 1.0
            fade_time = 0.5
            if t < fade_time:
                env = t / fade_time
            elif t > duration_sec - fade_time:
                env = (duration_sec - t) / fade_time

            # Vibrato
            vibrato = 1.0 + 0.005 * math.sin(2 * math.pi * 5 * t)
            freq = base_freq * vibrato

            # Melody variation: shift pitch every 2 seconds
            beat = int(t / 2) % 4
            freq_mult = [1.0, 1.125, 1.25, 1.0][beat]
            freq *= freq_mult

            # Main tone + harmonics
            sample = 0.5 * math.sin(2 * math.pi * freq * t)
            sample += 0.25 * math.sin(2 * math.pi * freq * 2 * t)
            sample += 0.1 * math.sin(2 * math.pi * freq * 3 * t)

            sample *= env * 0.7
            sample = max(-1.0, min(1.0, sample))
            frames.append(struct.pack('<h', int(sample * 32767)))

        wav.writeframes(b''.join(frames))

os.makedirs('music/Telugu Melodies', exist_ok=True)
os.makedirs('music/Prema Geethalu', exist_ok=True)
os.makedirs('music/Folk Rhythms', exist_ok=True)
os.makedirs('music/Classical Notes', exist_ok=True)

for track in TRACKS:
    filepath = f"music/{track['album']}/{track['name']}.wav"
    print(f"Generating: {filepath}")
    generate_melody_wav(filepath, track['freq'], track['duration'])

print(f"\nDone! Generated {len(TRACKS)} sample tracks.")
