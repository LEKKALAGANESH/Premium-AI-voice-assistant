// Type augmentation for Web Speech API gaps in TypeScript's lib.dom
// Fixes: Property 'resultIndex' does not exist on type 'SpeechRecognitionEvent'

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
}
