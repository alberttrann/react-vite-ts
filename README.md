
# AI-Powered Multimodal Plant Health Assistant - Frontend Client

This frontend application provides the user interface for interacting with the AI-Powered Plant Health Assistant backend. It's built using React, Vite, and TypeScript, offering a modern, responsive chat experience with support for text, image, and voice inputs.

Link to the backend WebSocket server: https://github.com/alberttrann/plantdiseaseserver

## Table of Contents

1.  [Overview](#overview)
2.  [Features](#features)
3.  [Technologies Used](#technologies-used)
4.  [Project Structure](#project-structure)
5.  [Setup and Installation](#setup-and-installation)
    *   [Prerequisites](#prerequisites)
    *   [Client Setup](#client-setup)
    *   [Configuration](#configuration)
6.  [Running the Development Server](#running-the-development-server)
7.  [Building for Production](#building-for-production)
8.  [Key Components](#key-components)
9.  [State Management](#state-management)
10. [WebSocket Communication](#websocket-communication)
11. [API Key and Toggle Management](#api-key-and-toggle-management)
12. [Troubleshooting](#troubleshooting)
13. [Future Enhancements](#future-enhancements)
14. [Backend server](#Python-based-Websocket-backend)

## 1. Overview

The client application connects to a Python-based WebSocket backend to deliver a real-time, interactive chat experience. Users can manage chat sessions, send text messages, upload images of plants, capture images via their device camera, and use voice input for queries. The UI displays conversation history, AI-generated image descriptions, AI responses (from either Gemma or Gemini), and special "Evaluation" mode responses. It also includes controls for developer/advanced features like switching AI models and managing API keys.

## 2. Features

*   **Responsive Chat Interface:** Clean and modern UI for displaying conversations.
*   **Session Management:**
    *   List, create, select, rename, and delete chat sessions.
    *   Active session messages are loaded from the backend.
    *   Last active session is remembered using `localStorage`.
*   **Multimodal Input:**
    *   Text message input.
    *   Image file uploads.
    *   Live camera capture for images.
    *   Real-time voice input (audio streamed to backend).
*   **Message Display:**
    *   Distinguishes between User, AI, System, and AI_Evaluator messages.
    *   Renders AI responses (which may contain Markdown) using `react-markdown`.
    *   Displays timestamps for messages.
    *   Optimistic UI updates for user messages.
*   **Real-time Communication:** Uses WebSockets for low-latency interaction with the backend.
*   **Audio Playback:** Plays back TTS audio responses from the backend, with visual level metering.
*   **API Key Management:**
    *   Modal dialog to prompt users for their Gemini API key.
    *   Button/interface to access API key settings.
*   **Developer Toggles:**
    *   UI switches to control backend behavior (e.g., "Use Gemini," "Eval Mode," "Grounding").
    *   Toggle states are synced with the backend.
*   **Connection Status Indication:** Shows if the WebSocket connection is active.
*   **Media Previews:** Displays previews for captured or uploaded images before sending.

## 3. Technologies Used

*   **React 18+:** Core UI library.
*   **Vite:** Build tool and development server.
*   **TypeScript:** For static typing.
*   **UI Components:**
    *   Likely **Shadcn/ui** (or similar) for pre-built components like `Button`, `Input`, `ScrollArea`, `Card`, `Switch`, `Label`, `Dialog`.
    *   **`lucide-react`:** For icons.
*   **Styling:**
    *   **Tailwind CSS:** Utility-first CSS framework.
    *   CSS Modules or global CSS (`App.css`, `index.css`).
*   **WebSocket Client:** Native Browser WebSocket API.
*   **State Management:**
    *   React Hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`).
    *   React Context API (`WebSocketContext` provided by `WebSocketProvider`).
*   **Utilities:**
    *   **`js-base64`:** For encoding media data.
    *   **`uuid`:** For generating client-side unique IDs (e.g., for optimistic messages).
    *   **`react-markdown`:** Rendering Markdown content.
*   **Audio Processing:**
    *   Web Audio API (`AudioContext`, `AudioWorkletNode`).
    *   Custom `audio-processor.js` AudioWorklet for microphone input.

## 4. Project Structure

```
multimodal-client-vite/
├── public/
│   └── worklets/
│       └── audio-processor.js  # For mic input processing
├── src/
│   ├── App.css
│   ├── App.tsx                 # Main application component, layout
│   ├── index.css
│   ├── main.tsx                # React app entry point
│   ├── vite-env.d.ts
│   ├── assets/                 # Static assets like placeholder avatars
│   ├── components/
│   │   ├── ApiKeyModal.tsx     # Modal for API key input
│   │   ├── MainChatView.tsx    # Main chat area, input controls, toggles
│   │   ├── Sidebar.tsx         # Session management UI
│   │   ├── WebSocketProvider.tsx # Manages WebSocket & global state/context
│   │   └── ui/                 # Shadcn/ui or custom base UI components
│   │       ├── button.tsx
│   │       └── ... (other ui elements)
│   ├── hooks/
│   │   └── useWebSocket.ts     # Custom hook to consume WebSocketContext
│   └── types/
│       └── index.ts            # (Or types.ts) TypeScript type definitions (Message, Session, etc.)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```
*(Adjust paths in imports if your `types.ts` is directly in `src/types/` or similar)*

## 5. Setup and Installation

### Prerequisites

*   Node.js (v18.x or newer recommended)
*   npm or yarn

### Client Setup

1.  **Navigate to the Frontend Directory:**
    ```bash
    cd react-vite-ts
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    # OR
    yarn install
    ```

3.  **Install UI Components (if using Shadcn/ui and not already done):**
    Follow Shadcn/ui documentation to add components like `button`, `input`, `scroll-area`, `card`, `switch`, `label`, `dialog`, `avatar`, `progress`.
    Example:
    ```bash
    npx shadcn@latest add button input scroll-area card switch label dialog avatar progress
    ```
    Consider adding --overwrite to suppress warnings

### Configuration

*   **WebSocket URL:** The backend WebSocket server URL is configured in `src/App.tsx`:
    ```typescript
    const WEBSOCKET_URL = "ws://127.0.0.1:9073"; 
    ```
    Adjust this if your backend runs on a different host or port.
*   **Placeholder Avatars:** Ensure placeholder avatar images (e.g., `placeholder-avatar.jpg`, `user-avatar.jpg`) are present in the `public/` directory or update paths in components if stored elsewhere.

## 6. Running the Development Server

1.  **Ensure the backend server is running.**
2.  **Start the Vite development server:**
    ```bash
    npm run dev
    # OR
    yarn dev
    ```
3.  Open your browser and navigate to the URL provided by Vite (usually `http://localhost:5173`).

## 7. Building for Production

To create an optimized production build:
```bash
npm run build
# OR
yarn build
```
The build artifacts will be placed in the `dist/` directory. These files can then be deployed to any static web hosting service.

## 8. Key Components

*   **`App.tsx`:** Root component, sets up the main layout and wraps children with `WebSocketProvider`.
*   **`WebSocketProvider.tsx`:**
    *   Manages the WebSocket connection lifecycle (connect, disconnect, reconnect).
    *   Handles incoming messages from the backend, updating shared state.
    *   Provides functions (`sendMessage`, `sendMediaChunk`, session management functions, toggle update functions, API key modal request) and state (`isConnected`, `sessions`, `activeSessionId`, toggle states, API key status) via React Context.
    *   Manages TTS audio playback queue and level metering.
    *   Renders the `ApiKeyModal`.
*   **`useWebSocket.ts`:** Custom hook for easy access to the `WebSocketContext`.
*   **`Sidebar.tsx`:** Displays the list of chat sessions and allows users to create, select, rename, and delete sessions. Also intended to host a button to open API Key settings.
*   **`MainChatView.tsx`:**
    *   The primary interaction area.
    *   Displays the messages for the active session.
    *   Provides input field for text messages.
    *   Includes buttons for image upload, camera capture, and toggling voice input.
    *   Manages local state for input fields and media capture status.
    *   Displays and manages the "Use Gemini," "Eval Mode," and "Grounding" toggles, reading their state from context and calling context functions to update them.
    *   Includes a button to request the API Key modal.
*   **`ApiKeyModal.tsx`:** A dialog for users to securely input their Gemini API key.

## 9. State Management

*   **Global/Shared State (via `WebSocketContext` in `WebSocketProvider`):**
    *   WebSocket connection status (`isConnected`).
    *   List of all chat sessions (`sessions`).
    *   Currently active session ID (`activeSessionId`).
    *   API key status (`isGeminiApiKeySetConfirmedByBackend`).
    *   Toggle states (`useGemini`, `evalMode`, `groundingMode`).
    *   Functions to interact with the backend and update shared state.
*   **Component-Local State (`useState` in individual components):**
    *   `MainChatView`: Typed message, media capture states (camera on, mic on), captured image data URL.
    *   `Sidebar`: State for inline renaming (ID of session being renamed, new name text).
    *   `ApiKeyModal`: Current value of the API key input field.

## 10. WebSocket Communication

*   All communication with the backend is handled through `WebSocketProvider`.
*   **Outgoing Messages:** Components use `sendMessage` or `sendMediaChunk` from `useWebSocket()` to send JSON payloads. The `sessionId` is typically added by the provider.
    *   `text_input`: For text messages, potentially with image data.
    *   `realtime_input`: For streaming audio chunks.
    *   `set_api_key`: To send the user's Gemini API key.
    *   `update_toggle_state`: To inform the backend of toggle changes.
    *   Session management messages (`load_sessions_request`, `create_new_session_backend`, etc.).
*   **Incoming Messages (`ws.onmessage` in `WebSocketProvider`):**
    *   Updates `sessions` list and messages.
    *   Handles `api_key_set_ack` and `toggle_state_update_ack` to update UI state and inform user.
    *   Handles `eval_response` to display enhanced answers.
    *   Processes incoming TTS audio for playback.
    *   Handles error messages from the backend.

## 11. API Key and Toggle Management

*   **API Key:**
    *   User is prompted via `ApiKeyModal` (triggered by `requestApiKeyModal` from context, which can be called from `MainChatView` if a Gemini feature is used without a key, or from a "Settings" button).
    *   Key is sent to backend via `set_api_key` message.
    *   Backend saves it to `server_settings.json`.
    *   `WebSocketProvider` updates `isGeminiApiKeySetConfirmedByBackend` state based on backend ACK.
*   **Toggles:**
    *   UI `Switch` components in `MainChatView` read their `checked` state from context (`useGemini`, `evalMode`, `groundingMode`).
    *   `onCheckedChange` calls `updateToggleState` from context.
    *   `updateToggleState` (in `WebSocketProvider`) sends message to backend.
    *   Backend updates its global toggle variable.
    *   Backend sends `toggle_state_update_ack`.
    *   `WebSocketProvider` receives ACK and updates its context states, ensuring UI reflects confirmed backend state.

## 12. Troubleshooting

*   **`useWebSocket must be used within a WebSocketProvider` Error:** Ensure the component calling `useWebSocket()` is a descendant of `<WebSocketProvider>` in `App.tsx`. Check for circular dependencies in imports.
*   **WebSocket Connection Issues:** Verify the `WEBSOCKET_URL` in `App.tsx` is correct and the backend server is running. Check browser console for WebSocket connection errors.
*   **Toggles Not Syncing:** Ensure `updateToggleState` is correctly called from `MainChatView` and that `WebSocketProvider` updates its state upon receiving `toggle_state_update_ack`.
*   **API Key Modal Not Appearing:** Check the logic that calls `requestApiKeyModal` (or directly sets `setShowApiKeyModalState` in the provider).

## 13. Future Enhancements

*   Implement the "Grounding" toggle functionality.
*   Add a dedicated "Secrets" panel in the `Sidebar` for more robust API key management (view/update).
*   More sophisticated UI feedback for API key/toggle updates (e.g., toasts instead of alerts).
*   Client-side validation for API key format (basic).
*   Displaying actual images in the chat log from `image_filename`.
*   UI for replaying TTS audio.

## 14. Python-based-Websocket-backend
[(https://github.com/alberttrann/plantdiseaseserver)]
