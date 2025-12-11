import React, { useEffect, useRef, useState, useCallback } from 'react';
import abcjs from 'abcjs';
import { Settings2, Printer, FileAudio, AlertCircle, Play, Pause, RotateCcw, Repeat } from 'lucide-react';

// --- Helper: AudioBuffer to WAV ---
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(44 + offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

// --- Helper: Format Seconds to MM:SS ---
const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- CursorControl Class ---
class CursorControl {
  cursor: SVGLineElement | null = null;
  rootSvg: SVGSVGElement | null = null;
  scrollContainer: HTMLElement | null;
  shouldAutoScroll: boolean = true;
  
  constructor(scrollContainer: HTMLElement | null) {
    this.scrollContainer = scrollContainer;
  }

  onStart() {
    const svg = this.scrollContainer?.querySelector('svg');
    if (svg) {
      this.rootSvg = svg as SVGSVGElement;
      this.cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
      this.cursor.setAttribute("class", "abcjs-cursor");
      this.rootSvg.appendChild(this.cursor);
    }
  }

  onEvent(ev: any) {
    // 1. Highlight Notes
    if (this.scrollContainer) {
        const oldHighlights = this.scrollContainer.querySelectorAll('.abcjs-highlight');
        oldHighlights.forEach((el) => el.classList.remove('abcjs-highlight'));
    }
    
    const highlightElements = (elements: any) => {
        if (!elements) return;
        if (Array.isArray(elements)) {
            elements.forEach(highlightElements);
        } else if (elements.classList && typeof elements.classList.add === 'function') {
            elements.classList.add('abcjs-highlight');
        }
    };

    if (ev && ev.elements) {
        highlightElements(ev.elements);
    }

    // 2. Move Cursor
    if (this.cursor && ev && ev.elements && this.rootSvg) {
      let targetEl = null;
      const findFirstElement = (elements: any): any => {
          if (!elements) return null;
          if (Array.isArray(elements)) {
              return elements.length > 0 ? findFirstElement(elements[0]) : null;
          }
          return elements;
      };
      targetEl = findFirstElement(ev.elements);

      let x = 0, y = 0, h = 0;
      if (typeof ev.left === 'number') {
          x = ev.left;
          y = ev.top;
          h = ev.height;
      } else if (targetEl && typeof targetEl.getBBox === 'function') {
          try {
             const bbox = targetEl.getBBox();
             x = bbox.x;
             y = bbox.y;
             h = bbox.height;
          } catch(e) {}
      }

      if (h > 0) {
        this.cursor.setAttribute("x1", String(x));
        this.cursor.setAttribute("x2", String(x));
        this.cursor.setAttribute("y1", String(y));
        this.cursor.setAttribute("y2", String(y + h));
        this.handleScroll(x);
      }
    }
  }

  handleScroll(cursorX: number) {
    if (!this.shouldAutoScroll || !this.scrollContainer) return;
    
    const container = this.scrollContainer;
    const containerWidth = container.clientWidth;
    const scrollLeft = container.scrollLeft;
    
    // Auto-scroll logic: Keep cursor between 25% and 70% of viewport
    const minVisible = scrollLeft + (containerWidth * 0.25);
    const maxVisible = scrollLeft + (containerWidth * 0.70);

    if (cursorX > maxVisible || cursorX < scrollLeft) {
      container.scrollTo({
        left: Math.max(0, cursorX - (containerWidth * 0.25)),
        behavior: 'smooth'
      });
    }
  }

  onFinished() {
    if (this.cursor && this.cursor.parentNode) {
      this.cursor.parentNode.removeChild(this.cursor);
    }
    this.cursor = null;
    if (this.scrollContainer) {
        const oldHighlights = this.scrollContainer.querySelectorAll('.abcjs-highlight');
        oldHighlights.forEach((el) => el.classList.remove('abcjs-highlight'));
    }
  }
}

interface ScoreRendererProps {
  abcNotation: string;
  onChange?: (value: string) => void;
}

const ScoreRenderer: React.FC<ScoreRendererProps> = ({ abcNotation, onChange }) => {
  const paperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const synthControlRef = useRef<any>(null);
  const cursorControlRef = useRef<CursorControl | null>(null);
  
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [tempo, setTempo] = useState(100); 
  const [isLooping, setIsLooping] = useState(false);
  const [isAutoScroll] = useState(true);
  const [visualObj, setVisualObj] = useState<any>(null);
  const [totalDuration, setTotalDuration] = useState(0);
  
  // Render sizing state
  const [staffWidth, setStaffWidth] = useState<number>(0);

  // Error State
  const [renderError, setRenderError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Measure container width for sharp rendering
  useEffect(() => {
    if (!cardRef.current) return;
    
    let resizeTimer: any;
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                // Calculate available width inside the card padding
                const styles = window.getComputedStyle(entry.target);
                const paddingLeft = parseFloat(styles.paddingLeft);
                const paddingRight = parseFloat(styles.paddingRight);
                const contentWidth = entry.contentRect.width - paddingLeft - paddingRight;
                
                // Fallback to a safe width if something goes wrong
                const finalWidth = Math.max(300, contentWidth > 0 ? contentWidth : entry.contentRect.width - 96);
                
                setStaffWidth(finalWidth);
            }, 100); // Debounce
        }
    });

    resizeObserver.observe(cardRef.current);
    return () => {
        resizeObserver.disconnect();
        clearTimeout(resizeTimer);
    };
  }, []);

  // Initialize ABCJS synth and cursor
  useEffect(() => {
    if (abcjs.synth.supportsAudio()) {
      synthControlRef.current = new abcjs.synth.SynthController();
    }
    cursorControlRef.current = new CursorControl(containerRef.current);
    
    return () => {
        if (synthControlRef.current) {
            synthControlRef.current.disable(true);
        }
    };
  }, []);

  // Update cursor scrolling preference
  useEffect(() => {
    if (cursorControlRef.current) {
        cursorControlRef.current.shouldAutoScroll = isAutoScroll;
    }
  }, [isAutoScroll]);

  // Update container reference for cursor control
  useEffect(() => {
    if (cursorControlRef.current) {
        cursorControlRef.current.scrollContainer = containerRef.current;
    }
  }, [containerRef.current]);

  // Load Audio Handler
  const loadAudio = useCallback(async (tune: any) => {
    if (!synthControlRef.current) return;
    setIsLoaded(false);
    setAudioError(null);
    
    const wrappedCursorControl = {
        onStart: () => {
            if (cursorControlRef.current) cursorControlRef.current.onStart();
            setIsPlaying(true);
        },
        onEvent: (ev: any) => {
            if (cursorControlRef.current) cursorControlRef.current.onEvent(ev);
        },
        onFinished: () => {
            if (cursorControlRef.current) cursorControlRef.current.onFinished();
            setIsPlaying(false);
            setProgress(0);
        }
    };

    try {
      await synthControlRef.current.load("#audio", wrappedCursorControl, {
         displayLoop: true,
         displayRestart: true,
         displayPlay: true,
         displayProgress: true,
         displayWarp: true
      });
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await synthControlRef.current.setTune(tune, false, {
        audioContext: audioContext,
        visualObj: tune,
      });

      setIsLoaded(true);
    } catch (err) {
      console.error("Audio Load Error:", err);
      setAudioError("Could not load audio engine. Please try a simpler score.");
    }
  }, []);

  // Render ABC
  useEffect(() => {
    if (paperRef.current && abcNotation && staffWidth > 0) {
      setRenderError(null);
      setAudioError(null);
      
      const visualOptions = {
        responsive: "resize",
        add_classes: true,
        paddingtop: 30,
        paddingbottom: 30,
        paddingright: 30,
        paddingleft: 30,
        staffwidth: staffWidth, // Dynamic precise width
        wrap: { minSpacing: 1.8, maxSpacing: 2.7 }
      };

      // Filter out Title and Composer from display to hide them visually
      const displayAbc = abcNotation
        .replace(/^T:.*\r?\n/gm, '')
        .replace(/^C:.*\r?\n/gm, '');

      try {
        const renderedObj = abcjs.renderAbc(paperRef.current, displayAbc, visualOptions);
        if (!renderedObj || renderedObj.length === 0) {
             setRenderError("Failed to render music notation. Invalid ABC syntax.");
             setVisualObj(null);
             return;
        }
        
        const tune = renderedObj[0];
        setVisualObj(tune);
        
        if (tune) {
            setTotalDuration(tune.getTotalTime());
            if (synthControlRef.current) loadAudio(tune);
        }
      } catch (e) {
        console.error("ABCJS Render Error", e);
        setRenderError("Syntax Error in ABC notation.");
        setVisualObj(null);
      }
    }
  }, [abcNotation, loadAudio, staffWidth]);

  const togglePlay = useCallback(() => {
    if (!synthControlRef.current || !isLoaded) return;
    if (isPlaying) {
        synthControlRef.current.pause();
        setIsPlaying(false);
    } else {
        synthControlRef.current.play();
        setIsPlaying(true);
    }
  }, [isPlaying, isLoaded]);

  const handleRestart = useCallback(() => {
    synthControlRef.current?.restart();
    setProgress(0);
    setIsPlaying(true);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
    synthControlRef.current?.seek(val);
  }, []);
  
  const handleTempoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setTempo(val);
    synthControlRef.current?.setWarp(val); 
  }, []);
  
  const toggleLoop = useCallback(() => {
      setIsLooping(prev => !prev);
  }, []);

  const handlePrint = useCallback(() => {
    if (!paperRef.current) return;
    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    if (!printWindow) {
        alert("Please allow popups to use the print feature.");
        return;
    }
    
    // Extract title from original ABC since visualObj is stripped
    const titleMatch = abcNotation.match(/^T:(.*)$/m);
    const title = (titleMatch ? titleMatch[1].trim() : 'Sheet Music');
    
    const svgContent = paperRef.current.innerHTML;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                body { margin: 0; padding: 40px; text-align: center; font-family: sans-serif; }
                h1 { margin-bottom: 20px; font-size: 24px; color: #333; }
                svg { max-width: 100%; height: auto; shape-rendering: geometricPrecision; }
                @media print {
                    body { -webkit-print-color-adjust: exact; padding: 0; }
                    @page { margin: 1cm; size: auto; }
                }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            ${svgContent}
            <script>
                window.onload = function() {
                    window.focus();
                    setTimeout(() => { window.print(); window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
  }, [abcNotation]);

  const handleDownloadWav = useCallback(async () => {
     if (!visualObj) return;
     try {
       // Fix: Validation for duration to prevent OfflineAudioContext(0) error
       const rawDuration = visualObj.getTotalTime();
       const duration = (typeof rawDuration === 'number' && rawDuration > 0) ? rawDuration : 0;
       
       const sampleRate = 44100;
       // Add 1 second buffer for tail decay, ensure valid integer length >= sampleRate
       const length = Math.max(sampleRate, Math.ceil((duration + 1) * sampleRate));
       
       const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
       
       // Fix: Polyfill resume() because abcjs might call it, but OfflineAudioContext 
       // doesn't support it or throws if called before startRendering in some envs.
       (offlineCtx as any).resume = () => Promise.resolve();

       const batchSynth = new abcjs.synth.CreateSynth();
       
       await batchSynth.init({
           visualObj: visualObj,
           audioContext: offlineCtx,
           millisecondsPerMeasure: visualObj.millisecondsPerMeasure()
       });
       await batchSynth.prime();
       const renderedBuffer = await offlineCtx.startRendering();
       const wavBlob = audioBufferToWav(renderedBuffer);
       
       // Extract title from original ABC
       const titleMatch = abcNotation.match(/^T:(.*)$/m);
       const title = (titleMatch ? titleMatch[1].trim() : 'composition');
       
       const url = window.URL.createObjectURL(wavBlob);
       const a = document.createElement("a");
       a.href = url;
       const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.wav`;
       a.download = fileName;
       a.click();
       window.URL.revokeObjectURL(url);
     } catch (err) {
         console.error("WAV Export Error:", err);
         alert("Failed to generate WAV file. See console for details.");
     }
  }, [visualObj, abcNotation]);
  
  const handleDownloadMidi = useCallback(() => {
     if (visualObj) {
         const midi = abcjs.synth.getMidiFile(visualObj, { midiOutputType: 'binary' });
         const blob = new Blob([midi], { type: "audio/midi" });
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement("a");
         a.href = url;
         a.download = "music.mid";
         a.click();
         window.URL.revokeObjectURL(url);
     }
  }, [visualObj]);

  // Update progress bar automatically
  useEffect(() => {
    let interval: any;
    if (isPlaying && totalDuration > 0) {
      interval = setInterval(() => {
        setProgress(p => {
            if (p >= 1) return 1;
            const step = 0.1 / totalDuration * (tempo / 100);
            return Math.min(p + step, 1);
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, totalDuration, tempo]);

  if (!abcNotation) return null;

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Error Alert Bar */}
      {(renderError || audioError) && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 text-red-600 text-sm">
             <AlertCircle size={16} />
             <span>{renderError || audioError}</span>
          </div>
      )}

      {/* --- Modern Audio Control Bar --- */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm shrink-0 z-10 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4">
          
          {/* Group 1: Playback Controls */}
          <div className="flex items-center gap-3">
             <button
                onClick={togglePlay}
                disabled={!isLoaded || !!renderError}
                className={`group flex items-center justify-center w-11 h-11 rounded-xl transition-all shadow-sm ${
                  !isLoaded || !!renderError ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                  'bg-white border border-slate-200 hover:border-green-400 hover:shadow-green-100'
                }`}
                title={isPlaying ? "Pause" : "Play"}
             >
                {isPlaying ? (
                    <Pause className="w-6 h-6 text-slate-700 group-hover:text-green-600 transition-colors fill-current" />
                ) : (
                    <Play className="w-6 h-6 text-green-500 group-hover:scale-110 transition-transform ml-1 fill-current" />
                )}
             </button>

             <div className="flex bg-slate-100 rounded-lg p-1">
                <button 
                    onClick={handleRestart} 
                    disabled={!isLoaded} 
                    className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-slate-500 hover:text-indigo-600 transition-all disabled:opacity-50"
                    title="Restart"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
                <button 
                    onClick={toggleLoop} 
                    className={`w-9 h-9 flex items-center justify-center rounded-md transition-all ${isLooping ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}
                    title="Toggle Loop"
                >
                    <Repeat className="w-4 h-4" />
                </button>
             </div>
          </div>

          {/* Group 2: Progress & Time */}
          <div className="flex-grow flex items-center gap-4 min-w-[200px] order-last md:order-none w-full md:w-auto">
             <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
                <span className="font-mono text-xs font-semibold text-slate-600 min-w-[40px] text-right">
                    {formatTime(progress * totalDuration)}
                </span>
                <span className="text-slate-400 text-xs">/</span>
                <span className="font-mono text-xs font-semibold text-slate-400 min-w-[40px]">
                    {formatTime(totalDuration)}
                </span>
             </div>

             <div className="relative flex-grow h-8 flex items-center group">
                <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.001"
                    value={progress}
                    onChange={handleSeek}
                    disabled={!isLoaded}
                    className="modern-range"
                    style={{ '--range-progress': `${progress * 100}%` } as React.CSSProperties}
                />
             </div>
          </div>

          {/* Group 3: Tempo & Tools */}
          <div className="flex items-center gap-3 ml-auto md:ml-0">
             <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">BPM</span>
                <input 
                    type="range" 
                    min="10" 
                    max="200" 
                    step="10"
                    value={tempo}
                    onChange={handleTempoChange}
                    className="w-16 accent-indigo-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-600 w-8 text-right">{tempo}%</span>
             </div>

             <div className="h-6 w-px bg-slate-200 mx-1"></div>
             
             <button 
                onClick={handleDownloadWav} 
                disabled={!isLoaded}
                className="text-slate-400 hover:text-indigo-600 transition-colors p-2 disabled:opacity-50" 
                title="Export WAV"
             >
                 <FileAudio size={18} />
             </button>
             
             <button 
                onClick={handleDownloadMidi}
                disabled={!visualObj} 
                className="text-slate-400 hover:text-indigo-600 transition-colors p-2 disabled:opacity-50" 
                title="Export MIDI"
             >
                 <Settings2 size={18} />
             </button>
             
             <button 
                onClick={handlePrint}
                disabled={!visualObj} 
                className="text-slate-400 hover:text-indigo-600 transition-colors p-2 disabled:opacity-50" 
                title="Print Score"
             >
                 <Printer size={18} />
             </button>
          </div>

        </div>
      </div>

      <div id="audio" className="hidden"></div>

      {/* Score Area */}
      <div ref={containerRef} className="flex-grow overflow-auto p-4 md:p-8 bg-slate-50/50 relative scroll-smooth">
        <div ref={cardRef} className={`max-w-5xl mx-auto bg-white text-slate-900 shadow-xl shadow-slate-200/60 min-h-[600px] p-6 md:p-12 rounded-xl border border-slate-100 transition-opacity duration-200 ${renderError ? 'opacity-50' : 'opacity-100'}`}>
           <div ref={paperRef} id="paper" className="w-full"></div>
           {renderError && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <p className="bg-white/90 px-6 py-4 rounded-lg shadow-lg text-red-500 font-medium border border-red-100">
                       Waiting for valid notation...
                   </p>
               </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default ScoreRenderer;