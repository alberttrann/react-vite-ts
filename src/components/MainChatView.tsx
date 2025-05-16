// src/components/MainChatView.tsx
import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback
} from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { useWebSocket } from "../hooks/useWebSocket"; 
import { Message } from '@/types'; 
import { Base64 } from 'js-base64';
import ReactMarkdown from 'react-markdown';
import {
  Camera,
  Mic,
  PlusCircle,
  Send,
  StopCircle,
  XCircle, 
  KeyRound, // For Secrets/API Key button
  // Settings2, // Removed as it was unused
} from "lucide-react";
import { Switch } from "./ui/switch"; 
import { Label } from "./ui/label";   

const logger = { 
    info: (...args: any[]) => console.log('[INFO][MainChatView]', ...args),
    warn: (...args: any[]) => console.warn('[WARN][MainChatView]', ...args),
    error: (...args: any[]) => console.error('[ERROR][MainChatView]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG][MainChatView]', ...args),
};

const MainChatView: React.FC = () => {
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); 

  const [typedMessage, setTypedMessage] = useState("");
  const [isLiveChatActive, setIsLiveChatActive] = useState(false);
  const [isCapturingMic, setIsCapturingMic] = useState(false); 
  const [inputAudioLevel, setInputAudioLevel] = useState(0);

  const [isCameraPreviewOn, setIsCameraPreviewOn] = useState(false);
  const [capturedImageDataUrl, setCapturedImageDataUrl] = useState<string | null>(null); 

  const {
    sendMessage, sendMediaChunk, isConnected, playbackAudioLevel, 
    initAudioContext, sessions, activeSessionId, addMessageToActiveSession,
    // Get toggle states and updaters from context
    isGeminiApiKeySet,
    useGemini,        // This is the state from context
    evalMode,         // This is the state from context
    groundingMode,    // This is the state from context
    updateToggleState, // This is the function from context to call
    requestApiKeyModal,
  } = useWebSocket(); 

  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeMessages: Message[] = useMemo(() => {
    if (!activeSessionId) return [];
    const activeSession = sessions.find(session => session.id === activeSessionId);
    return activeSession ? activeSession.messages : [];
  }, [sessions, activeSessionId]);

  useEffect(() => { 
    if (activeMessages.length > 0) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => setTypedMessage(event.target.value);

  const handleSendTextMessage = useCallback(() => {
    logger.info("[SendText] Triggered. Typed msg:", typedMessage, "Has captured image for THIS send:", !!capturedImageDataUrl);
    if (!activeSessionId) { logger.error("[SendText] No active session."); return; }
    if (typedMessage.trim() === "" && !capturedImageDataUrl) { logger.warn("[SendText] Aborted: No text and no image."); return; }
    
    const imageToSendWithThisTextMessage = capturedImageDataUrl ? capturedImageDataUrl.split(',')[1] : null;
    const userTextForDisplay = typedMessage || (imageToSendWithThisTextMessage ? "[Image attached]" : "");

    if(userTextForDisplay || imageToSendWithThisTextMessage) {
        if (userTextForDisplay) { addMessageToActiveSession({ sender: 'User', data: { text: userTextForDisplay } }); }
        sendMessage({ type: "text_input", data: { text: typedMessage.trim(), image_data: imageToSendWithThisTextMessage } });
    }
    setTypedMessage(""); setCapturedImageDataUrl(null);
  }, [typedMessage, activeSessionId, addMessageToActiveSession, sendMessage, capturedImageDataUrl]);

  const handleKeyPress = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendTextMessage(); }
  }, [handleSendTextMessage]);

  const stopMediaStreamTracks = useCallback((stream: MediaStream | null, streamType: 'camera' | 'mic' | 'general') => {
    if (stream) {
        logger.info(`[MediaStop - ${streamType}] Stopping tracks for stream ID: ${stream.id}`); // streamType is used here
        stream.getTracks().forEach(track => { track.stop(); });
        return true;
    }
    logger.info(`[MediaStop - ${streamType}] No stream to stop.`); // and here
    return false; 
  }, []);

  const stopCameraPreview = useCallback(() => {
    if (videoPreviewRef.current && videoPreviewRef.current.srcObject) {
      const stream = videoPreviewRef.current.srcObject as MediaStream; 
      stopMediaStreamTracks(stream, 'camera'); 
      videoPreviewRef.current.srcObject = null; videoPreviewRef.current.removeAttribute('src'); videoPreviewRef.current.load(); 
    } 
    if (mediaStreamRef.current && mediaStreamRef.current.getVideoTracks().length > 0) {
        stopMediaStreamTracks(mediaStreamRef.current, 'camera'); 
        mediaStreamRef.current = null; 
    }
    setIsCameraPreviewOn(false);
  }, [stopMediaStreamTracks]);

  const clearMedia = useCallback(() => {
    stopCameraPreview(); setCapturedImageDataUrl(null); 
    if (fileInputRef.current) fileInputRef.current.value = ""; 
  }, [stopCameraPreview]);

  const stopVoiceInput = useCallback(() => {
    if (mediaStreamRef.current && mediaStreamRef.current.getAudioTracks().length > 0) {
        stopMediaStreamTracks(mediaStreamRef.current, 'mic'); mediaStreamRef.current = null;
    }
    if (mediaStreamSourceRef.current) { try { mediaStreamSourceRef.current.disconnect(); } catch(e){logger.error("[AudioNode] Error disconnecting mediaStreamSourceRef", e)} mediaStreamSourceRef.current = null; }
    if (audioWorkletNodeRef.current) {
      try { audioWorkletNodeRef.current.port.postMessage({ command: 'stop' }); } catch(e){logger.error("[AudioNode] Error sending stop to worklet", e)}
      try { audioWorkletNodeRef.current.port.close(); } catch(e){logger.error("[AudioNode] Error closing worklet port", e)}
      try { audioWorkletNodeRef.current.disconnect(); } catch(e){logger.error("[AudioNode] Error disconnecting worklet", e)}
      audioWorkletNodeRef.current = null;
    }
    setInputAudioLevel(0); setIsCapturingMic(false); 
  }, [stopMediaStreamTracks]);

  const stopAllMediaCapture = useCallback(() => { stopVoiceInput(); stopCameraPreview(); setIsLiveChatActive(false); }, [stopVoiceInput, stopCameraPreview]);

  const startVoiceInput = useCallback(async () => {
    if (isCapturingMic) return; setIsCapturingMic(true); 
    const audioCtx = initAudioContext(); 
    if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (e) { logger.error("[Audio] Failed to resume audio context:", e); setIsCapturingMic(false); return; }}
    if (!audioCtx || audioCtx.state !== 'running') { logger.error(`[Audio] AudioContext not ready. State: ${audioCtx?.state}`); alert("Audio system not ready."); setIsCapturingMic(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000 }});
      mediaStreamRef.current = stream; 
      await audioCtx.audioWorklet.addModule('/worklets/audio-processor.js'); 
      const source = audioCtx.createMediaStreamSource(stream); mediaStreamSourceRef.current = source;
      audioWorkletNodeRef.current = new AudioWorkletNode(audioCtx, 'audio-processor', { processorOptions: { sampleRate: audioCtx.sampleRate, bufferSize: 4096 } });
      source.connect(audioWorkletNodeRef.current);
      audioWorkletNodeRef.current.port.onmessage = (event) => {
        const { pcmData, level } = event.data; setInputAudioLevel(level); 
        if (pcmData && pcmData.byteLength > 0 && isConnected) { sendMediaChunk({ mime_type: "audio/pcm", data: Base64.fromUint8Array(new Uint8Array(pcmData)) }); }
      };
      audioWorkletNodeRef.current.port.postMessage({ command: 'start' }); 
    } catch (err) { logger.error("[VoiceInput] Error starting microphone:", err); let msg = "Error starting mic."; if (err instanceof Error) { msg = `Mic error: ${err.name} - ${err.message}.`;} alert(msg); setIsLiveChatActive(false); setIsCapturingMic(false); stopVoiceInput(); }
  }, [initAudioContext, sendMediaChunk, isCapturingMic, isConnected, stopVoiceInput]); 

  const handleToggleLiveChat = useCallback(() => { setIsLiveChatActive(prev => { const next = !prev; if (next) { setTypedMessage(""); clearMedia(); startVoiceInput(); } else { stopVoiceInput(); } return next; }); }, [startVoiceInput, stopVoiceInput, clearMedia]);

  const handleStartCamera = useCallback(async () => {
    if (isCameraPreviewOn) return; 
    if (isLiveChatActive) { stopVoiceInput(); setIsLiveChatActive(false); } 
    clearMedia(); setIsCameraPreviewOn(true); 
    const audioCtx = initAudioContext(); if (audioCtx && audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch(e) {}}
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }); mediaStreamRef.current = stream; 
        if (!stream.active || stream.getVideoTracks().length === 0) { stopMediaStreamTracks(stream, 'camera'); mediaStreamRef.current = null; setIsCameraPreviewOn(false); return; }
        if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = stream; videoPreviewRef.current.onloadedmetadata = () => { videoPreviewRef.current?.play().catch(() => {setIsCameraPreviewOn(false); stopMediaStreamTracks(stream, 'camera'); mediaStreamRef.current = null;}); }; videoPreviewRef.current.onerror = () => {setIsCameraPreviewOn(false); stopMediaStreamTracks(stream, 'camera'); mediaStreamRef.current = null;}; } 
        else { stopMediaStreamTracks(stream, 'camera'); mediaStreamRef.current = null; setIsCameraPreviewOn(false); }
      } catch (err) { setIsCameraPreviewOn(false); if (mediaStreamRef.current) { stopMediaStreamTracks(mediaStreamRef.current, 'camera'); mediaStreamRef.current = null;} let msg = "Camera error."; if (err instanceof Error) {msg = `Camera error: ${err.name} - ${err.message}.`;} alert(msg); }
    } else { alert("Camera not supported."); setIsCameraPreviewOn(false); }
  }, [initAudioContext, isLiveChatActive, stopVoiceInput, clearMedia, stopMediaStreamTracks, isCameraPreviewOn]);

  const handleTakePicture = useCallback(() => {
    if (videoPreviewRef.current?.srcObject && videoPreviewRef.current.readyState >= 1 && videoPreviewRef.current.videoWidth > 0 && videoPreviewRef.current.videoHeight > 0) {
      const canvas = document.createElement('canvas'); canvas.width = videoPreviewRef.current.videoWidth; canvas.height = videoPreviewRef.current.videoHeight;
      const ctxCanvas = canvas.getContext('2d');
      if (ctxCanvas) {
        ctxCanvas.drawImage(videoPreviewRef.current, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85); const base64ImageData = imageDataUrl.split(',')[1];
        sendMediaChunk({ mime_type: "image/jpeg", data: base64ImageData }); 
        setCapturedImageDataUrl(imageDataUrl); 
        addMessageToActiveSession({ sender: 'User', data: { text: "[Camera Image captured & context sent. Add message or ask about it.]" }});
        stopCameraPreview(); 
      }}
  }, [stopCameraPreview, addMessageToActiveSession, sendMediaChunk]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; 
    if (file && file.type.startsWith("image/")) { 
      if (isLiveChatActive) { stopVoiceInput(); setIsLiveChatActive(false); } stopCameraPreview(); 
      const reader = new FileReader(); 
      reader.onloadend = () => { const imageDataUrl = reader.result as string; const base64ImageData = imageDataUrl.split(',')[1]; sendMediaChunk({ mime_type: file.type, data: base64ImageData }); setCapturedImageDataUrl(imageDataUrl); addMessageToActiveSession({ sender: 'User', data: { text: `[Image "${file.name}" uploaded & context sent. Ask about it or type a message.]` }}); }; 
      reader.readAsDataURL(file); 
    } else if (file) { alert("Please select an image file.");} 
    if(fileInputRef.current) fileInputRef.current.value = "";
  }, [stopVoiceInput, stopCameraPreview, addMessageToActiveSession, isLiveChatActive, sendMediaChunk]);

  useEffect(() => {
    if (!isConnected && (isCapturingMic || isCameraPreviewOn || mediaStreamRef.current)) { stopAllMediaCapture(); }
    return () => { if (isCapturingMic || isCameraPreviewOn || mediaStreamRef.current) { stopAllMediaCapture(); }}; 
  }, [isConnected, isCapturingMic, isCameraPreviewOn, stopAllMediaCapture]);

  const canInteract = isConnected && activeSessionId;

  // THIS IS THE CORRECTED FUNCTION TO HANDLE TOGGLE CHANGES
  const handleToggleChange = useCallback((toggleName: 'gemini' | 'eval' | 'grounding', isEnabled: boolean) => {
    logger.info(`[ToggleUI] User clicked '${toggleName}', new desired state: ${isEnabled}.`);
    
    if ((toggleName === 'gemini' || toggleName === 'eval') && isEnabled && !isGeminiApiKeySet) {
        logger.warn(`[ToggleUI] '${toggleName}' requires Gemini API key, but it's not confirmed set. Requesting modal.`);
        requestApiKeyModal(); // Ask provider to show modal. User will submit key, then can re-toggle.
        // Do not call updateToggleState here, as the API key needs to be set first.
        // The backend will also reject if key is missing.
        // The UI Switch will reflect the context state, which won't change until backend confirms.
        return; // Prevent sending toggle update if key is missing and we're enabling.
    }
    updateToggleState(toggleName, isEnabled); // Call the function from context
  }, [updateToggleState, isGeminiApiKeySet, requestApiKeyModal]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-850">
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />

      {(isCameraPreviewOn || capturedImageDataUrl) && ( <Card className="mb-2 flex-shrink-0 border-b dark:border-gray-700 shadow-sm"> <CardHeader className="p-2 text-center bg-gray-50 dark:bg-gray-800 rounded-t-lg flex flex-row justify-between items-center"> <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 ml-2"> {isCameraPreviewOn ? "Camera Preview" : (capturedImageDataUrl ? "Image Ready" : "Media Area")} </CardTitle> <Button onClick={clearMedia} variant="ghost" size="icon" title="Clear Media Preview" className="mr-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"> <XCircle className="h-5 w-5" /> </Button> </CardHeader> <CardContent className="flex flex-col items-center justify-center p-2 min-h-[180px] bg-muted/30 dark:bg-gray-700/30"> {capturedImageDataUrl && !isCameraPreviewOn && ( <img src={capturedImageDataUrl} alt="Captured or Uploaded" className="max-w-xs max-h-40 inline-block rounded-md border dark:border-gray-600 object-contain" /> )} {isCameraPreviewOn && ( <video ref={videoPreviewRef} playsInline muted className="w-auto max-h-40 aspect-video rounded-md border bg-black inline-block dark:border-gray-600" style={{transform: 'scaleX(-1)'}} /> )} <div className="flex space-x-2 mt-2"> {isCameraPreviewOn && (<Button onClick={handleTakePicture} size="sm" variant="secondary">Take Picture</Button>)} </div> </CardContent> </Card> )}

      <Card className="flex-1 flex flex-col min-h-0 border-0 shadow-none rounded-none">
        <CardHeader className="flex-shrink-0 border-b dark:border-gray-700 p-3 flex justify-between items-center">
          <CardTitle className="text-base text-gray-800 dark:text-gray-200">
            AI Assistant 
            {activeSessionId && <span className="text-xs text-muted-foreground ml-1">(...{activeSessionId.slice(-4)})</span>}
            {isLiveChatActive && <span className="ml-2 text-sm font-normal text-red-500 animate-pulse">(Voice Active)</span>}
          </CardTitle>
          {/* Settings/API Key Button */}
          <Button onClick={requestApiKeyModal} variant="ghost" size="sm" className="text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700" title="API Key Settings">
            <KeyRound size={14} className="mr-1.5" /> API Key
          </Button>
          {!canInteract && <span className="text-xs text-red-500 dark:text-red-400">Connecting...</span>}
        </CardHeader>
        <CardContent className="flex-1 overflow-y-hidden p-0 flex flex-col">
          <ScrollArea className="flex-1 p-4 pr-3">
            <div className="space-y-3">
              {activeMessages.length === 0 && (<p className="text-sm text-muted-foreground text-center py-10">Start a conversation or send an image.</p>)}
              {activeMessages.map((message: Message) => (
                 (message.data.text !== null && message.data.text.trim() !== "") && ( 
                   <div key={message.id} className={`flex items-start space-x-2.5 rounded-lg p-3 mb-2 w-fit max-w-[85%] shadow-sm ${ message.sender === 'AI' || message.sender === 'AI_Evaluator' ? 'bg-gray-100 dark:bg-gray-700 self-start' : 'bg-blue-500 dark:bg-blue-600 text-white self-end ml-auto' } ${ message.sender === 'AI_Evaluator' ? 'border-l-4 border-purple-500 dark:border-purple-400' : '' }`}>
                     <div className={`h-7 w-7 rounded-full flex items-center justify-center ${ message.sender === 'AI' ? 'bg-slate-400 dark:bg-slate-500' : message.sender === 'AI_Evaluator' ? 'bg-purple-500 dark:bg-purple-600' : 'bg-sky-400 dark:bg-sky-500'} flex-shrink-0 text-white text-xs font-semibold`}>
                       {message.sender === 'AI' ? 'AI' : message.sender === 'AI_Evaluator' ? 'EV' :'You'}
                     </div>
                     <div className={`space-y-0.5 flex-1 min-w-0 ${message.sender === 'User' ? 'text-right' : 'text-left'}`}>
                        {(message.sender === 'AI' || message.sender === 'AI_Evaluator') ? ( <div className="prose prose-sm dark:prose-invert max-w-full text-gray-900 dark:text-gray-100"> <ReactMarkdown components={{ a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline"/> }}>{message.data.text || ""}</ReactMarkdown> </div>) 
                        : (<p className="text-sm leading-relaxed break-words">{message.data.text}</p> )}
                       <p className={`text-xs opacity-80 ${message.sender === 'AI' || message.sender === 'AI_Evaluator' ? 'text-gray-500 dark:text-gray-400' : 'text-blue-100 dark:text-blue-200'}`}> {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} </p>
                     </div>
                   </div>
                 )
              ))}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="p-3 border-t dark:border-gray-700 flex items-center space-x-2 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
        <Button onClick={() => fileInputRef.current?.click()} variant="ghost" size="icon" title="Upload Image" disabled={!canInteract || isLiveChatActive || isCameraPreviewOn}> <PlusCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" /> </Button>
        <Button onClick={isCameraPreviewOn ? clearMedia : handleStartCamera} variant={isCameraPreviewOn ? "secondary" : "ghost"} size="icon" title={isCameraPreviewOn ? "Close Camera & Clear Media" : "Open Camera"} disabled={!canInteract || isLiveChatActive} > {isCameraPreviewOn ? <XCircle className="h-5 w-5 text-red-500"/> : <Camera className="h-5 w-5 text-gray-600 dark:text-gray-400" />} </Button>
        {!isLiveChatActive ? ( <> <Input type="text" placeholder={capturedImageDataUrl ? "Describe the image or ask a question..." : "Type your message..."} value={typedMessage} onChange={handleInputChange} onKeyPress={handleKeyPress} className="flex-1 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400" disabled={!canInteract || (isCameraPreviewOn && !capturedImageDataUrl)} /> <Button onClick={handleSendTextMessage} disabled={!canInteract || (typedMessage.trim() === "" && !capturedImageDataUrl) || (isCameraPreviewOn && !capturedImageDataUrl)} title="Send Message"> <Send className="h-4 w-4"/> </Button> </>
        ) : ( <div className="flex-1 text-center text-sm text-muted-foreground italic h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-md px-2"> Voice input active... <Progress value={inputAudioLevel} className="w-24 h-1.5 ml-2 inline-block" /> </div> )}
        <Button onClick={handleToggleLiveChat} variant={isLiveChatActive ? "destructive" : "outline"} size="icon" title={isLiveChatActive ? "Stop Voice Input" : "Start Voice Input"} disabled={!canInteract || isCameraPreviewOn } > {isLiveChatActive ? <StopCircle className="h-5 w-5"/> : <Mic className="h-5 w-5" />} </Button>
      </div>

      <div className="p-2 border-t dark:border-gray-700 flex items-center justify-start space-x-4 bg-gray-100 dark:bg-gray-900 text-xs flex-shrink-0">
        <div className="flex items-center space-x-1.5">
          <Switch id="gemini-toggle" checked={useGemini} onCheckedChange={(checked) => handleToggleChange('gemini', checked)} disabled={!isConnected} />
          <Label htmlFor="gemini-toggle" className="text-gray-700 dark:text-gray-300 cursor-pointer">Use Gemini</Label>
        </div>
        <div className="flex items-center space-x-1.5">
          <Switch id="eval-toggle" checked={evalMode} onCheckedChange={(checked) => handleToggleChange('eval', checked)} disabled={!isConnected} />
          <Label htmlFor="eval-toggle" className="text-gray-700 dark:text-gray-300 cursor-pointer">Eval Mode</Label>
        </div>
        <div className="flex items-center space-x-1.5">
          <Switch id="grounding-toggle" checked={groundingMode} onCheckedChange={(checked) => handleToggleChange('grounding', checked)} disabled={!isConnected} />
          <Label htmlFor="grounding-toggle" className="text-gray-700 dark:text-gray-300 cursor-pointer">Grounding</Label>
        </div>
      </div>

      {(isCapturingMic || playbackAudioLevel > 0) && ( <div className="px-3 py-1.5 text-xs text-muted-foreground flex justify-around items-center flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700/50"> {isCapturingMic && <span className="flex items-center">Mic In: <Progress value={inputAudioLevel} className="w-20 h-1 ml-1.5" /></span>} {playbackAudioLevel > 0 && <span className="flex items-center">AI Voice: <Progress value={playbackAudioLevel} className="w-20 h-1 ml-1.5" indicatorClassName="bg-green-500" /></span>} </div> )}
    </div>
  );
};

export default MainChatView;