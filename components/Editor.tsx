import React from 'react';

interface EditorProps {
  code: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const Editor: React.FC<EditorProps> = ({ code, onChange, readOnly = false }) => {
  // Simple line counting for visual effect
  const lineCount = code.split('\n').length;
  const lines = Array.from({ length: Math.max(lineCount, 20) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-slate-300 relative group">
      <div className="flex-grow flex overflow-hidden relative font-mono text-sm">
        {/* Line Numbers */}
        <div className="hidden sm:flex flex-col items-end px-3 py-4 bg-[#1e1e1e] border-r border-slate-800 text-slate-600 select-none min-w-[3rem] text-right">
          {lines.map((line) => (
            <div key={line} className="leading-6 h-6">{line}</div>
          ))}
        </div>
        
        {/* Text Area */}
        <textarea
          className="flex-grow w-full h-full bg-[#1e1e1e] text-[#d4d4d4] p-4 leading-6 resize-none focus:outline-none focus:ring-0 selection:bg-indigo-500/30"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder="% ABC Notation..."
          readOnly={readOnly}
          style={{ tabSize: 2 }}
        />
        
        {/* Floating Label */}
        <div className="absolute top-2 right-4 text-xs font-medium text-slate-500 bg-slate-800/50 px-2 py-1 rounded pointer-events-none uppercase tracking-wider">
          ABC Editor
        </div>
      </div>
    </div>
  );
};

export default Editor;