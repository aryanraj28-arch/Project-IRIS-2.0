# Mobile Voice Recognition Fix - Transcript Processing Issue

## Problem Identified 🔍

**Symptom**: On mobile PWA, voice recognition kept restarting immediately after receiving speech input, never giving time for command processing. It would listen → restart → listen → restart in a loop.

**Root Cause**: Mobile browsers fire the `onend` event immediately after `onresult`, causing auto-restart to trigger before the transcript was processed by the application.

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
- Wait 800ms for command processing
- Clear flag and manually restart recognition

**On Desktop:**
- No changes needed (continuous mode handles it)

### 3. Updated `onend` Handler
- Check `isProcessingTranscript` flag before auto-restart
- Skip auto-restart if transcript is being processed
- Let mobile-specific restart in `onresult` handle the timing

## Code Changes

### useVoiceCommands.ts

**Added processing flag:**
```typescript
const isProcessingTranscript = useRef(false); // Line 52
```

**Modified onresult (Lines 165-207):**
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
  
  // On mobile, restart after 800ms delay
  if (isMobileRef.current) {
    setTimeout(() => {
      isProcessingTranscript.current = false;
      if (!isStoppedManually.current && !isPaused.current) {
        recognitionRef.current?.start();
      }
    }, 800);
  }
}
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
User speaks → onresult fires → onend fires → auto-restart (50ms) → listening again
                    ↓
              Transcript lost (no processing time)
```

### After Fix (Mobile)
```
User speaks → onresult fires → stop recognition → process transcript → wait 800ms → restart
                                        ↓
                                  Command executed ✅
```

## Testing Instructions 📱

1. **Deploy to Render** (requires HTTPS for PWA)
2. **Install PWA on mobile device**
3. **Test voice commands:**
   - Say "describe the scene"
   - Watch for: Processing indicator should appear
   - Expected: Command executes, then recognition restarts
   - Confirm: No immediate restart loop

4. **Verify console logs:**
   ```
   Final transcript received: describe the scene
   Restarting recognition after processing transcript
   ```

## Key Parameters

- **Desktop restart delay**: 250ms
- **Mobile restart delay**: 500ms (onend auto-restart)
- **Mobile processing delay**: 800ms (after transcript processing)
- **Recognition continuous**: false on mobile, true on desktop
- **Max alternatives**: 3 on mobile for better accuracy

## Related Files

- `Project-IRIS-2.0/hooks/useVoiceCommands.ts` - Main fix
- `Project-IRIS-2.0/App.tsx` - Retry button UI
- `Project-IRIS-2.0/hooks/useWakeLock.ts` - Keep screen on
- `Project-IRIS-2.0/components/PermissionPrompt.tsx` - Permission UI

## Status: Ready for Testing 🚀

All changes committed and ready for mobile device testing via HTTPS PWA.
