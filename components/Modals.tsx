
import React, { useState, useEffect } from 'react';
import { X, Globe } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { MediaItem } from '../types';
import { TagInput } from './TagInput';
import { mediaResolver } from '../services/mediaResolver';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface border border-zinc-700 w-full max-w-md rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};

interface AddItemFormProps {
  type: 'channel' | 'playlist' | 'video';
  onSave: (item: Omit<MediaItem, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  availableTags?: string[];
  onAddTag?: (tagName: string) => void;
  initialData?: MediaItem;
}

export const AddItemForm: React.FC<AddItemFormProps> = ({ 
  type, 
  onSave, 
  onClose,
  availableTags = [],
  onAddTag,
  initialData
}) => {
  const [name, setName] = useState('');
  const [sourceInput, setSourceInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
        setName(initialData.name);
        setSourceInput(initialData.sourceId); // Or URL if stored
        if (initialData.tags) {
            setSelectedTags(initialData.tags);
        }
        if (initialData.platform) {
            setDetectedPlatform(initialData.platform);
        }
    }
  }, [initialData]);

  // Live detection feedback
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSourceInput(val);
      if (val.trim()) {
          const result = mediaResolver.detectSource(val, type);
          setDetectedPlatform(result.platform);
      } else {
          setDetectedPlatform(null);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Resolve platform and clean ID
    const result = mediaResolver.detectSource(sourceInput, type);

    if (!result.sourceId) {
        alert("Could not detect a valid ID.");
        return;
    }
    
    // Construct standard web URLs for reference
    let url = sourceInput;
    if (!sourceInput.startsWith('http')) {
        // Reconstruct URL based on platform if user only pasted ID
        if (result.platform === 'youtube') url = `https://youtube.com/watch?v=${result.sourceId}`;
        if (result.platform === 'vimeo') url = `https://vimeo.com/${result.sourceId}`;
        if (result.platform === 'dailymotion') url = `https://dailymotion.com/video/${result.sourceId}`;
    }

    onSave({
      name,
      sourceId: result.sourceId,
      url,
      type: result.type, // Resolver might correct the type (e.g., user clicked Channel but pasted a Playlist URL)
      platform: result.platform,
      tags: selectedTags
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input 
        label="Name" 
        value={name} 
        onChange={e => setName(e.target.value)} 
        placeholder={`My Awesome ${type === 'channel' ? 'Source' : type === 'playlist' ? 'Path' : 'Reference'}`}
        required
      />
      
      <div className="relative">
          <Input 
            label="Source URL or ID" 
            value={sourceInput} 
            onChange={handleInputChange} 
            placeholder="Paste URL (YouTube, Vimeo, Dailymotion)..."
            required
          />
          {detectedPlatform && (
              <div className="absolute right-3 top-[34px] flex items-center gap-1 text-xs text-primary bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900">
                  <Globe size={10} />
                  <span className="capitalize">{detectedPlatform}</span>
              </div>
          )}
      </div>

      <p className="text-xs text-zinc-500">
          Supports: YouTube, Vimeo, and Dailymotion URLs.
      </p>
      
      <TagInput 
        selectedTags={selectedTags}
        availableTags={availableTags}
        onTagsChange={setSelectedTags}
        onAddTag={onAddTag}
      />

      <div className="pt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit">{initialData ? 'Update' : 'Save'}</Button>
      </div>
    </form>
  );
};

interface RenameTagFormProps {
    oldName: string;
    onSave: (newName: string) => void;
    onClose: () => void;
}

export const RenameTagForm: React.FC<RenameTagFormProps> = ({ oldName, onSave, onClose }) => {
    const [name, setName] = useState(oldName);
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && name !== oldName) {
            onSave(name.trim());
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input 
                label="Tag Name" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required
            />
            <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="submit">Rename</Button>
            </div>
        </form>
    );
};

interface SaveLessonFormProps {
    defaultTitle: string;
    onSave: (title: string, description: string, tags: string[]) => void;
    onClose: () => void;
    availableTags?: string[];
    onAddTag?: (tag: string) => void;
}

export const SaveLessonForm: React.FC<SaveLessonFormProps> = ({ 
    defaultTitle, onSave, onClose, availableTags = [], onAddTag 
}) => {
    const [title, setTitle] = useState(defaultTitle);
    const [description, setDescription] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(title.trim()) {
            onSave(title, description, selectedTags);
            onClose();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
             <Input 
                label="Lesson Title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="E.g. Notes on Quantum Mechanics"
             />
             <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Description / Metadata</label>
                <textarea 
                    className="w-full h-24 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-white"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Brief summary of what this guide covers..."
                />
             </div>

             <TagInput 
                selectedTags={selectedTags}
                availableTags={availableTags}
                onTagsChange={setSelectedTags}
                onAddTag={onAddTag}
            />

            <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="submit">Save Guide</Button>
            </div>
        </form>
    );
};