// src/components/Chat.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarImage } from "./ui/avatar";
// Import types and useWebSocket hook from its new location
import { useWebSocket } from "../hooks/useWebSocket"; // Ensure this path is correct
import { Message, Session } from '@/types'; // Or '../types' if not using alias

const Chat: React.FC = () => {
  const [inputText, setInputText] = useState("");
  const {
    sendMessage,
    sessions, 
    activeSessionId, 
    addMessageToActiveSession,
    isConnected, // <<< ADDED isConnected HERE
  } = useWebSocket();

  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeMessages: Message[] = useMemo(() => {
    if (!activeSessionId) {
      const newestSession = sessions.length > 0 ? sessions[0] : null; 
      return newestSession ? newestSession.messages : [];
    }
    // Explicitly type 'session' parameter here
    const currentSession = sessions.find((session: Session) => session.id === activeSessionId); 
    return currentSession ? currentSession.messages : [];
  }, [sessions, activeSessionId]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value);
  };

  const handleSendMessage = () => {
    if (inputText.trim() !== "" && activeSessionId && isConnected) { // Check isConnected
      const userMessageData = { text: inputText }; 
      
      addMessageToActiveSession({ sender: 'User', data: userMessageData });
      sendMessage({ type: "text_input", data: { text: inputText } });
      setInputText("");

    } else if (!activeSessionId) {
        console.warn("Cannot send message: No active session.");
    } else if (!isConnected) {
        console.warn("Cannot send message: WebSocket not connected.");
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSendMessage();
    }
  };

  useEffect(() => {
    if(activeMessages.length > 0) { 
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeMessages]);

  return (
    <div className="flex flex-col h-full border rounded-lg bg-white dark:bg-gray-800">
      <ScrollArea className="flex-1 p-4 space-y-2">
        {activeMessages.map((message: Message) => ( // Added Message type for clarity
          message.data?.text !== null && message.data.text.trim() !== "" && (
            <div
              key={message.id} 
              className={`flex ${
                message.sender === "AI" ? "justify-start" : "justify-end"
              } items-start space-x-2 my-1`}
            >
              {message.sender === "AI" && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src="/placeholder-avatar.jpg" alt="LLM Avatar" />
                </Avatar>
              )}
              <div
                className={`p-3 rounded-lg max-w-[75%] shadow-sm ${
                  message.sender === "AI"
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    : "bg-blue-500 text-white"
                }`}
              >
                {message.data.text} 
                <div className={`text-xs opacity-70 mt-1 ${message.sender === "AI" ? 'text-gray-500 dark:text-gray-400 text-left' : 'text-blue-100 text-right'}`}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {message.sender === "User" && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src="/user-avatar.jpg" alt="User Avatar" />
                </Avatar>
              )}
            </div>
          )
        ))}
        <div ref={chatEndRef} />
      </ScrollArea>

      <div className="p-4 border-t dark:border-gray-700 flex items-center space-x-2 bg-gray-50 dark:bg-gray-800">
        <Input
          type="text"
          placeholder="Type your message..."
          value={inputText}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          className="flex-1 dark:bg-gray-600 dark:text-white dark:placeholder-gray-400"
          disabled={!activeSessionId || !isConnected} // Used isConnected here
        />
        <Button 
          onClick={handleSendMessage} 
          disabled={!activeSessionId || !isConnected || inputText.trim() === ""} // Used isConnected here
        >
          Send
        </Button>
      </div>
    </div>
  );
};

export default Chat;
