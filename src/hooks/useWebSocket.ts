// src/hooks/useWebSocket.ts
import { useContext } from 'react';
import { WebSocketContextType } from '../types'; // Adjust path if your types.ts is elsewhere

// Import the actual context from the provider file
import { WebSocketContext } from '../components/WebSocketProvider'; // Adjust path as needed

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    // This error will be thrown if WebSocketProvider is not an ancestor,
    // or if the context value provided by WebSocketProvider is null (which it shouldn't be if implemented correctly).
    throw new Error("useWebSocket must be used within a WebSocketProvider, or context value is null.");
  }
  return context;
};