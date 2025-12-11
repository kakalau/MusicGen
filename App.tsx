import React, { useState, useCallback } from 'react';
import { 
  Wand2, 
  Music, 
  Loader2, 
  LayoutTemplate, 
  FileCode, 
  MonitorPlay,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mic,
  Type
} from 'lucide-react';
import { generateMusicNotation } from './services/geminiService';
import Editor from './components/Editor';
import ScoreRenderer from './components/ScoreRenderer';
import AudioUploader from './components/AudioUploader';
import { ExamplePrompt } from './types';

const INITIAL_ABC = `X:1
T:Peaceful Meditation
C:Gemini Pro
M:4/4
L:1/8
Q:1/4=70
K:C
V:1 clef=treble
%%MIDI program 0
V:2 clef=bass
%%MIDI program 0
% Intro
[V:1] !mp! E4 G4 | c4 e4 | d4 B4 | c8 |
[V:2] C,4 E,4 | G,4 C4 | G,4 G,,4 | C,8 |
% Main Theme
[V:1] !p! (3EGE (3cde g2 e2 | f2 a2 g2 e2 | d2 f2 e2 c2 | d4 G4 |
[V:2] C,2 E,2 G,2 C2 | F,2 A,2 C2 C,2 | G,2 B,2 C2 E,2 | G,8 |
[V:1] !mf! c2 e2 g2 c'2 | b2 a2 g2 e2 | f2 d2 B2 d2 | c8 |]
[V:2] C,2 E,2 G,2 A,2 | G,2 F,2 E,2 C,2 | F,2 A,2 G,2 G,,2 | C,8 |]`;

const EXAMPLES: ExamplePrompt[] = [
  { label: "Peaceful Piano", text: "A peaceful and slow piano melody in C major, pastoral style." },
  { label: "Upbeat Jig", text: "An energetic Irish jig in 6/8 time, key of G, fast tempo." },
  { label: "Melancholy Violin", text: "A sad, slow violin piece in A minor with expressive dynamics." },
  { label: "Jazz Swing", text: "A jazzy swing tune in Bb major with walking bass line suggestions." },
  { label: "Epic Orchestral", text: "A grand, heroic orchestral theme in D minor, marching tempo." },
  { label: "Synthwave", text: "A retro 80s synthwave track in A minor with a driving bassline and nostalgic melody." },
  { label: "Acoustic Folk", text: "A warm acoustic guitar fingerpicking pattern in D major, cheerful and rustic." },
  { label: "Lullaby", text: "A simple, soothing lullaby in F major with a gentle 3/4 rhythm." },
  { label: "Baroque", text: "A two-part invention in the style of Bach, C minor, contrapuntal and precise." },
  { label: "Flamenco", text: "A passionate Spanish flamenco guitar piece in Phrygian mode, fast strumming and triplets." },
];

type ViewMode = 'split' | 'editor' | 'preview';
type InputMode = 'text' | 'audio';

function App() {
  const [prompt, setPrompt] = useState('');
  const [abcCode, setAbcCode] = useState(INITIAL_ABC);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);
  const [activeSampleIndex, setActiveSampleIndex] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('text');

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const generatedAbc = await generateMusicNotation(prompt);
      setAbcCode(generatedAbc);
      if (window.innerWidth < 1024) {
        setViewMode('preview');
      }
    } catch (err) {
      setError("Failed to generate music. Please check your API Key and connection.");
    } finally {
      setIsGenerating(false);
    }
  }, [prompt]);

  const handleSampleClick = (text: string, index: number) => {
    setPrompt(text);
    setActiveSampleIndex(index);
    if (inputMode !== 'text') setInputMode('text');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrompt(e.target.value);
    setActiveSampleIndex(null); // Deselect sample if user types custom input
  };

  const handleAudioSuccess = (abc: string) => {
    setAbcCode(abc);
    if (window.innerWidth < 1024) {
        setViewMode('preview');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* 1. Top Navigation Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
            <Music className="text-white" size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            MusicGen
          </span>
        </div>

        {/* View Switcher */}
        <div className="flex bg-slate-800 rounded-lg p-1 space-x-1">
          <button
            onClick={() => setViewMode('editor')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'editor' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title="Editor Only"
          >
            <FileCode size={18} />
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`hidden md:block p-1.5 rounded-md transition-all ${
              viewMode === 'split' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title="Split View"
          >
            <LayoutTemplate size={18} />
          </button>
          <button
            onClick={() => setViewMode('preview')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'preview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title="Preview Only"
          >
            <MonitorPlay size={18} />
          </button>
        </div>
      </header>

      {/* 2. AI Assistant Section (Collapsible) */}
      <div className={`bg-slate-900/50 border-b border-slate-800 transition-all duration-300 ease-in-out ${isAiPanelOpen ? 'max-h-[30rem]' : 'max-h-0 overflow-hidden'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
          
          {/* Input Mode Toggle */}
          <div className="flex justify-center">
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 inline-flex">
                <button 
                    onClick={() => setInputMode('text')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${inputMode === 'text' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <Type size={14} /> Text
                </button>
                <button 
                    onClick={() => setInputMode('audio')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${inputMode === 'audio' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                >
                    <Mic size={14} /> Audio Upload
                </button>
            </div>
          </div>

          {/* Input Area */}
          <div className="flex gap-4">
            <div className="flex-grow relative">
              {inputMode === 'text' ? (
                  <>
                    <input
                        type="text"
                        value={prompt}
                        onChange={handleInputChange}
                        placeholder="Describe the music you want (e.g., 'A melancholic cello solo in D minor')..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-5 py-4 pr-32 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !prompt.trim()}
                        className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
                    >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                        <span className="hidden sm:inline">Generate</span>
                    </button>
                  </>
              ) : (
                  <AudioUploader onSuccess={handleAudioSuccess} />
              )}
            </div>
          </div>
          
          {/* Examples Horizontal Scroll (Only visible in Text mode) */}
          {inputMode === 'text' && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {EXAMPLES.map((ex, idx) => {
                  const isActive = activeSampleIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSampleClick(ex.text, idx)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs whitespace-nowrap snap-start shrink-0 group ${
                        isActive 
                          ? 'bg-indigo-600/20 border-indigo-500 text-white' 
                          : 'bg-slate-800 border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      <Sparkles size={12} className={isActive ? "text-indigo-300" : "text-indigo-400 group-hover:text-indigo-300"} />
                      {ex.label}
                    </button>
                  );
                })}
              </div>
          )}
          
          {error && inputMode === 'text' && (
            <div className="text-red-400 text-sm bg-red-950/30 border border-red-900/50 px-3 py-2 rounded-md flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Collapse/Expand Handle */}
      <button 
        onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
        className="w-full h-4 bg-slate-950 hover:bg-slate-900 flex items-center justify-center border-b border-slate-800 cursor-pointer transition-colors group z-10"
        aria-label="Toggle AI Panel"
      >
        {isAiPanelOpen ? (
          <ChevronUp size={14} className="text-slate-600 group-hover:text-indigo-400" />
        ) : (
          <ChevronDown size={14} className="text-slate-600 group-hover:text-indigo-400" />
        )}
      </button>

      {/* 3. Main Workspace */}
      <main className="flex-grow flex overflow-hidden">
        {/* Editor Pane */}
        <div className={`flex-1 min-w-0 transition-all duration-300 ${
          viewMode === 'split' ? 'w-1/2 border-r border-slate-800' : 
          viewMode === 'editor' ? 'w-full' : 'hidden'
        }`}>
          <Editor code={abcCode} onChange={setAbcCode} />
        </div>

        {/* Preview Pane */}
        <div className={`flex-1 min-w-0 bg-slate-50 transition-all duration-300 flex flex-col ${
          viewMode === 'split' ? 'w-1/2' : 
          viewMode === 'preview' ? 'w-full' : 'hidden'
        }`}>
          <ScoreRenderer abcNotation={abcCode} onChange={setAbcCode} />
        </div>
      </main>
    </div>
  );
}

export default App;