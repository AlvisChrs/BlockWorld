// ─── Procedural Web Audio API BGM & Rain Sound Generator ──────────────────────
class LofiAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.isPlaying = false;
        this.masterGain = null;
        this.rainGain = null;
        this.bgmAudio = null;
        this.currentTrackIndex = 0;
        this.playlist = [
            { title: 'A Cup of Tea', src: 'assets/music/a-cup-of-tea.mp3' },
            { title: 'Cat Caffe', src: 'assets/music/cat-caffe.mp3' },
            { title: 'Rainy Forest', src: 'assets/music/rainy-forest.mp3' }
        ];
    }

    init() {
        if (this.audioCtx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.4;
        this.masterGain.connect(this.audioCtx.destination);

        // Rain Noise Generator setup
        this.setupRainNoise();
        this.setupPlaylist();
    }

    setupRainNoise() {
        const bufferSize = 2 * this.audioCtx.sampleRate;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1; // Pink/white noise
        }

        const whiteNoise = this.audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        // Lowpass filter to make it sound like gentle rain
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        this.rainGain = this.audioCtx.createGain();
        this.rainGain.gain.value = 0.16; // audible, but still behind the music

        whiteNoise.connect(filter);
        filter.connect(this.rainGain);
        this.rainGain.connect(this.masterGain);
        whiteNoise.start();
    }

    setupPlaylist() {
        this.bgmAudio = new Audio();
        this.bgmAudio.preload = 'auto';
        this.bgmAudio.volume = 0.32;
        this.bgmAudio.addEventListener('ended', () => {
            if (!this.isPlaying) return;
            this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
            this.playCurrentTrack();
        });
    }

    playCurrentTrack() {
        const track = this.playlist[this.currentTrackIndex];
        this.bgmAudio.src = track.src;
        this.bgmAudio.play().catch(() => {
            // A user gesture is required by browsers; the audio button supplies it.
        });
        return track;
    }

    playLofiChord() {
        if (!this.isPlaying || !this.audioCtx) return;

        // Smooth Lofi 7th Chord Progression (Cmaj7 -> Am7 -> Dm7 -> G7)
        const chords = [
            [261.63, 329.63, 392.00, 493.88], // Cmaj7
            [220.00, 261.63, 329.63, 392.00], // Am7
            [293.66, 349.23, 440.00, 523.25], // Dm7
            [196.00, 246.94, 293.66, 349.23]  // G7
        ];

        const chord = chords[Math.floor(Math.random() * chords.length)];
        const now = this.audioCtx.currentTime;

        chord.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const filter = this.audioCtx.createBiquadFilter();

            osc.type = 'triangle'; // Warm lofi tone
            osc.frequency.setValueAtTime(freq * 0.5, now); // 1 octave lower

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, now);

            // Envelope: soft attack, long decay
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.11 - (idx * 0.012), now + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now + idx * 0.08); // Slight arpeggio feel
            osc.stop(now + 4.0);
        });
    }

    async toggle() {
        this.init();
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('audioToggleBtn');

        if (this.isPlaying) {
            // Restore the master channel after it was muted by a previous toggle.
            this.masterGain.gain.setTargetAtTime(0.4, this.audioCtx.currentTime, 0.05);
            btn.classList.add('active');
            const track = this.playCurrentTrack();
            btn.textContent = `🎵 ${track.title} & Rain: ON`;
        } else {
            btn.classList.remove('active');
            btn.textContent = '🎵 BGM & Rain: OFF';
            this.bgmAudio.pause();
            if (this.masterGain) this.masterGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
        }
    }
}

const lofiAudio = new LofiAudioEngine();