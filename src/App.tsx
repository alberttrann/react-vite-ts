// src/App.tsx
import React from "react";
import Sidebar from "./components/Sidebar";
import MainChatView from "./components/MainChatView"; 
import { WebSocketProvider } from "./components/WebSocketProvider";
import "./App.css"; 

const WEBSOCKET_URL = window.location.protocol === 'https:' 
  ? 'wss://zw70f854-9073.asse.devtunnels.ms'
  : 'ws://localhost:9073';
const App: React.FC = () => {
  return (
    <WebSocketProvider url={WEBSOCKET_URL}>
      <div className="flex h-screen overflow-hidden bg-gray-100 dark:bg-gray-900">
        {/* Sidebar takes a fixed width */}
        <Sidebar />

        {/* Main content area takes the remaining width and allows internal scrolling */}
        <main className="flex-1 overflow-y-auto">
          {/* This inner div provides padding and ensures MainChatView can expand to full height.
            MainChatView itself has h-full, so it will try to fill this div.
            The p-0 on small screens and md:p-4 for medium and up is a common responsive pattern.
          */}
          <div className="p-0 md:p-4 h-full"> 
             <MainChatView />
          </div>
        </main>
      </div>
    </WebSocketProvider>
  );
};

export default App;
