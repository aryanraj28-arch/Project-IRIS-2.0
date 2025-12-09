# Mobile Voice Recognition Fix - Transcript Processing Issue

## Problem Identified 🔍

**Symptom**: On mobile PWA, voice recognition kept restarting immediately after receiving speech input, never giving time for command processing. It would listen → restart → listen → restart in a loop.

**Root Cause #1**: Mobile browsers fire the `onend` event immediately after `onresult`, causing auto-restart to trigger before the transcript was processed by the application.

**Root Cause #2**: The 800ms timeout was NOT sufficient for API calls to complete. Commands like "describe the scene" or "read text" can take 2-5 seconds to process, but recognition was restarting after only 800ms.

## Desktop vs Mobile Behavior

### Desktop (Working Correctly)
- Continuous mode: `recognition.continuous = true`
- Stays active until manually stopped
- Processes transcripts while continuing to listen
- `onend` only fires when stopped manually

### Mobile (Problem Behavior)
- Continuous mode: `recognition.continuous = false` (required for stability)
- `onresult` fires → `onend` fires immediately → auto-restart triggered
- No time for command processing → stuck in listen loop
- Transcript received but never processed

## Solution Implemented ✅

### 1. Added Processing Flag
```typescript
const isProcessingTranscript = useRef(false);
```

### 2. Enhanced `onresult` Handler
**On Mobile:**
- Set `isProcessingTranscript = true` when final result received
- Manually stop recognition to prevent auto-restart
- Process the transcript
- **DO NOT auto-restart** - wait for explicit signal from App

**On Desktop:**
- No changes needed (continuous mode handles it)

### 3. Added `resumeAfterProcessing()` Function
**Purpose**: Allows App.tsx to signal when command processing is ACTUALLY complete
**Called from**: `handleVoiceCommand` finally block (after API calls finish)
**Behavior**: Only restarts recognition on mobile after command processing completes

### 4. Updated `onend` Handler
- Check `isProcessingTranscript` flag before auto-restart
- Skip auto-restart if transcript is being processed
- Let App.tsx control restart timing via `resumeAfterProcessing()`

## Code Changes

### useVoiceCommands.ts

**Added processing flag:**
```typescript
const isProcessingTranscript = useRef(false); // Line 52
```

**Modified onresult (Lines 165-189):**
```typescript
if (lastResult.isFinal && transcript && onTranscriptRef.current) {
  console.log('Final transcript received:', transcript);
  
  // On mobile, set processing flag and stop recognition
  if (isMobileRef.current) {
    isProcessingTranscript.current = true;
    recognitionRef.current?.stop();
  }
  
  // Process the transcript
  onTranscriptRef.current(transcript, true, confidence);
  
  // On mobile, DO NOT auto-restart
  // Wait for explicit resumeAfterProcessing() call from App
}
```

**Added resumeAfterProcessing (Lines 343-365):**
```typescript
const resumeAfterProcessing = useCallback(() => {
  console.log('Resuming recognition after command processing complete');
  isProcessingTranscript.current = false;
  
  if (isMobileRef.current && !isStoppedManually.current && !isPaused.current) {
    setTimeout(() => {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.log('Recognition already starting, ignoring error');
      }
    }, 300);
  }
}, []);
```

**Modified onend (Lines 102-130):**
```typescript
// Don't restart if processing transcript
if (!isStoppedManually.current && !isPaused.current && !isProcessingTranscript.current) {
  // Auto-restart logic
}
```

## Flow Diagram

### Before Fix (Mobile)
```
User speaks → onresult fires → onend fires → auto-restart (800ms) → listening again
                    ↓                              ↑
              Command starts processing            |
                    ↓                              |
              API call takes 2-3 seconds          |
                    ↓                              |
              Recognition already restarted ❌ ----
              (Listening during processing - confusing state)
```

### After Fix (Mobile)
```
User speaks → onresult fires → stop recognition → process command → API call (2-5s)
                                        ↓                              ↓
                                  Interpreting...               Command executed ✅
                                                                       ↓
                                                          resumeAfterProcessing()
                                                                       ↓
                                                          Recognition restarts
                                                                       ↓
                                                          Ready for next command
```

## Testing Instructions 📱

### Deploy & Install
1. **Deploy to Render** (requires HTTPS for PWA)
2. **Install PWA on mobile device**
3. **Enable voice commands** (microphone button)

### Test Commands
**Command: "Describe the scene"**
- Expected behavior:
  1. You speak → Recognition stops
  2. See "Interpreting: describe the scene..."
  3. API call happens (2-3 seconds)
  4. Response is spoken
  5. Recognition restarts automatically
  6. Ready for next command ✅

**Command: "What's in front of me"**
- Same flow as above
- Should NOT restart during API call
- Should restart AFTER response

**Command: "Stop"**
- Stops all activity
- Resumes recognition for next command

### Verify Console Logs (Chrome Remote Debugging)

**Expected log sequence:**
```
[Voice Command] Received: "describe the scene", isFinal: true, isBusy: false
[Voice Command] Processing command: describe the scene
Final transcript received: describe the scene
Speech recognition ended, processing: true
// API call happens here (2-5 seconds)
[Voice Command] Command processing complete, resuming recognition
Resuming recognition after command processing complete
Speech recognition started
```

**What NOT to see:**
```
❌ Speech recognition started (while still processing command)
❌ Restarting recognition after processing transcript (old 800ms timeout)
```

### Debug Mobile Issues

1. **Connect phone via USB**
2. **Chrome DevTools → Remote Devices**
3. **Inspect PWA**
4. **Watch Console tab** for timing logs
5. **Verify**: Recognition starts AFTER "Command processing complete" log

## Key Parameters

- **Desktop restart delay**: 250ms (auto-restart from onend)
- **Mobile restart delay**: **Manual via resumeAfterProcessing()** (no timeout)
- **Mobile resume delay**: 300ms (after processing flag cleared)
- **Recognition continuous**: false on mobile, true on desktop
- **Max alternatives**: 3 on mobile for better accuracy

## Changes in App.tsx

**Added console logging:**
```typescript
console.log(`[Voice Command] Received: "${transcript}", isFinal: ${isFinal}, isBusy: ${isBusy}`);
console.log('[Voice Command] Processing command:', transcript);
console.log('[Voice Command] Command processing complete, resuming recognition');
```

**Added resumeAfterProcessing() call in finally block:**
```typescript
} finally {
  setAppState(currentState => {
    if (currentState === AppState.INTERPRETING_COMMAND || currentState === AppState.ANALYZING) {
      return preCommandState === AppState.MANAGING_ITEMS ? AppState.MANAGING_ITEMS : AppState.IDLE;
    }
    return currentState;
  });
  
  // Resume voice recognition after command processing (important for mobile)
  console.log('[Voice Command] Command processing complete, resuming recognition');
  resumeAfterProcessing();
}
```

**Also calls resumeAfterProcessing() after stop commands:**
```typescript
if (stopWords.some(word => transcript.toLowerCase().includes(word))) {
  // ... stop logic ...
  resumeAfterProcessing(); // Resume for next command
  return;
}
```

## Related Files

- `Project-IRIS-2.0/hooks/useVoiceCommands.ts` - Main fix
- `Project-IRIS-2.0/App.tsx` - Retry button UI
- `Project-IRIS-2.0/hooks/useWakeLock.ts` - Keep screen on
- `Project-IRIS-2.0/components/PermissionPrompt.tsx` - Permission UI

## Status: Ready for Testing 🚀

All changes committed and ready for mobile device testing via HTTPS PWA.
