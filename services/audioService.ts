// access global variables loaded via script tags in index.html
declare const tf: any;
declare const BasicPitch: any;

// --- Constants & Types ---
const NOTE_NAMES_SHARP = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];

// FIXED: Use a stable CDN URL that resolves model.json correctly.
const BASIC_PITCH_MODEL_URL = "https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json";

interface NoteEvent {
  startTime: number;
  duration: number;
  pitchMidi: number;
  amplitude: number;
}

interface QuantizedNote {
  pitch: number;
  startTick: number; // 16th note grid
  durationTicks: number;
}

export interface TranscriptionOptions {
  quantization: 'strict' | 'loose';
  detectChords: boolean;
  instrument?: string;
  splitVoices?: boolean;
}

export interface TranscriptionResult {
  abc: string;
  noteCount: number;
  detectedKey: string;
  confidence: number;
}

// 🔧 Improved Model Initialization Singleton
let basicPitchInstance: any = null;
let initializationPromise: Promise<any> | null = null;

async function getBasicPitch() {
    if (basicPitchInstance) return basicPitchInstance;
    
    if (!initializationPromise) {
        initializationPromise = (async () => {
            try {
                console.log("🤖 Initializing TensorFlow.js...");
                
                if (typeof tf === 'undefined') {
                    throw new Error("TensorFlow.js not loaded. Please refresh the page.");
                }

                // Ensure the backend is ready.
                await tf.ready();
                console.log(`✅ TensorFlow.js ${tf.version.tfjs} is ready. Backend: ${tf.getBackend()}`);

                if (typeof BasicPitch === 'undefined') {
                     throw new Error("BasicPitch library not loaded. Please refresh the page.");
                }

                console.log("🎵 Initializing Basic Pitch model from:", BASIC_PITCH_MODEL_URL);
                
                // The UMD global 'BasicPitch' contains the class 'BasicPitch'
                const instance = new BasicPitch.BasicPitch(BASIC_PITCH_MODEL_URL);
                basicPitchInstance = instance;
                console.log("✅ Basic Pitch initialized successfully");
                return instance;
            } catch (e) {
                console.error("❌ Basic Pitch initialization failed:", e);
                initializationPromise = null;
                throw new Error("Failed to load AI model. Please check your network connection.");
            }
        })();
    }
    
    return initializationPromise;
}

// 🔧 SongScription-style Resampling Logic
// Critical: Basic Pitch models ONLY work with 22050Hz mono audio.
async function decodeAndResample(file: File): Promise<AudioBuffer> {
    const targetSampleRate = 22050;
    
    // 1. Initial Decode (at system sample rate, e.g., 44.1k or 48k)
    const audioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const tempCtx = new audioContextClass();
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        
        let originalBuffer: AudioBuffer;
        try {
            originalBuffer = await tempCtx.decodeAudioData(arrayBuffer);
        } catch (e) {
            throw new Error("Could not decode audio file. Ensure it is a valid MP3/WAV.");
        }
        
        console.log(`📊 Original: ${originalBuffer.sampleRate}Hz, ${originalBuffer.duration.toFixed(2)}s`);

        if (originalBuffer.duration > 300) {
            throw new Error("File too long. Please upload < 5 minutes for browser performance.");
        }

        // 2. Offline Resampling (High Quality)
        const offlineCtx = new OfflineAudioContext(
            1, // Force Mono
            Math.ceil(originalBuffer.duration * targetSampleRate),
            targetSampleRate
        );

        const source = offlineCtx.createBufferSource();
        source.buffer = originalBuffer;
        
        // Downmix to mono if stereo
        if (originalBuffer.numberOfChannels > 1) {
            const merger = offlineCtx.createChannelMerger(1);
            source.connect(merger);
            merger.connect(offlineCtx.destination);
        } else {
            source.connect(offlineCtx.destination);
        }
        
        source.start(0);
        const resampledBuffer = await offlineCtx.startRendering();
        
        console.log(`✅ Resampled to: ${resampledBuffer.sampleRate}Hz`);
        return resampledBuffer;

    } finally {
        if (tempCtx.state !== 'closed') {
            await tempCtx.close();
        }
    }
}

// 🔧 Main Transcription Pipeline
export const transcribeAudioToAbc = async (
  file: File, 
  onProgress: (percent: number) => void,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> => {
  
  try {
    console.log("🎤 Processing file:", file.name);
    onProgress(5);

    // 1. Prepare Audio
    const monoBuffer = await decodeAndResample(file);
    onProgress(30);
    
    // 2. Load Model
    const basicPitch = await getBasicPitch();
    onProgress(50);
    
    // 3. Inference
    console.log("🔍 Running Inference...");
    const framesAndOnsets = await basicPitch.evaluateModel(
        monoBuffer, 
        (p: number) => {
             // Map model progress (0-1) to UI progress (50-90)
             onProgress(50 + (p * 40));
        }
    );

    // 4. Convert Frames to Note Events
    console.log("🎼 Converting frames to notes...");
    
    // Use the global helper function from BasicPitch UMD
    const rawNotes = BasicPitch.noteFramesToTime(
      framesAndOnsets.frames, 
      framesAndOnsets.onsets, 
      monoBuffer.sampleRate
    );

    const notes: NoteEvent[] = rawNotes.map((n: any) => ({
        startTime: n.startTimeSeconds,
        duration: n.durationSeconds,
        pitchMidi: n.pitchMidi,
        amplitude: n.amplitude
    }));

    console.log(`🎹 Detected ${notes.length} notes`);

    if (notes.length === 0) {
        throw new Error("No notes detected. Try a clearer audio recording.");
    }

    // 5. Generate ABC Notation
    onProgress(95);
    const result = midiToAbc(notes, options);
    
    onProgress(100);
    return result;
    
  } catch (error: any) {
    console.error("❌ Processing Failed:", error);
    if (error.message?.includes("is not a function") || error.message?.includes("read")) {
        throw new Error("Browser compatibility error. Please try reloading the page.");
    }
    throw error;
  }
};

// --- Intelligent MIDI to ABC Conversion ---

function midiToAbc(rawNotes: NoteEvent[], options?: TranscriptionOptions): TranscriptionResult {
    // Standardize to 120 BPM for generic sheet music output
    const BPM = 120;
    const TICKS_PER_BEAT = 4; // 16th note resolution
    const SECONDS_PER_TICK = 60 / BPM / TICKS_PER_BEAT;

    // Filter noise
    const threshold = options?.quantization === 'strict' ? 0.2 : 0.1;
    const filteredNotes = rawNotes.filter(n => n.amplitude >= threshold);

    // Quantize Time
    const qNotes: QuantizedNote[] = filteredNotes.map(n => ({
        pitch: Math.round(n.pitchMidi),
        startTick: Math.round(n.startTime / SECONDS_PER_TICK),
        durationTicks: Math.max(1, Math.round(n.duration / SECONDS_PER_TICK))
    })).sort((a, b) => a.startTick - b.startTick);

    // Heuristic Key Detection
    const keyRoot = detectKey(qNotes);
    const keyName = NOTE_NAMES_SHARP[keyRoot % 12].replace('^', '#'); 
    
    // Build Header
    let header = `X:1
T:Audio Transcription
C:MuseGen AI
M:4/4
L:1/16
Q:1/4=${BPM}
K:${convertToAbcKey(keyName)}
`;

    let content = "";

    if (options?.splitVoices) {
        header += `V:1 clef=treble\nV:2 clef=bass\n`;
        const treble = qNotes.filter(n => n.pitch >= 60);
        const bass = qNotes.filter(n => n.pitch < 60);
        
        const endTick = Math.max(getLastTick(treble), getLastTick(bass));
        
        content = processVoice(treble, "1", endTick) + "\n" + processVoice(bass, "2", endTick);
    } else {
        header += `V:1 clef=treble\n`;
        content = processVoice(qNotes, "1");
    }

    return {
        abc: header + content,
        noteCount: filteredNotes.length,
        detectedKey: keyName,
        confidence: 0.8
    };
}

function convertToAbcKey(key: string): string {
    return key; 
}

function getLastTick(notes: QuantizedNote[]): number {
    if (notes.length === 0) return 0;
    const last = notes[notes.length - 1];
    return last.startTick + last.durationTicks;
}

function processVoice(notes: QuantizedNote[], voiceId: string, forcedEndTick?: number): string {
    const TICKS_PER_BAR = 16; 
    let abc = `[V:${voiceId}] `;
    
    const timeMap: Record<number, number[]> = {};
    let maxTick = 0;
    
    notes.forEach(n => {
        if (!timeMap[n.startTick]) timeMap[n.startTick] = [];
        if (!timeMap[n.startTick].includes(n.pitch)) {
            timeMap[n.startTick].push(n.pitch);
        }
        const end = n.startTick + n.durationTicks;
        if (end > maxTick) maxTick = end;
    });

    if (forcedEndTick && forcedEndTick > maxTick) maxTick = forcedEndTick;
    
    if (maxTick % TICKS_PER_BAR !== 0) {
        maxTick += (TICKS_PER_BAR - (maxTick % TICKS_PER_BAR));
    }

    let currentTick = 0;
    let measureStr = "";

    while (currentTick < maxTick) {
        if (currentTick > 0 && currentTick % TICKS_PER_BAR === 0) {
            abc += measureStr.trim() + " | ";
            measureStr = "";
            if ((currentTick / TICKS_PER_BAR) % 4 === 0) {
                abc += "\n" + `[V:${voiceId}] `;
            }
        }

        const pitches = timeMap[currentTick];
        
        if (pitches && pitches.length > 0) {
            let duration = 1;
            while (
                (currentTick + duration) < maxTick &&
                (currentTick + duration) % TICKS_PER_BAR !== 0 && 
                !timeMap[currentTick + duration] 
            ) {
                duration++;
            }
            
            measureStr += formatChord(pitches, duration) + " ";
            currentTick += duration;
        } else {
            let duration = 1;
            while (
                (currentTick + duration) < maxTick &&
                (currentTick + duration) % TICKS_PER_BAR !== 0 &&
                !timeMap[currentTick + duration]
            ) {
                duration++;
            }
            measureStr += formatDuration("z", duration) + " ";
            currentTick += duration;
        }
    }

    abc += measureStr.trim() + " |]";
    return abc;
}

function formatChord(pitches: number[], duration: number): string {
    const sorted = pitches.sort((a,b) => a-b);
    const abcPitches = sorted.map(p => midiToAbcPitch(p));
    const durStr = duration === 1 ? "" : duration.toString();
    
    if (abcPitches.length === 1) {
        return abcPitches[0] + durStr;
    }
    return `[${abcPitches.join("")}]${durStr}`;
}

function formatDuration(char: string, duration: number): string {
    return duration === 1 ? char : char + duration;
}

function midiToAbcPitch(midi: number): string {
    const noteNames = ['C','^C','D','^D','E','F','^F','G','^G','A','^A','B'];
    const step = midi % 12;
    const name = noteNames[step];
    
    if (midi >= 72) { 
        const octaveOffset = Math.floor((midi - 72) / 12);
        return name.toLowerCase() + "'".repeat(octaveOffset + 1);
    } else if (midi >= 60) { 
        return name.toLowerCase();
    } else if (midi >= 48) { 
        return name;
    } else { 
        const octaveOffset = Math.floor((48 - midi) / 12);
        return name + ",".repeat(octaveOffset + 1);
    }
}

function detectKey(notes: QuantizedNote[]): number {
    const counts = new Array(12).fill(0);
    notes.forEach(n => counts[n.pitch % 12]++);
    let maxCount = -1;
    let maxIndex = 0;
    for (let i = 0; i < 12; i++) {
        if (counts[i] > maxCount) {
            maxCount = counts[i];
            maxIndex = i;
        }
    }
    return maxIndex;
}