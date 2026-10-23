import './motion-tokens.css';
import './motion-engine.js';
import './motion-components.js';

export interface FluidMotionType {
  easeTable: Record<string, string>;
  cubicAt(curve: string, progress: number): number;
  setPerfLevel(level: 'full' | 'lite' | 'min'): void;
  setSpeed(multiplier: number): void;
  playPose(element: HTMLElement, pose: any, options?: any): Animation | null;
}

export interface FluidMotionComponentsType {
  freezeInner(node: HTMLElement, targetRect: { x: number; y: number; w: number; h: number }): void;
  clearMorph(node: HTMLElement): void;
  morphContainer(
    node: HTMLElement,
    currentRect: { x: number; y: number; w: number; h: number },
    targetRect: { x: number; y: number; w: number; h: number },
    options?: { collapse?: boolean; onFinish?: () => void; speedMultiplier?: number }
  ): void;
  syncSegPill(container: HTMLElement, animate?: boolean): void;
  flashButton(buttonEl: HTMLElement, accentHex?: string): void;
  bindHoldToConfirm(buttonNode: HTMLElement, holdMs: number, onComplete: () => void): void;
  playModal(
    root: HTMLElement,
    card: HTMLElement,
    scrim: HTMLElement,
    dir: 'in' | 'out',
    lastPointer?: { x: number; y: number },
    onFinish?: () => void
  ): void;
  playThemeSwitch(
    targetTheme: string,
    triggerType: 'ripple' | 'sweepTop' | 'colorOnly' | 'cross' | 'auto',
    pointerEvent?: PointerEvent | MouseEvent,
    onSwap?: () => void
  ): void;
}

declare global {
  interface Window {
    FluidMotion: FluidMotionType;
    FluidMotionComponents: FluidMotionComponentsType;
  }
}

export const FluidMotion: FluidMotionType = (window as any).FluidMotion;
export const FluidMotionComponents: FluidMotionComponentsType = (window as any).FluidMotionComponents;
