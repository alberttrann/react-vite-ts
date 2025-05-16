# Multimodal realtime client with Screen Share Assistant

A React-based web application that allows users to share their screen and audio with an AI assistant. The assistant provides real-time transcription and responses based on the shared content.

## Features

- Screen sharing with audio capture
- Real-time audio level visualization
- WebSocket-based communication
- Chat interface with message history
- Responsive design

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Modern web browser with screen sharing support

## Getting Started

1. Clone the repository
```bash
git clone https://github.com/yeyu2/multimodal-client-vite.git
cd multimodal-client-vite
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Set up the websocket server url
Open the App.tsx
find the line:
```
 <WebSocketProvider url="ws://0.0.0.0:9073">
```
Replace the websocket server url of your own.

4. Run the development server
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the application.
