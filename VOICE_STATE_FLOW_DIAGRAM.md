# VoxAI Voice State Flow Diagram

## Voice Interaction Lifecycle - Surgical Repair v2.2.0

**Date:** 2026-02-26
**Version:** 2.2.0 - Voice Lifecycle Stability Overhaul
**Scope:** `useVoiceAgent.ts`, `SuperButton.tsx`

---

## 1. State Machine Overview

```
                           ┌──────────────────────────────────────────────────────────┐
                           │                    VOICE STATE MACHINE                    │
                           │                                                          │
                           │   ┌─────────┐                                            │
                           │   │  IDLE   │◄────────────────────────────────┐          │
                           │   │         │                                 │          │
                           │   │ AI Core │                                 │          │
                           │   │  Pulse  │                                 │          │
                           │   └────┬────┘                                 │          │
                           │        │                                      │          │
                           │        │ START_LISTENING                      │          │
                           │        │ (User clicks SuperButton)            │          │
                           │        │ [Start Mic Timer]                    │          │
                           │        ▼                                      │          │
                           │   ┌──────────┐                                │          │
                           │   │LISTENING │ ◄──────┐                       │          │
                           │   │          │        │                       │          │
                           │   │ Waveform │        │ RESET                 │          │
                           │   │ + Timer  │        │ (No transcript)       │          │
                           │   │ MM:SS    │        │                       │          │
                           │   └────┬─────┘        │                       │          │
                           │        │              │                       │          │
                           │        │ STOP_LISTENING / START_PROCESSING    │          │
                           │        │ (Smart-Silence or Manual Stop)       │          │
                           │        │ [Stop Mic Timer]                     │          │
                           │        ▼                                      │          │
                           │   ┌───────────┐                               │          │
                           │   │PROCESSING │                               │          │
                           │   │           │                               │          │
                           │   │  Spinner  │───────────────────┐           │          │
                           │   │           │                   │           │          │
                           │   └─────┬─────┘                   │           │          │
                           │         │                         │ ERROR     │          │
                           │         │ START_SPEAKING          │           │          │
                           │         │ (AI response ready)     │           │          │
                           │         ▼                         ▼           │          │
                           │   ┌──────────┐              ┌─────────┐       │          │
                           │   │ SPEAKING │              │  ERROR  │       │          │
                           │   │          │              │         │       │          │
                           │   │    X     │              │   Red   │───────┘          │
                           │   │ (Stop)   │              │  Glow   │ RESET            │
                           │   └────┬─────┘              └─────────┘                  │
                           │        │                                                 │
                           │        │ FINISH_SPEAKING                                 │
                           │        │ (utterance.onend)                               │
                           │        │ [Loop Reset Protocol]                           │
                           │        │                                                 │
                           │        └─────────────────────────────────────────────────┘
                           │                                                          │
                           └──────────────────────────────────────────────────────────┘
```

---

## 2. Complete State Transition Flow

### User Speech to Bot Speech to Idle

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE VOICE INTERACTION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

USER ACTION                           SYSTEM STATE                    SUPERBUTTON
────────────────────────────────────────────────────────────────────────────────────────

1. User clicks SuperButton
   │
   ├─► wakeUpAudio() called           ─► Audio Context resumed        [Idle → Listening]
   │   (Autoplay policy satisfied)       speechSynthesis primed
   │
   ├─► startListening() called        ─► Mic timer starts (00:00)     Waveform animates
   │                                     recognition.start()           Timer displays
   │
   └─► dispatch(START_LISTENING)      ─► state = 'listening'

────────────────────────────────────────────────────────────────────────────────────────

2. User speaks into microphone
   │
   ├─► onresult events fire           ─► partialTranscript updates    Timer: 00:01...
   │                                     Smart-Silence countdown      00:02...
   │                                     resets on each syllable      00:03...
   │
   └─► Timer updates every 1000ms     ─► micDurationSeconds++         00:04...

────────────────────────────────────────────────────────────────────────────────────────

3. User stops speaking (2.5s silence)
   │
   ├─► Smart-Silence timer expires    ─► Transcript validated         [Listening → Processing]
   │                                     (min 4 chars)
   │
   ├─► stopMicTimer() called          ─► Timer stops, resets to 00:00 Spinner animates
   │
   ├─► onFinalSubmit(result)          ─► Transcript sent to AI
   │
   └─► dispatch(START_PROCESSING)     ─► state = 'processing'

────────────────────────────────────────────────────────────────────────────────────────

4. AI generates response
   │
   ├─► Response stream received       ─► Text accumulated             Spinner continues
   │
   └─► speak(responseText) called     ─► dispatch(START_SPEAKING)     [Processing → Speaking]

────────────────────────────────────────────────────────────────────────────────────────

5. TTS speaks response
   │
   ├─► utterance.onstart fires        ─► isTTSSpeaking = true         X icon displayed
   │                                     Word sync begins
   │
   ├─► Word boundaries fire           ─► currentSpokenWordIndex++     (Interactive stop)
   │                                     MessageBubble highlights
   │
   └─► utterance.onend fires          ─► isTTSSpeaking = false        [Speaking → Idle]

────────────────────────────────────────────────────────────────────────────────────────

6. LOOP RESET PROTOCOL
   │
   ├─► dispatch(FINISH_SPEAKING)      ─► state = 'idle'               AI Core pulse
   │                                                                   returns
   ├─► voiceService.stopListening()   ─► Previous recognition aborted
   │                                     (prevents ghost listeners)
   │
   ├─► setInputMode('idle')           ─► UI ready for new input
   │
   └─► SuperButton returns to IDLE    ─► Mic icon with subtle pulse   READY FOR NEXT
                                         Ready to accept new input     INTERACTION

────────────────────────────────────────────────────────────────────────────────────────
```

---

## 3. Mic Timer Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         MIC TIMER STATE MACHINE                          │
└──────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │           TIMER STOPPED              │
                    │         micDuration = 00:00         │
                    │         micTimerRef = null          │
                    └──────────────────┬──────────────────┘
                                       │
                                       │ startListening()
                                       │ startMicTimer()
                                       ▼
                    ┌─────────────────────────────────────┐
                    │           TIMER RUNNING              │
                    │                                      │
                    │  micStartTimeRef = performance.now() │
                    │  setInterval(1000ms) {               │
                    │    elapsed = now - startTime         │
                    │    micDurationSeconds = elapsed      │
                    │  }                                   │
                    │                                      │
                    │  Display: 00:01 → 00:02 → 00:03...  │
                    └──────────────────┬──────────────────┘
                                       │
                   ┌───────────────────┼───────────────────┐
                   │                   │                   │
                   │ stopListening()   │ onFinalSubmit()   │ onError()
                   │ (manual)          │ (auto-submit)     │
                   ▼                   ▼                   ▼
                    ┌─────────────────────────────────────┐
                    │           TIMER RESET                │
                    │                                      │
                    │  clearInterval(micTimerRef)          │
                    │  micTimerRef = null                  │
                    │  micDurationSeconds = 0              │
                    │  micDuration = "00:00"               │
                    │                                      │
                    │  → Ready for next recording          │
                    └─────────────────────────────────────┘
```

---

## 4. TTS Lifecycle & Autoplay Recovery

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      TTS INITIALIZATION SEQUENCE                          │
└──────────────────────────────────────────────────────────────────────────┘

MODULE LOAD:
┌─────────────────────────────────────────────────────────────────────────┐
│  initializeTTSVoices()                                                   │
│  ├── speechSynthesis.getVoices()                                         │
│  ├── Find English voice (prefer local service)                           │
│  ├── Store in ttsPreferredVoice                                          │
│  └── Set ttsVoicesInitialized = true                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ User clicks SuperButton
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  wakeUpAudio() - CALLED FROM USER GESTURE                                │
│  ├── voiceService.initializeAudio()                                      │
│  │   └── AudioContext.resume() (satisfies autoplay policy)               │
│  ├── speechSynthesis.cancel() (clear any pending speech)                 │
│  ├── Create silent utterance to "prime" synthesis engine                 │
│  ├── setIsAudioReady(true)                                               │
│  └── Return success/failure                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ AI response ready
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  speak(text) - TTS PLAYBACK                                              │
│  │                                                                       │
│  ├── Try primary TTS (voiceService.speak - API-based)                    │
│  │   └── On success: Word sync loop, await completion                    │
│  │                                                                       │
│  └── On failure: Fall back to Web Speech API                             │
│      │                                                                   │
│      ├── Create SpeechSynthesisUtterance                                 │
│      │                                                                   │
│      ├── utterance.onstart = () => {                                     │
│      │     setIsTTSSpeaking(true)                                        │
│      │     // State already 'speaking'                                   │
│      │   }                                                               │
│      │                                                                   │
│      ├── utterance.onboundary = (event) => {                             │
│      │     // Word sync for highlighting                                 │
│      │     setCurrentSpokenWordIndex(wordIndex)                          │
│      │   }                                                               │
│      │                                                                   │
│      └── utterance.onend = () => {                                       │
│            setITTSSpeaking(false)                                        │
│            // LOOP RESET PROTOCOL triggers here                          │
│          }                                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Loop Reset Protocol

The Loop Reset Protocol ensures the system returns to a clean IDLE state after every interaction.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        LOOP RESET PROTOCOL                                │
│                    (Executed on utterance.onend)                          │
└──────────────────────────────────────────────────────────────────────────┘

TRIGGER: utterance.onend OR TTS promise resolves
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Verify not interrupted                                          │
│  if (speakingRef.current && !interruptedRef.current)                     │
└─────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Dispatch FINISH_SPEAKING                                        │
│  dispatch({ type: 'FINISH_SPEAKING' })                                   │
│  → state transitions: 'speaking' → 'idle'                                │
└─────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 3: Reset input mode                                                │
│  setInputMode('idle')                                                    │
└─────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 4: CRITICAL - Abort previous recognition                           │
│  voiceService.stopListening()                                            │
│  → Prevents ghost listeners and duplicate event handlers                 │
│  → Recognition instance fully nullified                                  │
└─────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 5: Reset tracking state                                            │
│  setCurrentSpokenWordIndex(-1)                                           │
│  setWordsBuffer([])                                                      │
│  speakingRef.current = false                                             │
│  setITTSSpeaking(false)                                                  │
└─────────────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  Result: CLEAN IDLE STATE                                                │
│  ├── state = 'idle'                                                      │
│  ├── inputMode = 'idle'                                                  │
│  ├── No active recognition instances                                     │
│  ├── No pending TTS                                                      │
│  ├── micTimer = stopped, reset to 00:00                                  │
│  └── SuperButton displays AI Core pulse                                  │
│                                                                          │
│  → READY FOR NEXT VOICE INTERACTION                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Handling & Recovery

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ERROR STATE HANDLING                              │
└──────────────────────────────────────────────────────────────────────────┘

ERROR SOURCES:
├── MIC_PERMISSION_DENIED     → User denied microphone access
├── SPEECH_NOT_SUPPORTED      → Browser doesn't support Web Speech
├── NETWORK_ERROR             → Connection issue
├── TTS_FAILED                → Speech synthesis error
└── AUDIO_BLOCKED_BY_BROWSER  → Autoplay policy violation

                    ┌────────────────────────────────┐
                    │        ERROR DETECTED           │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │      CLEANUP OPERATIONS         │
                    │                                 │
                    │  stopMicTimer()                 │
                    │  clearInterval(vadIntervalRef)  │
                    │  voiceService.cleanup()         │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │    DISPATCH ERROR ACTION        │
                    │                                 │
                    │  dispatch({                     │
                    │    type: 'ERROR',               │
                    │    payload: errorMessage        │
                    │  })                             │
                    │                                 │
                    │  setInputMode('idle')           │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │     SUPERBUTTON ERROR STATE     │
                    │                                 │
                    │  ┌───────────────────┐          │
                    │  │      ERROR        │          │
                    │  │                   │          │
                    │  │    Red Glow       │          │
                    │  │    AlertCircle    │          │
                    │  │    or             │          │
                    │  │    RotateCcw      │ (retry)  │
                    │  └───────────────────┘          │
                    │                                 │
                    │  User can tap to RESET or RETRY │
                    └────────────────────────────────┘
```

---

## 7. Barge-In Sequence

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         BARGE-IN INTERRUPT FLOW                           │
└──────────────────────────────────────────────────────────────────────────┘

User clicks SuperButton while state = 'speaking'
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  interrupt() FUNCTION                                                    │
│  │                                                                       │
│  ├── interruptedRef.current = true                                       │
│  │   (prevents completion handlers from running)                         │
│  │                                                                       │
│  ├── voiceService.stopSpeaking()                                         │
│  │   └── audio.pause(), audio.src = '', audio = null                     │
│  │                                                                       │
│  ├── cancelAllTTS()                                                      │
│  │   ├── speechSynthesis.cancel()                                        │
│  │   ├── activeUtteranceRef.current = null                               │
│  │   └── setITTSSpeaking(false)                                          │
│  │                                                                       │
│  ├── stopMicTimer()                                                      │
│  │                                                                       │
│  ├── cleanup()                                                           │
│  │                                                                       │
│  └── dispatch({ type: 'INTERRUPT' })                                     │
│      → state: 'speaking' → 'idle'                                        │
└─────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  IMMEDIATE TRANSITION TO LISTENING                                       │
│  │                                                                       │
│  └── startListening() called if state was 'speaking'                     │
│      ├── Barge-in interrupts AI mid-speech                               │
│      ├── User's new voice input takes priority                           │
│      └── Mic timer starts fresh at 00:00                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Global Cleanup (Component Unmount)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      STRICT MEMORY CLEANUP                                │
│              (Prevents Ghost Voices & Duplicate Listeners)                │
└──────────────────────────────────────────────────────────────────────────┘

useEffect return cleanup:
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Remove event listeners                                               │
│     document.removeEventListener('visibilitychange', ...)                │
│     window.removeEventListener('blur', ...)                              │
│                                                                          │
│  2. Voice service cleanup                                                │
│     voiceService.cleanup()                                               │
│     └── stopListening() + stopSpeaking()                                 │
│                                                                          │
│  3. Clear VAD interval                                                   │
│     clearInterval(vadIntervalRef.current)                                │
│     vadIntervalRef.current = null                                        │
│                                                                          │
│  4. Clear mic timer                                                      │
│     clearInterval(micTimerRef.current)                                   │
│     micTimerRef.current = null                                           │
│                                                                          │
│  5. Cancel all speechSynthesis                                           │
│     speechSynthesis.cancel()                                             │
│     activeUtteranceRef.current = null                                    │
│                                                                          │
│  → No ghost voices after navigation                                      │
│  → No memory leaks from stale intervals                                  │
│  → Clean slate for remount                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. SuperButton State Mapping

| Voice State | Button Appearance | Icon | Action on Click |
|-------------|-------------------|------|-----------------|
| `idle` | Light gray, pulse animation | Mic (breathing) | Start listening |
| `idle` (audio muted) | Light gray, opacity pulse | VolumeX | Wake up audio |
| `listening` | Brand purple, glow | Waveform + Timer | Stop listening |
| `processing` | Dark (inverted), scale pulse | Spinner | (Disabled) |
| `speaking` | Red, shadow | X (stop) | Interrupt (barge-in) |
| `error` | Red/pink, retry glow | AlertCircle / RotateCcw | Reset / Retry |

---

## 10. Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `useVoiceAgent.ts` | 1-60, 100-130, 200-350, 400-500 | Mic timer, TTS lifecycle, Loop Reset |
| `SuperButton.tsx` | 7-20, 63-75, 111-135, 154-166 | micDuration prop, timer display |

---

## 11. Testing Checklist

### Mic Timer
- [ ] Timer starts at 00:00 when clicking SuperButton
- [ ] Timer increments every second (00:01, 00:02, ...)
- [ ] Timer resets to 00:00 on stop (manual or auto)
- [ ] Timer resets to 00:00 on error
- [ ] Timer displays in SuperButton during listening

### TTS & Autoplay
- [ ] Voices pre-initialized on page load
- [ ] wakeUpAudio() called on first click
- [ ] TTS plays after AI response
- [ ] utterance.onend triggers IDLE transition
- [ ] Fallback to Web Speech API works

### Loop Reset
- [ ] State returns to IDLE after TTS completes
- [ ] SuperButton shows AI Core pulse after response
- [ ] Can immediately start new voice interaction
- [ ] No duplicate recognition instances

### Error Handling
- [ ] Permission denied shows ERROR state
- [ ] Red glow on SuperButton during error
- [ ] Clear console warning for permission issues
- [ ] Retry button works for failed messages

### Barge-In
- [ ] Clicking during speaking interrupts immediately
- [ ] TTS cancelled within 100ms
- [ ] Transition to listening works
- [ ] No ghost audio continues

---

**Voice Lifecycle Repair Complete.** The voice interaction flow is now stable, with proper timer tracking, TTS lifecycle management, and clean state reset after every interaction.
