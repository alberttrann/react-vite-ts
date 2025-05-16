// src/components/ApiKeyModal.tsx
import React, { useState } from 'react';
import { Button } from './ui/button'; // Assuming you have these Shadcn/ui components
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from './ui/dialog'; // Assuming Dialog components

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (apiKey: string) => void; // Called when user submits the key
  currentService?: string; // e.g., "Gemini"
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSubmit, currentService = "Gemini" }) => {
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = () => {
    if (apiKey.trim()) {
      onSubmit(apiKey.trim());
      // Optionally close on submit, or let the provider close it on successful ACK
      // onClose(); 
    } else {
      alert("API Key cannot be empty.");
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="dark:text-gray-100">Set {currentService} API Key</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <p className="text-sm text-muted-foreground dark:text-gray-400">
            Please enter your {currentService} API key. This key will be stored securely by the server
            and used for AI features.
          </p>
          <Input
            id="apiKey"
            type="password" // Use password type for keys
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Your ${currentService} API Key`}
            className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose} className="dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit} className="bg-blue-500 hover:bg-blue-600 text-white">
            Submit Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApiKeyModal;