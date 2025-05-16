// src/components/WebSocketProvider.tsx
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  createContext
} from "react";
import { Base64 } from 'js-base64';
import { v4 as uuidv4 } from 'uuid';
import { Session, Message, MediaChunk, AudioChunkBuffer, WebSocketContextType } from '../types'; 
import ApiKeyModal from './ApiKeyModal'; // Import the new modal

export const WebSocketContext = createContext<WebSocketContextType | null>(null);

const RECONNECT_TIMEOUT = 5000;
const CONNECTION_TIMEOUT = 30000; 
const LAST_ACTIVE_SESSION_ID_KEY = 'yeyuChat_lastActiveSessionId';
const GEMINI_API_KEY_ENTERED_HINT_KEY = 'yeyuChat_geminiApiKeyEnteredHint'; // For frontend optimistic hint

const logger = { 
    info: (...args: any[]) => console.log('[WSProvider][INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WSProvider][WARN]', ...args),
    error: (...args: any[]) => console.error('[WSProvider][ERROR]', ...args),
    debug: (...args: any[]) => console.debug('[WSProvider][DEBUG]', ...args),
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode; url: string }> = ({
  children,
  url,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [playbackAudioLevel, setPlaybackAudioLevel] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() => {
    return localStorage.getItem(LAST_ACTIVE_SESSION_ID_KEY);
  });

  // --- STATE FOR API KEY & TOGGLES (Managed by Provider) ---
  const [isGeminiApiKeySetConfirmedByBackend, setIsGeminiApiKeySetConfirmedByBackend] = useState<boolean>(false);
  const [useGeminiClientToggle, setUseGeminiClientToggle] = useState<boolean>(false);
  const [evalModeClientToggle, setEvalModeClientToggle] = useState<boolean>(false);
  const [groundingModeClientToggle, setGroundingModeClientToggle] = useState<boolean>(false);
  const [showApiKeyModalState, setShowApiKeyModalState] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionTimeoutRef = useRef<NodeJS.Timeout>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const audioBufferQueueRef = useRef<AudioChunkBuffer[]>([]);
  const playbackAnimationRef = useRef<number>();
  const reconnectAttemptsRef = useRef(0);
  const audioSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const sessionsRef = useRef(sessions); 
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const initAudioContext = useCallback((): AudioContext | null => { /* ... as in your prev file ... */ 
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      logger.info("Initializing new AudioContext (target 24kHz)");
      try { const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); audioContextRef.current = context; logger.info(`AudioContext Initialized. State: ${context.state}, Sample Rate: ${context.sampleRate}`); analyserNodeRef.current = context.createAnalyser(); analyserNodeRef.current.fftSize = 256; analyserNodeRef.current.smoothingTimeConstant = 0.5; } 
      catch (e) { logger.error("Failed to create AudioContext:", e); audioContextRef.current = null; analyserNodeRef.current = null; }
    } else if (audioContextRef.current.state === 'suspended') { logger.info("Attempting to resume suspended AudioContext..."); audioContextRef.current.resume().catch(e => logger.error("Error resuming AudioContext:", e)); }
    return audioContextRef.current;
  }, []);
  const stopMeasuringAudioLevel = useCallback(() => { /* ... as in your prev file ... */ if (playbackAnimationRef.current) { cancelAnimationFrame(playbackAnimationRef.current); playbackAnimationRef.current = undefined; }}, []);
  const measureAudioLevel = useCallback(() => { /* ... as in your prev file ... */ const analyser = analyserNodeRef.current; if (!analyser || !audioSourceNodeRef.current) { stopMeasuringAudioLevel(); setPlaybackAudioLevel(0); return; } const dataArray = new Uint8Array(analyser.frequencyBinCount); try { analyser.getByteFrequencyData(dataArray); const average = dataArray.reduce((sum, value) => sum + value, 0) / (dataArray.length || 1); const level = Math.min(100, Math.max(0, Math.round((average / 128) * 100 * 1.5))); setPlaybackAudioLevel(level); } catch (e) { logger.error("Error getting frequency data for audio level:", e); stopMeasuringAudioLevel(); setPlaybackAudioLevel(0); return; } playbackAnimationRef.current = requestAnimationFrame(measureAudioLevel); }, [stopMeasuringAudioLevel, setPlaybackAudioLevel]); // Added setPlaybackAudioLevel
  const stopAndClearAudioPlayback = useCallback(() => { /* ... as in your prev file ... */     logger.info('Stopping and clearing all TTS audio playback'); stopMeasuringAudioLevel(); if (audioSourceNodeRef.current) { try { audioSourceNodeRef.current.onended = null; audioSourceNodeRef.current.stop(); audioSourceNodeRef.current.disconnect(); } catch (error) { if (!(error instanceof DOMException && error.name === 'InvalidStateError')) { logger.error('Error stopping audio source:', error); } } finally { audioSourceNodeRef.current = null; } } audioBufferQueueRef.current = []; setPlaybackAudioLevel(0); logger.info('Cleared TTS audio queue'); }, [stopMeasuringAudioLevel, setPlaybackAudioLevel]); // Added setPlaybackAudioLevel
  const playAudioChunkFromQueue = useCallback(async (audioBuffers: ArrayBuffer[]): Promise<void> => { /* ... as in your prev file ... */     logger.debug(`Attempting to play ${audioBuffers.length} queued TTS buffers.`); return new Promise(async (resolve, reject) => { const ctx = initAudioContext(); if (!ctx) { logger.error("AudioContext not available for playback."); return reject(new Error("AudioContext not available")); } if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { logger.error("Error resuming AudioContext for playback:", e); return reject(e); } } if (ctx.state !== 'running') { logger.error(`AudioContext not running (state: ${ctx.state}) for playback.`); return reject(new Error(`AudioContext not running (state: ${ctx.state})`)); } try { const totalInt16Length = audioBuffers.reduce((acc, buffer) => (acc + (buffer.byteLength - (buffer.byteLength % 2)) / 2), 0); if (totalInt16Length === 0) { logger.debug("No valid samples in TTS chunk for playback."); return resolve(); } const targetSampleRate = ctx.sampleRate; const audioBuffer = ctx.createBuffer(1, totalInt16Length, targetSampleRate); const channelData = audioBuffer.getChannelData(0); let offset = 0; audioBuffers.forEach(buffer => { const usableLength = buffer.byteLength - (buffer.byteLength % 2); if(usableLength > 0) { const int16Data = new Int16Array(buffer, 0, usableLength / 2); for (let i = 0; i < int16Data.length; i++) { if (offset + i < channelData.length) { channelData[offset + i] = int16Data[i] / 32768.0; } else { break; } } offset += int16Data.length; }}); if (audioSourceNodeRef.current) { try { audioSourceNodeRef.current.onended = null; audioSourceNodeRef.current.stop(); audioSourceNodeRef.current.disconnect(); } catch (e) {} audioSourceNodeRef.current = null; } stopMeasuringAudioLevel(); const source = ctx.createBufferSource(); source.buffer = audioBuffer; audioSourceNodeRef.current = source; const analyser = analyserNodeRef.current; if (analyser) { source.connect(analyser); analyser.connect(ctx.destination); } else { source.connect(ctx.destination); } source.onended = () => { if (audioSourceNodeRef.current === source) { stopMeasuringAudioLevel(); try { source.disconnect(); } catch(e) {} audioSourceNodeRef.current = null; setPlaybackAudioLevel(0); } resolve(); }; source.start(); if (analyser) { if (playbackAnimationRef.current) cancelAnimationFrame(playbackAnimationRef.current); playbackAnimationRef.current = requestAnimationFrame(measureAudioLevel); } } catch (error) { logger.error("Error playing TTS audio chunk:", error); stopMeasuringAudioLevel(); if (audioSourceNodeRef.current) { try { audioSourceNodeRef.current.disconnect(); } catch(e) {} audioSourceNodeRef.current = null; } setPlaybackAudioLevel(0); reject(error); }}); }, [initAudioContext, measureAudioLevel, stopMeasuringAudioLevel, setPlaybackAudioLevel]); // Added setPlaybackAudioLevel

  const setActiveSessionId = useCallback((sessionId: string | null) => { /* ... as before ... */     logger.info(`Setting active session ID to: ${sessionId}`); setActiveSessionIdState(sessionId); if (sessionId) { localStorage.setItem(LAST_ACTIVE_SESSION_ID_KEY, sessionId); setSessions(prevSessions => { const targetSession = prevSessions.find(s => s.id === sessionId); if (targetSession && !targetSession.messagesLoaded && wsRef.current?.readyState === WebSocket.OPEN) { logger.info(`Messages for session ${sessionId} not loaded. Requesting from backend.`); wsRef.current.send(JSON.stringify({ type: "load_session_messages_request", sessionId_to_load: sessionId, sessionId: sessionId })); } return prevSessions; }); } else { localStorage.removeItem(LAST_ACTIVE_SESSION_ID_KEY); } }, []); 
  const createNewSession = useCallback((): string => { /* ... as before ... */     const newSessionId = uuidv4(); const newSessionName = `Chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; const now = Date.now(); const newSession: Session = { id: newSessionId, name: newSessionName, messages: [], createdAt: now, lastUpdatedAt: now, messagesLoaded: true }; setSessions(prev => [newSession, ...prev].sort((a,b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))); logger.info(`[Session] Created new session locally: ${newSessionId} ('${newSessionName}')`); if (wsRef.current?.readyState === WebSocket.OPEN) { logger.info(`[Session] Sending new session to backend: ${newSessionId}`); wsRef.current.send(JSON.stringify({ type: "create_new_session_backend", data: { id: newSessionId, name: newSessionName, timestamp: now }, sessionId: newSessionId })); } else { logger.warn("[Session] WebSocket not open. New session not sent to backend yet."); } return newSessionId; }, []);
  const addMessageToActiveSession = useCallback((messageInput: Omit<Message, 'id' | 'timestamp'>, targetSessionIdParam?: string) => { /* ... as before ... */     const targetId = targetSessionIdParam || activeSessionId; if (!targetId) { logger.error("[MessageAdd] No active/target session ID to add message to."); return; } const newMessage: Message = { ...messageInput, id: uuidv4(), timestamp: Date.now(), isOptimistic: true }; setSessions(prevSessions => prevSessions.map(session => session.id === targetId ? { ...session, messages: [...session.messages, newMessage], lastUpdatedAt: Date.now(), messagesLoaded: true } : session ).sort((a,b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))); logger.debug(`[MessageAdd] Optimistically added message to session ${targetId}: ${newMessage.sender} - "${newMessage.data.text?.substring(0,30)}..."`); }, [activeSessionId]); 
  const renameSession = useCallback((sessionIdToRename: string, newName: string) => { /* ... as before ... */     if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdToRename && newName.trim() !== "") { logger.info(`[SessionMgmt] Requesting rename for session ${sessionIdToRename} to "${newName}"`); wsRef.current.send(JSON.stringify({ type: "rename_session_request", sessionIdToRename: sessionIdToRename, newName: newName.trim(), sessionId: activeSessionId || sessionIdToRename })); } else { logger.warn("[SessionMgmt] Cannot rename session: WS not open or invalid input."); } }, [activeSessionId]);
  const deleteSession = useCallback((sessionIdToDelete: string) => { /* ... as before ... */     if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdToDelete) { logger.info(`[SessionMgmt] Requesting delete for session ${sessionIdToDelete}`); wsRef.current.send(JSON.stringify({ type: "delete_session_request", sessionIdToDelete: sessionIdToDelete, sessionId: activeSessionId || sessionIdToDelete })); } else { logger.warn("[SessionMgmt] Cannot delete session: WS not open or no session ID."); } }, [activeSessionId]);

  const sendMessage = useCallback((message: any): void => { /* ... as refined before ... */     if (wsRef.current?.readyState === WebSocket.OPEN) { let sessionIdToSend = activeSessionId; if (!sessionIdToSend) { const firstLoadedSession = sessionsRef.current.find(s => s.messagesLoaded); sessionIdToSend = firstLoadedSession?.id || sessionsRef.current[0]?.id || null; } if (!sessionIdToSend && (message.type === "set_api_key" || message.type === "update_toggle_state" || message.type === "load_sessions_request" || message.type === "config")) { sessionIdToSend = `client_temp_global_${uuidv4().substring(0,4)}`; } if (!sessionIdToSend && !["load_sessions_request", "config", "set_api_key", "update_toggle_state"].includes(message.type) ) { logger.error(`[SendMessage] No active/usable session ID available for message type: ${message.type}. Message not sent.`); return; } const messageWithSession = { ...message, sessionId: sessionIdToSend }; try { logger.debug("[WebSocket] Sending message:", messageWithSession); wsRef.current.send(JSON.stringify(messageWithSession)); } catch (error) { logger.error("Error sending message via WebSocket:", error); } } else { logger.warn("WebSocket not open. Message not sent:", message); } }, [activeSessionId]);
  const sendMediaChunk = useCallback((chunk: MediaChunk): void => { /* ... as before ... */     if (wsRef.current?.readyState === WebSocket.OPEN) { const currentSessionId = activeSessionId || sessionsRef.current[0]?.id; if (!currentSessionId) { logger.error("[SendMediaChunk] No active session ID available."); return; } const messageWithSession = { realtime_input: { media_chunks: [chunk] }, sessionId: currentSessionId }; try { wsRef.current.send(JSON.stringify(messageWithSession)); } catch (error) { logger.error("Error sending media chunk via WebSocket:", error); } } else { logger.warn("WebSocket not open. Media chunk not sent:", chunk.mime_type); } }, [activeSessionId]);

  // --- NEW: Functions to manage API Key and Toggles from UI ---
  const requestApiKeyModal = useCallback(() => {
    logger.info("[API Key] Requesting API Key Modal to be shown.");
    setShowApiKeyModalState(true);
  }, []);

  const submitApiKey = useCallback((key: string) => {
    if (!key.trim()) { alert("API Key cannot be empty."); return; }
    logger.info("[API Key] Submitting Gemini API Key to backend via WebSocket.");
    sendMessage({ type: "set_api_key", data: { service: "gemini", apiKey: key.trim() } });
    // Modal will be closed by onmessage handler on successful ACK
  }, [sendMessage]);

  const updateToggleState = useCallback((toggleName: 'gemini' | 'eval' | 'grounding', isEnabled: boolean) => {
    logger.info(`[Toggle] Requesting update for '${toggleName}' to ${isEnabled} via WebSocket.`);
    // Optimistic UI update handled by local component state in MainChatView now, 
    // this function purely sends the message.
    // The onmessage handler will update the provider's authoritative state.
    sendMessage({ type: "update_toggle_state", data: { toggleName, isEnabled } });
  }, [sendMessage]);


  const connectCallbackRef = useRef<() => void>();
  const reconnectCallbackRef = useRef<() => void>();

  const connect = useCallback((): void => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) { /* ... */ return; }
    logger.info(`[WebSocket] Attempting connection to ${url}...`);
    reconnectAttemptsRef.current = 0; 
    try {
      const ws = new WebSocket(url); wsRef.current = ws;
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) { logger.warn(`[WebSocket] Connection to ${url} timed out.`); ws.close(1000, "Connection Timeout"); } }, CONNECTION_TIMEOUT); 
      
      ws.onopen = () => {
        logger.info("[WebSocket] Connected successfully."); setIsConnected(true);
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        reconnectAttemptsRef.current = 0; 
        const storedSessionId = localStorage.getItem(LAST_ACTIVE_SESSION_ID_KEY);
        let initialSessionIdToSend = storedSessionId; 
        if (storedSessionId) { setActiveSessionIdState(storedSessionId); }
        
        const tempIdForConfig = `client_temp_cfg_${uuidv4().substring(0,4)}`;
        logger.info(`[WebSocket] Sending config. Initial session hint: ${initialSessionIdToSend || 'None'}. Current client toggles: G:${useGeminiClientToggle}, E:${evalModeClientToggle}, Gr:${groundingModeClientToggle}`);
        ws.send(JSON.stringify({ 
            type: "config", 
            data: { 
                clientReady: true, 
                initialSessionId: initialSessionIdToSend,
                // Send current client-side understanding of toggle states
                currentToggleStates: { 
                    gemini: useGeminiClientToggle, 
                    eval: evalModeClientToggle, 
                    grounding: groundingModeClientToggle 
                }
            }, 
            sessionId: initialSessionIdToSend || tempIdForConfig 
        }));
        ws.send(JSON.stringify({ type: "load_sessions_request", sessionId: initialSessionIdToSend || tempIdForConfig }));
      };
      ws.onclose = (event) => { /* ... as before ... */         logger.info(`[WebSocket] Closed: Code=${event.code}, Reason='${event.reason}', Clean=${event.wasClean}`); setIsConnected(false); if (wsRef.current === ws) wsRef.current = null; if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current); if (event.code !== 1000 && event.code !== 1005 && !event.wasClean) { logger.info("[WebSocket] Abnormal closure, attempting reconnect..."); reconnectCallbackRef.current?.(); } else { logger.info("[WebSocket] Normal closure or wasClean=true, not auto-reconnecting."); } };
      ws.onerror = (errorEvent) => { logger.error('[WebSocket] Error:', errorEvent);  };
      
      ws.onmessage = (event) => {
        try {
          const dataFromServer = JSON.parse(event.data as string);
          logger.debug("[WebSocket] Received:", dataFromServer);
          const msgSessionContextId = dataFromServer.sessionId_context || dataFromServer.session_id || activeSessionId;

          if (dataFromServer.type === "sessions_list") { /* ... as before ... */             const serverSessions = (dataFromServer.data || []) as Session[]; logger.info(`[WebSocket] Received sessions_list with ${serverSessions.length} sessions.`); setSessions(prevClientSessions => { const clientSessionMap = new Map(prevClientSessions.map(s => [s.id, s])); const mergedSessions = serverSessions.map(serverSess => { const clientSess = clientSessionMap.get(serverSess.id); return { ...serverSess, messages: clientSess?.messagesLoaded ? clientSess.messages : (serverSess.messages || []), messagesLoaded: clientSess?.messagesLoaded || false, }; }); return mergedSessions.sort((a,b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt)); }); let idToMakeActive = activeSessionId; const storedId = localStorage.getItem(LAST_ACTIVE_SESSION_ID_KEY); if (serverSessions.length > 0) { if (storedId && serverSessions.some(s => s.id === storedId)) { idToMakeActive = storedId; } else if (!idToMakeActive || !serverSessions.some(s => s.id === idToMakeActive)) { idToMakeActive = serverSessions[0].id; } } else { const currentSess = sessionsRef.current; if (!activeSessionId || !currentSess.find(s => s.id === activeSessionId)) { logger.info("[WebSocket] No sessions from server and no valid local active session. Creating new one."); const newSessId = createNewSession(); idToMakeActive = newSessId;} } if(idToMakeActive && idToMakeActive !== activeSessionId) { setActiveSessionId(idToMakeActive); }  else if (idToMakeActive && activeSessionId === idToMakeActive) {  setSessions(currentSessions => { const currentActiveSessionData = currentSessions.find(s => s.id === idToMakeActive); if (currentActiveSessionData && !currentActiveSessionData.messagesLoaded && wsRef.current?.readyState === WebSocket.OPEN) { logger.info(`[WebSocket] Messages for (already) active session ${idToMakeActive} not loaded. Requesting.`); wsRef.current.send(JSON.stringify({ type: "load_session_messages_request", sessionId_to_load: idToMakeActive, sessionId: idToMakeActive })); } return currentSessions; }); } return; }
          if (dataFromServer.type === "session_messages_data") { /* ... as before ... */             const { sessionId_loaded, messages: serverMessages } = dataFromServer; logger.info(`[WebSocket] Received ${serverMessages.length} messages for session ${sessionId_loaded}.`); setSessions(prevSessions => prevSessions.map(s => s.id === sessionId_loaded ? { ...s, messages: serverMessages.map((m: any) => ({...m, data: m.data || {text: ""}})), messagesLoaded: true, lastUpdatedAt: Date.now() } : s).sort((a,b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))); return; }
          if (dataFromServer.type === "session_renamed_ack") { /* ... as before ... */             logger.info(`[SessionMgmt] ACK: Session ${dataFromServer.sessionId} renamed to "${dataFromServer.newName}"`); setSessions(prev => prev.map(s => s.id === dataFromServer.sessionId ? { ...s, name: dataFromServer.newName, lastUpdatedAt: dataFromServer.lastUpdatedAt } : s).sort((a,b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))); return; }
          if (dataFromServer.type === "session_deleted_ack") { /* ... as before ... */             const deletedSessionId = dataFromServer.sessionId; logger.info(`[SessionMgmt] ACK: Session ${deletedSessionId} deleted`); let nextActiveSessionIdAfterDelete: string | null = null; setSessions(prev => { const remainingSessions = prev.filter(s => s.id !== deletedSessionId); if (activeSessionId === deletedSessionId) { nextActiveSessionIdAfterDelete = remainingSessions.length > 0 ? remainingSessions[0].id : null; } return remainingSessions; }); if (activeSessionId === deletedSessionId) { setTimeout(() => { if (nextActiveSessionIdAfterDelete) { setActiveSessionId(nextActiveSessionIdAfterDelete); } else { const newSessId = createNewSession(); setActiveSessionId(newSessId); }}, 0); } return; }

          // --- HANDLE NEW ACKS & ERROR FOR API KEY/TOGGLES ---
          if (dataFromServer.type === "toggle_state_update_ack") {
              const payload = dataFromServer.data || dataFromServer; 
              const { toggleName, isEnabled: backendIsEnabled, status, message: ackMessage } = payload;
              logger.info(`[WebSocket] ACK for toggle '${toggleName}': Backend state is now ${backendIsEnabled}, Status: ${status}, Msg: ${ackMessage}`);
              if (toggleName === 'gemini') setUseGeminiClientToggle(backendIsEnabled);
              else if (toggleName === 'eval') setEvalModeClientToggle(backendIsEnabled);
              else if (toggleName === 'grounding') setGroundingModeClientToggle(backendIsEnabled);
              if (status === "error") {
                  alert(`SERVER: Could not set toggle '${toggleName}'. Reason: ${ackMessage || 'Unknown error.'}`);
              }
              return; 
          }
          if (dataFromServer.type === "api_key_set_ack") {
              const payload = dataFromServer.data || dataFromServer;
              const { service, status, message: ackMessage } = payload;
              logger.info(`[WebSocket] ACK for API key set for '${service}': Status: ${status}, Msg: ${ackMessage}`);
              if (status === "success" && service === "gemini") {
                  setIsGeminiApiKeySetConfirmedByBackend(true); 
                  localStorage.setItem(GEMINI_API_KEY_ENTERED_HINT_KEY, 'true');
                  setShowApiKeyModalState(false); // Close modal on success
                  alert(`Gemini API Key successfully set and verified by server.`);
              } else if (status === "error") {
                  setIsGeminiApiKeySetConfirmedByBackend(false);
                  localStorage.removeItem(GEMINI_API_KEY_ENTERED_HINT_KEY);
                  alert(`SERVER: Failed to set/verify Gemini API Key. Reason: ${ackMessage || 'Please check the key and try again.'}`);
                  // setShowApiKeyModalState(true); // Optionally re-open modal
              }
              return; 
          }
          if (dataFromServer.type === "error" && dataFromServer.action_required === "set_gemini_api_key") {
            logger.warn("[WebSocket] Backend requires Gemini API key. Prompting user.");
            setIsGeminiApiKeySetConfirmedByBackend(false); // Mark as not set
            setShowApiKeyModalState(true); // Trigger API key modal
            // Revert toggle states locally as backend rejected them
            if (dataFromServer.rejected_toggle === "gemini") setUseGeminiClientToggle(false);
            if (dataFromServer.rejected_toggle === "eval") setEvalModeClientToggle(false);
            return;
          }
          // --- END NEW HANDLERS ---

          if (dataFromServer.interrupt) { /* ... as before ... */ logger.info('[WebSocket] Received interrupt. Stopping TTS.'); stopAndClearAudioPlayback(); return; }
          if (dataFromServer.audio && typeof dataFromServer.audio === 'string') { /* ... as before ... */             logger.debug('[WebSocket] Received TTS audio data, queuing.'); try { const audioBuffer = Base64.toUint8Array(dataFromServer.audio).buffer; if (audioBuffer.byteLength > 0 && audioBufferQueueRef.current) { audioBufferQueueRef.current.push({ data: [audioBuffer], startTimestamp: Date.now() }); } } catch (decodeError) { logger.error("[WebSocket] Error decoding/queuing TTS audio:", decodeError); } }
          
          if (dataFromServer.text_response || dataFromServer.user_transcription) { /* ... (logic for eval_response and regular messages as provided previously) ... */             const isEvalResponseType = dataFromServer.type === "eval_response"; const sender: Message['sender'] = isEvalResponseType ? 'AI_Evaluator' : (dataFromServer.text_response ? 'AI' : 'User'); const text = dataFromServer.text_response || dataFromServer.user_transcription; const messageIdFromServer = dataFromServer.id || uuidv4(); const messageTimestampFromServer = dataFromServer.timestamp || Date.now(); if (text && msgSessionContextId) { setSessions(prevSessions => prevSessions.map(s => { if (s.id === msgSessionContextId) { if (isEvalResponseType) { const newEvalMessage: Message = { id: messageIdFromServer, sender: sender, timestamp: messageTimestampFromServer, data: { text: text }, image_filename: dataFromServer.image_filename, data_type: dataFromServer.data_type || "ai_eval_response", llm_model_used: dataFromServer.llm_model_used, tts_audio_filename: dataFromServer.tts_audio_filename, isOptimistic: false }; logger.debug(`[WebSocket] Adding new EVAL message to session ${msgSessionContextId}`); return { ...s, messages: [...s.messages, newEvalMessage], lastUpdatedAt: Date.now() }; } else { const existingMsgIndex = s.messages.findIndex(m => m.id === messageIdFromServer || (m.isOptimistic && m.data.text === text && m.sender === sender)); if (existingMsgIndex !== -1) { const updatedMessages = [...s.messages]; updatedMessages[existingMsgIndex] = { ...updatedMessages[existingMsgIndex], id: messageIdFromServer || updatedMessages[existingMsgIndex].id, timestamp: messageTimestampFromServer || updatedMessages[existingMsgIndex].timestamp, isOptimistic: false, image_filename: dataFromServer.image_filename || updatedMessages[existingMsgIndex].image_filename, data_type: dataFromServer.data_type || updatedMessages[existingMsgIndex].data_type, llm_model_used: dataFromServer.llm_model_used || updatedMessages[existingMsgIndex].llm_model_used, tts_audio_filename: dataFromServer.tts_audio_filename || updatedMessages[existingMsgIndex].tts_audio_filename, }; logger.debug(`[WebSocket] Reconciled/updated message ${messageIdFromServer} in session ${msgSessionContextId}`); return { ...s, messages: updatedMessages, lastUpdatedAt: Date.now() }; } else { const newMessageFromServer: Message = { id: messageIdFromServer, sender: sender, timestamp: messageTimestampFromServer, data: { text: text }, image_filename: dataFromServer.image_filename, data_type: dataFromServer.data_type || (sender === 'AI' ? "ai_response" : "user_text_turn"), llm_model_used: dataFromServer.llm_model_used, tts_audio_filename: dataFromServer.tts_audio_filename, isOptimistic: false }; logger.debug(`[WebSocket] Adding new User/AI message to session ${msgSessionContextId}`); return { ...s, messages: [...s.messages, newMessageFromServer], lastUpdatedAt: Date.now() }; } } } return s; }).sort((a,b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt))); } else { logger.warn("[WebSocket] Received text_response/user_transcription/eval_response without text or target session ID."); } } 
            else if (dataFromServer.info || dataFromServer.error) { /* ... as before ... */             const systemMessageText = dataFromServer.info || `Error: ${dataFromServer.error}`; if (msgSessionContextId && !String(msgSessionContextId).startsWith("init_") && !String(msgSessionContextId).startsWith("client_temp_")) { addMessageToActiveSession({ sender: 'System', data: { text: systemMessageText }, isContextMessage: true }, msgSessionContextId); } else { logger.warn(`[WebSocket] System/Error message received but no valid session context: "${systemMessageText}". Displaying with alert.`); alert(`System Message: ${systemMessageText}`); } }
          else if (!dataFromServer.audio && !dataFromServer.interrupt) { /* ... as before ... */             const knownAckTypes = ["session_create_error", "session_rename_error", "session_delete_error", "api_key_set_ack", "toggle_state_update_ack"]; const knownErrorTypes = ["error"]; if (!knownAckTypes.includes(dataFromServer.type) && !knownErrorTypes.includes(dataFromServer.type)) { logger.warn("[WebSocket] Received unhandled message structure:", dataFromServer); } else { logger.debug("[WebSocket] Received known ACK/Error (not requiring direct message display), no specific UI update needed here:", dataFromServer); } }
        } catch (error) { logger.error('[WebSocket] Error handling message:', error, 'Raw data:', event.data); }
      }; 
    } catch (error) { logger.error('[WebSocket] Instantiation error:', error); reconnectCallbackRef.current?.(); }
  }, [url, stopAndClearAudioPlayback, addMessageToActiveSession, activeSessionId, createNewSession, setActiveSessionId, initAudioContext, playAudioChunkFromQueue, useGeminiClientToggle, evalModeClientToggle, groundingModeClientToggle]); // Added client toggle states to dependency for config message

  const reconnect = useCallback((): void => { /* ... as before ... */     if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); reconnectAttemptsRef.current += 1; const backoffTime = Math.min(30000, RECONNECT_TIMEOUT * Math.pow(1.5, reconnectAttemptsRef.current -1)); logger.info(`[WebSocket] Reconnecting attempt ${reconnectAttemptsRef.current} in ${backoffTime/1000}s...`); reconnectTimeoutRef.current = setTimeout(() => { if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) { logger.info("[WebSocket] Executing reconnect attempt..."); connectCallbackRef.current?.(); } else { logger.info(`[WebSocket] Reconnect attempt ${reconnectAttemptsRef.current} skipped: WS state is ${wsRef.current?.readyState}.`); } }, backoffTime); }, []);
  useEffect(() => { connectCallbackRef.current = connect; }, [connect]);
  useEffect(() => { reconnectCallbackRef.current = reconnect; }, [reconnect]);
  useEffect(() => { /* ... Audio playback queue effect as before ... */     let isPlaybackActive = false; let checkInterval: NodeJS.Timeout | undefined; const originalAudioBufferPush = audioBufferQueueRef.current?.push || Array.prototype.push; const processQueue = async () => { if (isPlaybackActive || !audioBufferQueueRef.current || audioBufferQueueRef.current.length === 0) { return; } isPlaybackActive = true; const chunksToPlayStruct = [...audioBufferQueueRef.current]; audioBufferQueueRef.current = []; const allRawBuffers: ArrayBuffer[] = chunksToPlayStruct.flatMap(chunk => chunk.data); try { if (allRawBuffers.length > 0) { await playAudioChunkFromQueue(allRawBuffers); } } catch (error) { logger.error("[Audio Playback Effect] Error during TTS playback:", error); } finally { isPlaybackActive = false; if (audioBufferQueueRef.current && audioBufferQueueRef.current.length > 0) { setTimeout(processQueue, 50); } } }; if (audioBufferQueueRef.current) { if (typeof audioBufferQueueRef.current.push === 'function' && !audioBufferQueueRef.current.push.toString().includes("originalAudioBufferPush.apply")) { audioBufferQueueRef.current.push = function(...items: AudioChunkBuffer[]): number { const result = originalAudioBufferPush.apply(this, items); if (!isPlaybackActive) { setTimeout(processQueue, 50); } return result; }; } } checkInterval = setInterval(() => { if (audioBufferQueueRef.current && audioBufferQueueRef.current.length > 0 && !isPlaybackActive) { processQueue(); } }, 250); return () => { clearInterval(checkInterval); if (audioBufferQueueRef.current && typeof audioBufferQueueRef.current.push === 'function' && audioBufferQueueRef.current.push !== originalAudioBufferPush) { audioBufferQueueRef.current.push = originalAudioBufferPush; } stopAndClearAudioPlayback(); }; }, [playAudioChunkFromQueue, stopAndClearAudioPlayback]);
  useEffect(() => { /* ... Main connect/disconnect effect as before ... */     initAudioContext(); connectCallbackRef.current?.(); return () => { logger.info("[WebSocketProvider] Unmounting. Closing WebSocket and AudioContext."); if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.onerror = null; wsRef.current.onmessage = null; wsRef.current.onopen = null; if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) { wsRef.current.close(1000, "Component unmounted"); } wsRef.current = null; } if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current); stopAndClearAudioPlayback(); if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(e => logger.error("Error closing AudioContext on unmount:", e)); audioContextRef.current = null; } }; }, [url, initAudioContext, stopAndClearAudioPlayback]); 
  useEffect(() => { if (isConnected) { reconnectAttemptsRef.current = 0; } }, [isConnected]);

  const contextValue: WebSocketContextType = useMemo(() => ({ // Explicitly type contextValue
    sendMessage, sendMediaChunk, isConnected, playbackAudioLevel, initAudioContext,
    sessions, activeSessionId, setActiveSessionId, createNewSession, addMessageToActiveSession,
    renameSession, deleteSession, 
    isGeminiApiKeySet: isGeminiApiKeySetConfirmedByBackend, 
    useGemini: useGeminiClientToggle, 
    evalMode: evalModeClientToggle, 
    groundingMode: groundingModeClientToggle,
    updateToggleState, 
    requestApiKeyModal,
  }), [
    sendMessage, sendMediaChunk, isConnected, playbackAudioLevel, initAudioContext,
    sessions, activeSessionId, setActiveSessionId, createNewSession, addMessageToActiveSession,
    renameSession, deleteSession,
    isGeminiApiKeySetConfirmedByBackend, useGeminiClientToggle, evalModeClientToggle, groundingModeClientToggle, 
    updateToggleState, requestApiKeyModal // Add new functions to dependency array
  ]);

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
      <ApiKeyModal 
            isOpen={showApiKeyModalState} 
            onClose={() => setShowApiKeyModalState(false)} 
            onSubmit={submitApiKey} 
        />
    </WebSocketContext.Provider>
  );
};