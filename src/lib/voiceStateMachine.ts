// Standalone Voice State Machine — extracted from useVoiceAgent for testability
// Pure functions with zero React dependencies

import { VoiceState } from '../types';

export type StateAction =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'START_PROCESSING' }
  | { type: 'START_SPEAKING' }
  | { type: 'FINISH_SPEAKING' }
  | { type: 'INTERRUPT' }
  | { type: 'ERROR'; payload: string }
  | { type: 'RESET' }
  | { type: 'VAD_RESUME' };

export const STATE_TRANSITIONS: Record<VoiceState, StateAction['type'][]> = {
  idle: ['START_LISTENING', 'START_SPEAKING', 'ERROR', 'VAD_RESUME'],
  listening: ['STOP_LISTENING', 'START_PROCESSING', 'INTERRUPT', 'ERROR', 'RESET'],
  processing: ['START_SPEAKING', 'ERROR', 'RESET', 'START_LISTENING'],
  speaking: ['FINISH_SPEAKING', 'INTERRUPT', 'START_LISTENING', 'ERROR'],
  error: ['RESET', 'START_LISTENING', 'VAD_RESUME'],
};

export function voiceStateMachine(state: VoiceState, action: StateAction): VoiceState {
  const validTransitions = STATE_TRANSITIONS[state];

  if (!validTransitions.includes(action.type)) {
    console.warn(`[VoiceStateMachine] Invalid transition: ${state} -> ${action.type}`);
    return state;
  }

  switch (action.type) {
    case 'START_LISTENING': return 'listening';
    case 'STOP_LISTENING': return 'processing';
    case 'START_PROCESSING': return 'processing';
    case 'START_SPEAKING': return 'speaking';
    case 'FINISH_SPEAKING': return 'idle';
    case 'INTERRUPT': return 'idle';
    case 'ERROR': return 'error';
    case 'RESET': return 'idle';
    case 'VAD_RESUME': return 'listening';
    default: return state;
  }
}

export function isValidTransition(state: VoiceState, actionType: StateAction['type']): boolean {
  return STATE_TRANSITIONS[state].includes(actionType);
}

export function formatMicDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
