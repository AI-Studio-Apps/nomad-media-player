import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { MediaItem } from '../types';
import { TagInput } from './TagInput';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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

  useEffect(() => {
    if (initialData) {
        setName(initialData.name);
        setSourceInput(initialData.sourceId);
        if (initialData.tags) {
            setSelectedTags(initialData.tags);
        }
    }
  }, [initialData]);

  const extractId = (input: string): string => {
    let text = input.trim();
    
    // Handle Iframe paste
    if (text.includes('<iframe')) {
        const srcMatch = text.match(/src=["'](.*?)["']/);
        if (srcMatch) text = srcMatch[1];
    }

    try {
        const url = new URL(text);
        if (type === 'video') {
            if (url.searchParams.has('v')) return url.searchParams.get('v') || '';
            if (url.pathname.startsWith('/embed/')) {
                // Remove /embed/ and any trailing slash
                return url.pathname.replace('/embed/', '').replace(/\/$/, '');
            }
            if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
        }
        if (type === 'playlist') {
            if (url.searchParams.has('list')) return url.searchParams.get('list') || '';
        }
        if (type === 'channel') {
            if (url.pathname.startsWith('/channel/')) return url.pathname.split('/channel/')[1];
            // Handle custom URLs like /c/Username or @Handle - we can't extract ID easily without API. 
            // For now, assume user provides ID or standard channel link.
        }
        // If parsing succeeds but no specific pattern matches, return the input (might be clean ID but valid URL format somehow)
        return text; 
    } catch {
        // Not a URL, assume it is the ID
        return text;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanId = extractId(sourceInput);

    if (!cleanId) {
        alert("Could not extract a valid ID.");
        return;
    }
    
    // Construct standard web URLs for reference
    let url = '';
    if (type === 'channel') {
      url = `https://www.youtube.com/channel/${cleanId}`;
    } else if (type === 'playlist') {
      url = `https://www.youtube.com/playlist?list=${cleanId}`;
    } else {
      url = `https://www.youtube.com/watch?v=${cleanId}`;
    }

    onSave({
      name,
      sourceId: cleanId,
      url,
      type,
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
        placeholder={`My Awesome ${type === 'channel' ? 'Channel' : type === 'playlist' ? 'Playlist' : 'Video'}`}
        required
      />
      <Input 
        label={type === 'channel' ? 'Channel ID (UC...)' : type === 'playlist' ? 'Playlist ID (PL...)' : 'Video ID'} 
        value={sourceInput} 
        onChange={e => setSourceInput(e.target.value)} 
        placeholder={type === 'channel' ? "e.g. UCX6b17PVsYBQ0ip5gyeme-Q" : "Paste ID or URL"}
        required
      />
      {type === 'channel' && (
          <p className="text-xs text-zinc-500">
              Note: You must use the Channel ID (starts with UC). Custom URLs (@User) are not supported yet without an API search.
          </p>
      )}
      
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
