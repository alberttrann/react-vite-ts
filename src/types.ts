// src/types.ts

export interface MessageData {
  text: string | null;
}

export interface Message {
  id: string;
  sender: 'User' | 'AI' | 'System' | 'AI_Evaluator'; // Ensure 'AI_Evaluator' is here
  timestamp: number;
  data: MessageData;

  image_filename?: string | null;
  tts_audio_filename?: string | null;
  data_type?: 'text' | 'image_query' | 'image_context_set' | 'ai_response' | 'system_info' | 'error' | 'ai_eval_response'; // Ensure 'ai_eval_response' is here
  llm_model_used?: string | null;

  isOptimistic?: boolean;
  isContextMessage?: boolean;
}

export interface Session {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  lastUpdatedAt?: number;
  messagesLoaded?: boolean; 
}

export interface MediaChunk {
  mime_type: string;
  data: string; 
}

export interface AudioChunkBuffer {
  data: ArrayBuffer[];
  startTimestamp: number;
}

export interface WebSocketContextType {
  sendMessage: (message: any) => void;
  sendMediaChunk: (chunk: MediaChunk) => void;
  isConnected: boolean;
  playbackAudioLevel: number;
  initAudioContext: () => AudioContext | null;
  
  sessions: Session[];
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  createNewSession: () => string; 
  addMessageToActiveSession: (message: Omit<Message, 'id' | 'timestamp'>, targetSessionId?: string) => void;
  
  renameSession?: (sessionId: string, newName: string) => void;
  deleteSession?: (sessionId: string) => void;
  
  editAndResendMessage?: (sessionId: string, messageId: string, newText: string) => void;

  // --- NEW FOR TOGGLES & API KEY ---
  isGeminiApiKeySet: boolean; // True if backend has confirmed key / or frontend hint
  useGemini: boolean;
  evalMode: boolean;
  groundingMode: boolean;
  updateToggleState: (toggleName: 'gemini' | 'eval' | 'grounding', isEnabled: boolean) => void;
  requestApiKeyModal: () => void; // To programmatically open the modal
  // --- END NEW ---
}