export interface MusicState {
  prompt: string;
  abcNotation: string;
  isGenerating: boolean;
  error: string | null;
}

export interface ExamplePrompt {
  label: string;
  text: string;
}

// Extended type definition for abcjs
export declare module ABCJS {
  function renderAbc(
    output: HTMLElement | string,
    abc: string,
    params?: AbcVisualParams
  ): any[];

  interface AbcVisualParams {
    responsive?: "resize";
    add_classes?: boolean;
    paddingtop?: number;
    paddingbottom?: number;
    paddingright?: number;
    paddingleft?: number;
    staffwidth?: number;
    wrap?: { minSpacing: number; maxSpacing: number; preferred?: number };
  }

  namespace synth {
    function getMidiFile(visualObj: any, options?: any): any;

    class CreateSynth {
      init(params: { 
        visualObj: any; 
        audioContext?: AudioContext | OfflineAudioContext; 
        millisecondsPerMeasure?: number;
        options?: any;
      }): Promise<any>;
      prime(): Promise<any>;
    }

    class SynthController {
      load(selector: string | HTMLElement | null, cursorControl: any, options: any): Promise<void>;
      setTune(visualObj: any, userAction: boolean, audioParams?: any): Promise<any>;
      play(): void;
      pause(): void;
      restart(): void;
      seek(percent: number): void;
      setWarp(percent: number): void;
      disable(isDisabled: boolean): void;
    }
  }
}