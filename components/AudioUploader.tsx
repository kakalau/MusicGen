import React, { useState, useRef, useEffect } from 'react';
import { Upload, Music, AlertCircle, CheckCircle2, FileAudio, Loader2, RefreshCcw, ArrowRight, Settings2, Sparkles, Wand2, PlayCircle, Download } from 'lucide-react';
import { transcribeAudioToAbc, TranscriptionResult, TranscriptionOptions } from '../services/audioService';
import { refineAbcWithAI } from '../services/geminiService';
import abcjs from 'abcjs';

interface AudioUploaderProps {
  onSuccess: (abc: string) => void;
}

type UploadStatus = 'idle' | 'processing' | 'success';

const AudioUploader: React.FC<AudioUploaderProps> = ({ onSuccess }) => {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null); // Use ref for preview container

  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationPrompt, setOptimizationPrompt] = useState('修正不合理的音符時值，添加表情記號，優化小節劃分。');

  // Settings State
  const [quantization, setQuantization] = useState<number>(50); // 0 = strict, 100 = loose
  const [detectChords, setDetectChords] = useState(true);
  const [splitVoices, setSplitVoices] = useState(false);

  // Cleanup object URL
  useEffect(() => {
      return () => {
          if (audioUrl) URL.revokeObjectURL(audioUrl);
      };
  }, [audioUrl]);

  // Render Preview Thumbnail
  useEffect(() => {
    if (status === 'success' && result?.abc && previewRef.current) {
      try {
          // Explicitly clear before rendering
          previewRef.current.innerHTML = "";
          abcjs.renderAbc(previewRef.current, result.abc, {
              staffwidth: 400, // Fixed width for thumbnail
              paddingbottom: 0,
              paddingtop: 10,
              paddingleft: 10,
              paddingright: 10,
              scale: 0.6, // Smaller scale
          });
      } catch (e) {
          console.error("ABCJS Preview Render Error:", e);
      }
    }
  }, [status, result?.abc]);

  const processFile = async (file: File) => {
    console.log("📁 文件信息:", {
        name: file.name,
        type: file.type,
        size: (file.size / 1024).toFixed(2) + " KB"
    });

    // 1. Validation
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.mp3') && !file.name.endsWith('.wav')) {
      setError("Unsupported file format. Please use MP3 or WAV.");
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      setError("File is too large. Please upload a file smaller than 50MB.");
      return;
    }

    setError(null);
    setStatus('processing');
    setProgress(0);
    setUploadedFile(file);
    setAudioUrl(URL.createObjectURL(file));

    try {
      const options: TranscriptionOptions = {
          quantization: quantization > 50 ? 'loose' : 'strict',
          detectChords: detectChords,
          splitVoices: splitVoices
      };
      
      const res = await transcribeAudioToAbc(file, (p) => setProgress(Math.round(p)), options);
      setResult(res);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setError("Failed to process audio. The file might be corrupted or too complex.");
      setStatus('idle');
    }
  };

  const handleOptimize = async () => {
      if (!result) return;
      setIsOptimizing(true);
      try {
          const optimizedAbc = await refineAbcWithAI(result.abc, optimizationPrompt);
          setResult({
              ...result,
              abc: optimizedAbc
          });
      } catch (e) {
          setError("AI Optimization failed. Please try again.");
      } finally {
          setIsOptimizing(false);
      }
  };

  const handleApply = () => {
      if (result) {
          onSuccess(result.abc);
      }
  };

  const handleExportAbc = () => {
      if (!result) return;
      const blob = new Blob([result.abc], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcription.abc';
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleReset = () => {
      setStatus('idle');
      setResult(null);
      setProgress(0);
      setError(null);
      setUploadedFile(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // --- Render: Idle State (Drag & Drop) ---
  if (status === 'idle') {
      return (
        <div className="w-full">
            <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 group ${
                isDragging 
                ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]' 
                : 'border-indigo-300/30 hover:border-indigo-400 hover:bg-slate-800/50 bg-slate-950'
            }`}
            >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                accept=".mp3,.wav,.m4a"
                className="hidden" 
            />
            
            <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-full transition-transform duration-300 ${isDragging ? 'scale-110' : 'group-hover:scale-110'}`}>
                    <Upload className={`w-10 h-10 ${isDragging ? 'text-indigo-400' : 'text-indigo-300/70 group-hover:text-indigo-400'}`} />
                </div>
                
                <div className="space-y-1">
                    <h3 className="text-indigo-100 font-medium text-lg">Drag & Drop Audio File</h3>
                    <p className="text-slate-400 text-sm">or click to browse</p>
                </div>
                
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-slate-900 rounded-full border border-slate-800 text-xs text-slate-500">
                    <FileAudio size={12} />
                    <span>MP3, WAV, M4A (Max 50MB)</span>
                </div>
            </div>
            </div>

            {error && (
                <div className="mt-4 bg-red-950/30 border border-red-900/50 rounded-lg p-3 flex items-start gap-3 text-red-300 text-sm animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{error}</span>
                </div>
            )}
        </div>
      );
  }

  // --- Render: Processing State ---
  if (status === 'processing') {
      const getStatusText = () => {
          if (progress < 30) return "Decoding Audio...";
          if (progress < 80) return "Analyzing Pitch & Rhythm...";
          return "Generating Sheet Music...";
      };

      return (
        <div className="w-full bg-slate-950 border border-indigo-500/30 rounded-xl p-8 text-center relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center">
                {/* Wave Animation */}
                <div className="flex items-center justify-center gap-1.5 h-12 mb-6">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="wave-bar h-full bg-indigo-400 rounded-full w-1.5 opacity-80" />
                    ))}
                </div>

                <h3 className="text-xl font-medium text-white mb-2">{getStatusText()}</h3>
                <p className="text-slate-400 text-sm mb-6 font-mono">{progress}% Complete</p>

                {/* Progress Bar */}
                <div className="w-full max-w-md bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div 
                        className="bg-indigo-500 h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>
        </div>
      );
  }

  // --- Render: Success State ---
  return (
      <div className="w-full animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-slate-900 border border-indigo-500/30 rounded-xl overflow-hidden shadow-2xl shadow-indigo-900/10">
              
              {/* Header */}
              <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 size={18} />
                      <span className="font-medium text-sm">Analysis Complete</span>
                  </div>
                  <button onClick={handleReset} className="text-slate-400 hover:text-white transition-colors text-xs flex items-center gap-1">
                      <RefreshCcw size={12} /> Re-upload
                  </button>
              </div>

              <div className="p-5 flex flex-col md:flex-row gap-6">
                  {/* Left Column: Preview & Audio */}
                  <div className="flex-1 space-y-4">
                       {/* Stats */}
                       <div className="grid grid-cols-3 gap-2">
                           <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                               <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Key</div>
                               <div className="text-base font-bold text-white">{result?.detectedKey || "C"}</div>
                           </div>
                           <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                               <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Notes</div>
                               <div className="text-base font-bold text-white">{result?.noteCount || 0}</div>
                           </div>
                           <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                               <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Part</div>
                               <div className="text-base font-bold text-white">{splitVoices ? "Dual" : "Single"}</div>
                           </div>
                       </div>
                       
                       {/* Sheet Music Thumbnail */}
                       <div className="bg-white rounded-lg p-2 overflow-hidden h-32 relative group">
                            {/* Use ref here */}
                            <div ref={previewRef} className="w-full h-full opacity-90 origin-top-left"></div>
                            <div className="absolute inset-0 bg-gradient-to-t from-white/90 to-transparent flex items-end justify-center pb-2 pointer-events-none">
                                <span className="text-slate-400 text-xs font-medium">Preview (First 4 bars)</span>
                            </div>
                       </div>
                       
                       {/* Original Audio Player */}
                       {audioUrl && (
                           <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center gap-3">
                               <PlayCircle size={20} className="text-indigo-400 shrink-0" />
                               <div className="flex-grow min-w-0">
                                   <div className="text-xs text-slate-400 truncate mb-1">{uploadedFile?.name}</div>
                                   <audio src={audioUrl} controls className="w-full h-8 block accent-indigo-500" />
                               </div>
                           </div>
                       )}

                       {/* Action Buttons */}
                       <div className="grid grid-cols-2 gap-2">
                           <button 
                                onClick={handleOptimize}
                                disabled={isOptimizing}
                                className="bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                           >
                               {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                               AI Optimize
                           </button>
                           <button 
                                onClick={handleExportAbc}
                                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                           >
                               <Download size={14} />
                               Export ABC
                           </button>
                       </div>
                  </div>

                  {/* Right Column: Settings & Apply */}
                  <div className="w-full md:w-64 flex flex-col gap-4 border-l border-slate-800 pl-0 md:pl-6">
                      <div className="space-y-4">
                          <div className="flex items-center gap-2 text-indigo-300 text-sm font-medium">
                              <Settings2 size={16} /> AI Settings
                          </div>
                          
                          {/* Optimization Instruction */}
                          <div className="space-y-1">
                              <label className="text-xs text-slate-400">Optimization Instruction</label>
                              <textarea 
                                value={optimizationPrompt}
                                onChange={(e) => setOptimizationPrompt(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-300 focus:border-indigo-500/50 outline-none resize-none h-20"
                                placeholder="E.g. Fix rhythm, add jazz chords..."
                              />
                          </div>
                          
                          <div className="space-y-1">
                              <div className="flex justify-between text-xs text-slate-400">
                                  <span>Quantization (Manual)</span>
                                  <span>{quantization}%</span>
                              </div>
                              <input 
                                  type="range" 
                                  min="0" max="100" 
                                  value={quantization}
                                  onChange={(e) => setQuantization(parseInt(e.target.value))}
                                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                              />
                          </div>

                          <div className="space-y-3">
                              <label className="flex items-center justify-between cursor-pointer group">
                                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors">Split Hands (Piano)</span>
                                  <div 
                                    onClick={() => setSplitVoices(!splitVoices)}
                                    className={`w-8 h-4 rounded-full relative transition-colors ${splitVoices ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                  >
                                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${splitVoices ? 'left-4.5' : 'left-0.5'}`}></div>
                                  </div>
                              </label>
                          </div>
                      </div>

                      <div className="mt-auto pt-4">
                          <button 
                            onClick={handleApply}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 group"
                          >
                              Open in Editor 
                              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
};

export default AudioUploader;