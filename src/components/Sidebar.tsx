// src/components/Sidebar.tsx
import React, { useState, useCallback } from 'react'; // Added useCallback
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Session } from '../types'; 
import { useWebSocket } from "../hooks/useWebSocket"; 
import { Edit3, Trash2, Check, X, Plus } from 'lucide-react'; 
import { Input } from './ui/input'; 

const logger = { // Added logger for Sidebar
    info: (...args: any[]) => console.log('[Sidebar][INFO]', ...args),
    debug: (...args: any[]) => console.debug('[Sidebar][DEBUG]', ...args),
};

const Sidebar: React.FC = () => {
  const { sessions, activeSessionId, setActiveSessionId, createNewSession, renameSession, deleteSession } = useWebSocket();
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");

  const handleStartRename = useCallback((session: Session) => {
    logger.debug(`Starting rename for session ID: ${session.id}, current name: "${session.name}"`);
    setRenamingSessionId(session.id);
    setNewSessionName(session.name);
  }, []); // No dependencies needed as it only uses args and setters

  const handleConfirmRename = useCallback(() => {
    logger.debug(`Confirming rename for ID: ${renamingSessionId}, new name: "${newSessionName}"`);
    if (renamingSessionId && newSessionName.trim() && renameSession) {
      const sessionToRename = sessions.find(s => s.id === renamingSessionId);
      if (sessionToRename && sessionToRename.name === newSessionName.trim()) {
        logger.info("New name is the same as old name. Cancelling rename operation locally.");
        setRenamingSessionId(null);
        setNewSessionName("");
        return;
      }
      logger.info(`Calling renameSession context function for ID: ${renamingSessionId} with new name: "${newSessionName.trim()}"`);
      renameSession(renamingSessionId, newSessionName.trim());
    } else {
      logger.debug("Rename confirmation conditions not met:", { renamingSessionId, newSessionName, renameSessionExists: !!renameSession });
    }
    // Reset state regardless of whether the call was made, 
    // as the backend ACK will update the session list.
    // If the call wasn't made, this just closes the input.
    setRenamingSessionId(null);
    setNewSessionName("");
  }, [renamingSessionId, newSessionName, renameSession, sessions]); // Added sessions for the name check

  const handleCancelRename = useCallback(() => {
    logger.debug(`Cancelling rename for ID: ${renamingSessionId}`);
    setRenamingSessionId(null);
    setNewSessionName("");
  }, [renamingSessionId]); // Added renamingSessionId for logging clarity

  const handleDeleteSession = useCallback((sessionId: string, sessionName: string) => {
    logger.debug(`Attempting delete for session ID: ${sessionId}, name: "${sessionName}"`);
    if (window.confirm(`Are you sure you want to delete session "${sessionName || 'this session'}"? This action cannot be undone.`)) {
      if (deleteSession) { 
        logger.info(`Calling deleteSession context function for ID: ${sessionId}`);
        deleteSession(sessionId);
      } else {
        logger.debug("deleteSession function not available from context.");
      }
    } else {
        logger.debug("User cancelled delete confirmation.");
    }
  }, [deleteSession]);

  const handleCreateNewSession = useCallback(() => {
    logger.info("Creating new session via context and setting active.");
    const newId = createNewSession(); 
    setActiveSessionId(newId); 
  }, [createNewSession, setActiveSessionId]);

  // Prevent blur from immediately cancelling if a button is clicked
  const onRenameInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Check if the relatedTarget (where focus is going) is one of the control buttons
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (relatedTarget && (relatedTarget.id === `confirm-rename-${renamingSessionId}` || relatedTarget.id === `cancel-rename-${renamingSessionId}`)) {
      // If focus is moving to a confirm/cancel button, don't cancel here. Let the button's onClick handle it.
      logger.debug("Blur to control button, not cancelling rename via blur.");
      return;
    }
    logger.debug("Rename input blurred to a non-control element, cancelling rename.");
    handleCancelRename();
  };


  return (
    <div className="flex flex-col h-full w-60 md:w-72 border-r bg-gray-50 dark:bg-gray-800 p-3 space-y-3">
      <div className="p-2">
        <h2 className="text-lg font-semibold dark:text-gray-200">Chat Sessions</h2>
      </div>
      <div className="px-2">
        <Button onClick={handleCreateNewSession} variant="outline" size="sm" className="w-full">
          <Plus size={16} className="mr-2" /> New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1 -mx-3">
        <div className="px-3 py-2 space-y-1.5">
          {sessions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No sessions yet. Click "+ New Chat".</p>
          )}
          {sessions.map((session: Session) => (
            <div 
                key={session.id} 
                className={`group w-full rounded-md flex flex-col
                            ${activeSessionId === session.id ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
            >
              {renamingSessionId === session.id ? (
                <div className="flex items-center space-x-1 p-2">
                  <Input 
                    type="text" 
                    value={newSessionName} 
                    onChange={(e) => setNewSessionName(e.target.value)} 
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault(); // Prevent form submission if any
                            handleConfirmRename();
                        }
                        if (e.key === 'Escape') {
                            handleCancelRename();
                        }
                    }}
                    className="h-8 text-sm flex-grow dark:bg-gray-600" 
                    autoFocus
                    onBlur={onRenameInputBlur} // Use the new blur handler
                  />
                  {/* Added IDs to buttons for blur check */}
                  <Button 
                    id={`confirm-rename-${session.id}`}
                    onClick={handleConfirmRename} 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7 text-green-600 hover:text-green-500"
                    aria-label="Confirm rename"
                  > <Check size={16}/> </Button>
                  <Button 
                    id={`cancel-rename-${session.id}`}
                    onClick={handleCancelRename} 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7 text-red-600 hover:text-red-500"
                    aria-label="Cancel rename"
                  > <X size={16}/> </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <Button
                    variant="ghost"
                    className={`flex-grow justify-start text-left h-auto py-2 px-2 text-sm truncate 
                                ${activeSessionId === session.id ? 'font-semibold text-primary dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}
                    onClick={() => setActiveSessionId(session.id)}
                    title={session.name}
                  >
                    <span className="truncate">
                      {session.name || `Session ${session.id.substring(0, 6)}...`}
                    </span>
                  </Button>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pr-1 flex-shrink-0">
                    <Button onClick={() => handleStartRename(session)} size="icon" variant="ghost" className="h-7 w-7 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400" title="Rename"> <Edit3 size={14}/> </Button>
                    <Button onClick={() => handleDeleteSession(session.id, session.name)} size="icon" variant="ghost" className="h-7 w-7 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400" title="Delete"> <Trash2 size={14}/> </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default Sidebar;