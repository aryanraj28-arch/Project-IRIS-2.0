import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCamera } from './hooks/useCamera';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { useVoiceCommands } from './hooks/useVoiceCommands';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useAudioVisualizer } from './hooks/useAudioVisualizer';
import { useWakeLock } from './hooks/useWakeLock';
import { useAuthStore } from './src/store/authStore';
import * as personalDB from './services/personalDB';
import { describeScene, readTextFromImage, identifyPeople, checkForHazards, analyzeTerrain, getQuickFrameDescription, findObject, askFollowUpQuestion, getHelp, interpretCommand, askGemini } from './services/geminiService';
import { CameraFeed } from './components/CameraFeed';
import { Controls, ActionType } from './components/Controls';
import { Spinner } from './components/Spinner';
import { MicrophoneIcon, UserGroupIcon } from './components/Icons';
import { ItemManager } from './components/ItemManager';
import { AudioVisualizer } from './components/AudioVisualizer';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PermissionPrompt } from './components/PermissionPrompt';
import { AppState, GeminiContent } from './types';

const App: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [personalItems, setPersonalItems] = useState<personalDB.PersonalItem[]>([]);
  const [lastResponse, setLastResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [findingItemName, setFindingItemName] = useState<string | null>(null);
  const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false);
  const [language, setLanguage] = useState<'en-US' | 'hi-IN'>('en-US');

  const [lastAnalyzedImage, setLastAnalyzedImage] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<GeminiContent[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isFindingActive = useRef(false);
  const isLiveActive = useRef(false);

  const { isCameraReady, error: cameraError, stream } = useCamera(videoRef);
  const { speak, cancel, isSpeaking } = useTextToSpeech(language);
  const { isListening: isListeningForInput, listen: listenForInput } = useSpeechToText();
  const { volume, start: startVisualizer, stop: stopVisualizer } = useAudioVisualizer(stream);
  const { isListening, error: voiceError, startListening, stopListening, pauseListening, resumeListening, resetError, resumeAfterProcessing } = useVoiceCommands({ onTranscript: (t, isFinal) => handleVoiceCommand(t, isFinal), language });
  
  // Keep screen awake when voice commands are active (important for mobile PWA)
  useWakeLock(isVoiceCommandActive);

  useEffect(() => {
    setPersonalItems(personalDB.getItems());
  }, []);

  useEffect(() => {
    if (!isVoiceCommandActive) return;

    if (isSpeaking) {
      pauseListening();
    } else {
      resumeListening();
    }
  }, [isSpeaking, isVoiceCommandActive, pauseListening, resumeListening]);
  
  const stopLiveCommentary = useCallback(() => {
    if (isLiveActive.current) {
      isLiveActive.current = false;
      setIsLive(false);
      setAppState(AppState.IDLE);
      cancel();
      setLastResponse("Live commentary stopped.");
    }
  }, [cancel]);
  
  const stopObjectFinder = useCallback(() => {
    if (isFindingActive.current) {
      isFindingActive.current = false;
      setFindingItemName(null);
      setAppState(AppState.IDLE);
      cancel();
      setLastResponse("Stopped finding item.");
    }
  }, [cancel]);

  // FIX: Moved `handleSaveItem` and its dependency `captureFrame` before `handleAction` to resolve a "used before its declaration" error.
  const captureFrame = useCallback(() => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 1024;
    const MAX_HEIGHT = 576;
    let { videoWidth: width, videoHeight: height } = video;

    if (width > height) {
      if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width = Math.round(width * (MAX_HEIGHT / height));
        height = MAX_HEIGHT;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const handleSaveItem = useCallback(async () => {
    pauseListening();
    setAppState(AppState.SAVING_ITEM_LISTEN);
    setError(null);
    cancel();
    const promptText = "What should I call this item?";
    setLastResponse(promptText);
    speak(promptText);

    try {
        const name = await listenForInput();
        setAppState(AppState.ANALYZING);
        setLastResponse(`Saving as "${name}"...`);
        const imageData = captureFrame();
        if (!imageData) throw new Error("Could not capture image.");
        personalDB.saveItem({ name, imageData });
        setPersonalItems(personalDB.getItems()); // Re-fetch the full list
        speak(`Okay, I've saved this as ${name}.`);
    } catch (err) {
        const errorMessage = typeof err === 'string' ? err : 'Could not hear you clearly.';
        setError(`Save failed: ${errorMessage}`);
        speak(`Sorry, I couldn't save that.`);
    } finally {
        setAppState(AppState.IDLE);
        if(isVoiceCommandActive) resumeListening();
    }
  }, [cancel, speak, listenForInput, pauseListening, resumeListening, captureFrame, isVoiceCommandActive]);


  const handleAction = useCallback(async (action: ActionType, payload?: any) => {
    // Universal "stop" functionality for any new action
    if (isLive) stopLiveCommentary();
    if (isFindingActive.current) stopObjectFinder();
    if (action !== ActionType.ASK_QUESTION) {
      setConversationHistory([]);
      setLastAnalyzedImage(null);
    }
    
    const actionMap: { [key in ActionType]?: () => Promise<void> } = {
      [ActionType.DESCRIBE_SCENE]: () => processAction(async (img) => describeScene(img, personalItems), true),
      [ActionType.READ_TEXT]: () => processAction(async (img) => readTextFromImage(img)),
      [ActionType.IDENTIFY_PEOPLE]: () => processAction(async (img) => identifyPeople(img, personalItems), true),
      [ActionType.CHECK_HAZARDS]: () => processAction(async (img) => checkForHazards(img)),
      [ActionType.ANALYZE_TERRAIN]: () => processTerrainAction(),
      [ActionType.SAVE_ITEM]: handleSaveItem,
      [ActionType.LIVE_COMMENTARY]: () => {
        if (isLive) stopLiveCommentary(); else runLiveCommentary();
        return Promise.resolve();
      },
      [ActionType.FIND_ITEM]: () => {
        const itemName = payload?.itemName || '';
        if (itemName) runObjectFinder(itemName);
        return Promise.resolve();
      },
      [ActionType.MANAGE_ITEMS]: () => {
        setAppState(AppState.MANAGING_ITEMS);
        const itemNames = personalItems.map(i => i.name).join(', ');
        const message = personalItems.length > 0 ? `Here are your saved items: ${itemNames}. You can say 'delete' followed by the name.` : "You have no saved items.";
        setLastResponse(message);
        speak(message);
        return Promise.resolve();
      },
      [ActionType.HELP]: () => {
        const helpText = getHelp();
        setLastResponse(helpText);
        speak(helpText);
        return Promise.resolve();
      },
      [ActionType.ASK_QUESTION]: handleFollowUpQuestion,
      [ActionType.ASK_GEMINI]: () => handleAskGemini(payload?.query),
      [ActionType.DELETE_ITEM]: () => {
        if (appState === AppState.MANAGING_ITEMS && payload?.itemName) {
            handleDeleteItem(payload.itemName);
        }
        return Promise.resolve();
      },
      [ActionType.CLOSE_MANAGEMENT]: () => {
        if (appState === AppState.MANAGING_ITEMS) {
            setAppState(AppState.IDLE);
            setLastResponse('Closed item management.');
            cancel();
        }
        return Promise.resolve();
      },
      [ActionType.STOP]: () => {
        // Handled outside for immediate response
        return Promise.resolve();
      },
      [ActionType.UNKNOWN]: () => {
        // Handled in handleVoiceCommand for a more direct response
        return Promise.resolve();
      }
    };
    
    const func = actionMap[action];
    if (func) await func();

  }, [isLive, personalItems, appState, conversationHistory, lastAnalyzedImage, stopLiveCommentary, stopObjectFinder, speak, handleSaveItem]);

  const isBusy = [
    AppState.ANALYZING,
    AppState.SAVING_ITEM_LISTEN,
    AppState.FINDING_ITEM,
    AppState.INTERPRETING_COMMAND,
    AppState.LIVE_COMMENTARY,
  ].includes(appState);
  
  const handleAskGemini = async (query?: string) => {
    if (!query) {
      speak("What is your question?");
      try {
        query = await listenForInput();
      } catch (err) {
        setError("Could not hear your question.");
        speak("Sorry, I didn't catch that.");
        return;
      }
    }

    setAppState(AppState.ANALYZING);
    setLastResponse(`Thinking about: "${query}"...`);
    try {
      const response = await askGemini(query);
      setLastResponse(response);
      speak(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      speak(`Error: ${errorMessage}`);
    } finally {
      setAppState(AppState.IDLE);
    }
  };

  const handleVoiceCommand = async (transcript: string, isFinal: boolean) => {
    console.log(`[Voice Command] Received: "${transcript}", isFinal: ${isFinal}, isBusy: ${isBusy}`);
    
    // Universal stop check should ALWAYS be first, ignoring busy state.
    const stopWords = ['stop', 'cancel', 'be quiet', 'enough', "that's enough"];
    if (stopWords.some(word => transcript.toLowerCase().includes(word))) {
        console.log('[Voice Command] Stop command detected');
        cancel();
        stopLiveCommentary();
        stopObjectFinder();
        setAppState(AppState.IDLE);
        const stopMessage = "Okay, stopped.";
        setLastResponse(stopMessage);
        speak(stopMessage);
        resumeAfterProcessing(); // Resume for next command
        return;
    }

    if (isBusy || !isFinal) {
      console.log('[Voice Command] Skipping - busy or not final');
      return;
    }

    console.log('[Voice Command] Processing command:', transcript);
    const preCommandState = appState;
    setAppState(AppState.INTERPRETING_COMMAND);
    setLastResponse(`Interpreting: "${transcript}"...`);
    setError(null);

    try {
        const personalItemNames = personalItems.map(i => i.name);
        const result = await interpretCommand(transcript, personalItemNames, appState);

        if (result && result.action) {
             if (result.action === ActionType.UNKNOWN) {
                // If the command is unknown, treat it as a general query to Gemini
                await handleAskGemini(transcript);
                return;
            }
            // STOP is handled by the pre-emptive check, but we keep this as a fallback.
            if (result.action === ActionType.STOP) {
                return;
            }
            await handleAction(result.action, result.payload);
        } else {
            throw new Error("Could not understand the command.");
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Could not understand your command.';
        setError(errorMessage);
        speak(`Sorry, ${errorMessage}`);
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
  };
  
  const toggleVoiceCommands = () => {
    if (isVoiceCommandActive) {
      stopListening();
      stopVisualizer();
      setIsVoiceCommandActive(false);
      setLastResponse("Voice commands paused. Click 'Start Listening' to resume.");
    } else {
      startListening();
      startVisualizer();
      setIsVoiceCommandActive(true);
      setError(null);
      setLastResponse("Voice commands active. Say a command like 'describe scene' or 'help'.");
    }
  };

  const processTerrainAction = async () => {
    if (appState === AppState.ANALYZING || !isCameraReady) return;
    
    cancel();
    setAppState(AppState.ANALYZING);
    setError(null);
    setLastResponse('Analyzing terrain...');

    const imageData = captureFrame();
    if (!imageData) {
      setError('Could not capture frame from camera.');
      setAppState(AppState.IDLE);
      return;
    }

    try {
      const terrainDescription = await analyzeTerrain(imageData);
      setLastResponse(terrainDescription);
      speak(terrainDescription);
      setAppState(AppState.IDLE);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      speak(`Error: ${errorMessage}`);
      setAppState(AppState.IDLE);
    }
  };

  const processAction = async (
    apiCall: (imageData: string) => Promise<{ text: string; history: GeminiContent[] }>,
    allowFollowUp = false
  ) => {
    if (appState === AppState.ANALYZING || !isCameraReady) return;
    
    cancel();
    setAppState(AppState.ANALYZING);
    setError(null);
    setLastResponse('');

    const imageData = captureFrame();
    if (!imageData) {
      setError('Could not capture frame from camera.');
      setAppState(AppState.IDLE);
      return;
    }

    try {
      const { text, history } = await apiCall(imageData);
      setLastResponse(text);
      speak(text);
      if (allowFollowUp) {
        setLastAnalyzedImage(imageData);
        setConversationHistory(history);
        setAppState(AppState.AWAITING_FOLLOWUP);
      } else {
        setAppState(AppState.IDLE);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      speak(`Error: ${errorMessage}`);
      setAppState(AppState.IDLE);
    }
  };
  
  async function handleFollowUpQuestion() {
    if (appState !== AppState.AWAITING_FOLLOWUP && appState !== AppState.IDLE) return;
    
    if (!lastAnalyzedImage) {
        speak("Please describe a scene first before asking a question.");
        return;
    }
    
    pauseListening();
    cancel();
    const promptText = "What's your question?";
    setLastResponse(promptText);
    speak(promptText);

    try {
        const question = await listenForInput();
        setAppState(AppState.ANALYZING);
        setLastResponse(`Thinking about: "${question}"...`);
        
        const { text, history } = await askFollowUpQuestion(lastAnalyzedImage, conversationHistory, question);
        
        setLastResponse(text);
        speak(text);
        setConversationHistory(history);
        setAppState(AppState.AWAITING_FOLLOWUP);
    } catch (err) {
        const errorMessage = typeof err === 'string' ? err : 'Could not hear you clearly.';
        setError(`Question failed: ${errorMessage}`);
        speak(`Sorry, I couldn't get that. Please try again.`);
        setAppState(AppState.AWAITING_FOLLOWUP);
    } finally {
        if (isVoiceCommandActive) resumeListening();
    }
  }

  const runLiveCommentary = useCallback(async () => {
    if (isLiveActive.current) return;

    isLiveActive.current = true;
    setIsLive(true);
    setAppState(AppState.LIVE_COMMENTARY);
    const startMessage = "Starting live commentary. Say 'stop' to exit.";
    setLastResponse(startMessage);
    speak(startMessage);

    // Main loop for live commentary
    while (isLiveActive.current) {
        const imageData = captureFrame();
        // If loop was stopped while capturing, exit
        if (!isLiveActive.current) break;

        if (imageData) {
            try {
                const description = await getQuickFrameDescription(imageData, personalItems);
                // Check again in case stop was called during the API call
                if (isLiveActive.current && description) {
                    setLastResponse(description);
                    speak(description);
                }
            } catch (err) {
                console.error("Live commentary frame analysis failed:", err);
                // Don't stop the whole loop for one error, just continue.
            }
        }
        
        // Wait for a bit before processing the next frame
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }, [captureFrame, personalItems, speak]);

  const runObjectFinder = useCallback(async (itemName: string) => {
    if (isFindingActive.current) return;

    isFindingActive.current = true;
    setFindingItemName(itemName);
    setAppState(AppState.FINDING_ITEM);
    const startMessage = `Looking for ${itemName}. Pan your camera around. Say 'stop' to exit.`;
    setLastResponse(startMessage);
    speak(startMessage);
    
    while(isFindingActive.current) {
        const imageData = captureFrame();
        if (!imageData) continue;
        const responseText = await findObject(imageData, itemName, personalItems);
        if (!isFindingActive.current) break;

        if(responseText !== "I don't see it here.") {
            setLastResponse(responseText);
            speak(responseText);
            await new Promise(resolve => setTimeout(resolve, 3000)); 
        } else {
            setLastResponse(`Looking for ${itemName}...`);
        }
        await new Promise(resolve => setTimeout(resolve, 500)); 
    }
  }, [captureFrame, personalItems, speak]);
  
  const handleDeleteItem = (name: string) => {
    const updatedItems = personalDB.deleteItem(name);
    setPersonalItems(updatedItems);
    const message = `Okay, I've deleted ${name}.`;
    setLastResponse(message);
    speak(message);
  };
  
  const getAppStatus = () => {
    if (cameraError) return `Camera Error: ${cameraError}`;
    if (voiceError) return `Voice Error: ${voiceError}`;
    switch (appState) {
        case AppState.INTERPRETING_COMMAND: return "Interpreting command...";
        case AppState.ANALYZING: return "Analyzing...";
        case AppState.SAVING_ITEM_LISTEN: return "Listening for item name...";
        case AppState.FINDING_ITEM: return `Finding ${findingItemName}...`;
        case AppState.LIVE_COMMENTARY: return "Live...";
        case AppState.AWAITING_FOLLOWUP: return "Ready for follow-up question.";
        case AppState.MANAGING_ITEMS: return "Managing items...";
        case AppState.IDLE: 
            if (isSpeaking) return "Speaking...";
            if (isListening) return "Listening for commands...";
            if (isVoiceCommandActive) return "Listening...";
            return "Ready";
        default: 
            return "Ready";
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">
      <ItemManager 
        isOpen={appState === AppState.MANAGING_ITEMS}
        items={personalItems}
        onDeleteItem={handleDeleteItem}
        onClose={() => handleAction(ActionType.CLOSE_MANAGEMENT)}
      />
      
      {/* Header */}
      <header className="bg-black border-b border-gray-800 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/50">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-600 tracking-wider">IRIS 2.0</h1>
              <p className="text-xs text-gray-500">AI Vision Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Premium Link */}
            <Link 
              to="/premium" 
              className="hidden md:block px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg text-white text-sm font-semibold transition-all shadow-lg shadow-purple-500/30"
            >
              ⭐ Premium
            </Link>

            {/* Language Switcher */}
            <div className="flex bg-gray-900 rounded-lg p-1">
              <button 
                onClick={() => setLanguage('en-US')} 
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${language === 'en-US' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/50' : 'text-gray-400 hover:text-white'}`}
              >
                EN
              </button>
              <button 
                onClick={() => setLanguage('hi-IN')} 
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${language === 'hi-IN' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/50' : 'text-gray-400 hover:text-white'}`}
              >
                हिन्दी
              </button>
            </div>

            {/* User Menu */}
            {isAuthenticated ? (
              <Link 
                to="/profile" 
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg transition-all"
              >
                {user?.profileImage ? (
                  <img src={user.profileImage} alt={user.name || 'User'} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <UserGroupIcon className="w-5 h-5 text-cyan-400" />
                )}
                <span className="hidden md:inline text-sm text-gray-300">{user?.name || 'Profile'}</span>
              </Link>
            ) : (
              <Link 
                to="/login" 
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white text-sm font-semibold transition-all"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">{/* Main Content Container */}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column: Camera */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="relative w-full aspect-video bg-gradient-to-br from-gray-900 to-black rounded-2xl shadow-2xl overflow-hidden border border-gray-800">
              <CameraFeed videoRef={videoRef} />
              {(!isCameraReady || cameraError) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
                    {cameraError ? 
                        <div className="text-center">
                          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-red-400 text-lg font-medium">{cameraError}</p>
                          <p className="text-gray-400 text-sm mt-2">Please grant camera permissions and refresh the page</p>
                        </div> :
                        <div className="text-center">
                          <Spinner />
                          <p className="text-gray-300 mt-4 text-lg">Initializing Camera...</p>
                        </div>
                    }
                </div>
              )}
              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isCameraReady ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
                  <span className="text-xs text-gray-300">{isCameraReady ? 'Live' : 'Not Ready'}</span>
                </div>
              </div>
            </div>

            {/* Voice Control Card */}
            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={toggleVoiceCommands}
                  disabled={!isCameraReady || !!cameraError}
                  className={`relative flex items-center justify-center px-8 py-4 rounded-2xl font-bold text-white transition-all duration-300 shadow-lg focus:outline-none focus:ring-4 w-full
                    ${isVoiceCommandActive 
                      ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 focus:ring-red-400 shadow-red-500/50' 
                      : 'bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 focus:ring-cyan-500 shadow-cyan-500/50'}
                    ${(!isCameraReady || !!cameraError) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`
                  }
                  aria-label={isVoiceCommandActive ? "Stop listening for voice commands" : "Start listening for voice commands"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-8 h-8 ${isVoiceCommandActive && isListening ? 'animate-pulse' : ''}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m12 0v-1.5a6 6 0 0 0-12 0v1.5m12 0v-1.5a6 6 0 0 0-12 0v1.5m6 3.75a3 3 0 0 0 3-3v-1.5a3 3 0 0 0-6 0v1.5a3 3 0 0 0 3 3Z" />
                  </svg>
                  <span className="ml-3 text-lg">{isVoiceCommandActive ? '● LISTENING' : 'START VOICE CONTROL'}</span>
                </button>
                {isVoiceCommandActive && (
                  <div className="w-full">
                    <AudioVisualizer volume={volume} />
                    <p className="text-center text-sm text-gray-400 mt-2">Say a command or "help" for options</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Controls and Response */}
          <div className="lg:w-2/5 flex flex-col gap-4">
            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-2xl p-4 shadow-xl">
              <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Quick Actions
              </h2>
              <Controls onAction={handleAction} isDisabled={isBusy || !isCameraReady} isLive={isLive} />
            </div>

            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-2xl p-4 shadow-xl flex-grow">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Assistant Response
                </h2>
                <div className="flex items-center gap-2">
                  {(isListening || isListeningForInput) && (
                    <div title="Microphone Active">
                      <MicrophoneIcon isListening={true}/>
                    </div>
                  )}
                  <div className={`text-xs font-medium px-3 py-1.5 rounded-full ${
                    appState === AppState.ANALYZING ? 'bg-yellow-500/20 text-yellow-400' :
                    appState === AppState.LIVE_COMMENTARY ? 'bg-green-500/20 text-green-400 animate-pulse' :
                    isSpeaking ? 'bg-blue-500/20 text-blue-400' :
                    isVoiceCommandActive ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {getAppStatus()}
                  </div>
                </div>
              </div>
              <div className="bg-black/40 rounded-xl p-4 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar">
                {(appState === AppState.ANALYZING || appState === AppState.INTERPRETING_COMMAND) && (
                  <div className="flex items-center justify-center h-full">
                    <Spinner/>
                  </div>
                )}
                {voiceError && (
                  <div className="bg-orange-500/10 border border-orange-500/50 rounded-lg p-4 text-orange-400">
                    <div className="flex items-start gap-3 mb-3">
                      <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-semibold mb-1">Microphone Permission Required</p>
                        <p className="text-sm whitespace-pre-line">{voiceError}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          resetError();
                          startListening();
                        }}
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          resetError();
                          setIsVoiceCommandActive(false);
                          stopListening();
                        }}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                {error && !voiceError && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 flex items-start gap-3">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm">{error}</span>
                  </div>
                )}
                {lastResponse && (
                  <div className="text-gray-200 text-sm leading-relaxed">
                    <p>{lastResponse}</p>
                  </div>
                )}
                {appState === AppState.AWAITING_FOLLOWUP && (
                  <p className="text-cyan-400 mt-3 text-xs bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-2">
                    💡 Say "ask a question" or give another command
                  </p>
                )}
                {!lastResponse && !error && appState === AppState.IDLE && (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      <p className="text-sm">Waiting for command...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>{/* End Main Content Container */}
      
      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
      
      {/* Permission Prompt for PWA */}
      <PermissionPrompt />
    </div>
  );
};

export default App;