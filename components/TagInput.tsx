import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface TagInputProps {
  selectedTags: string[];
  availableTags: string[];
  onTagsChange: (tags: string[]) => void;
  onAddTag?: (newTag: string) => void;
}

export const TagInput: React.FC<TagInputProps> = ({
  selectedTags,
  availableTags,
  onTagsChange,
  onAddTag
}) => {
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleCreateTag = () => {
    if (newTagName.trim() && onAddTag) {
        onAddTag(newTagName.trim());
        onTagsChange([...selectedTags, newTagName.trim()]);
        setNewTagName('');
        setIsAddingTag(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-300">Tags</label>
      <div className="flex flex-wrap gap-2 items-center">
        {availableTags.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              selectedTags.includes(tag) 
                ? 'bg-primary border-primary text-white' 
                : 'bg-transparent border-zinc-600 text-zinc-400 hover:border-zinc-400'
            }`}
          >
            {tag}
          </button>
        ))}
        
        {/* Add New Tag UI */}
        {onAddTag && !isAddingTag && (
            <button
                type="button"
                onClick={() => setIsAddingTag(true)}
                className="px-3 py-1 rounded-full text-xs font-medium border border-zinc-600 border-dashed text-zinc-400 hover:text-white hover:border-zinc-400 flex items-center gap-1"
            >
                <Plus size={10} /> New
            </button>
        )}

        {onAddTag && isAddingTag && (
            <div className="flex items-center gap-1">
                <input 
                    className="h-6 w-24 bg-zinc-900 border border-zinc-700 rounded px-2 text-xs text-white focus:outline-none focus:border-primary"
                    placeholder="Tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                        if(e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateTag();
                        }
                    }}
                    autoFocus
                />
                <button 
                    type="button"
                    onClick={handleCreateTag}
                    className="p-1 bg-primary text-white rounded hover:bg-blue-600"
                >
                    <Plus size={12} />
                </button>
                <button 
                    type="button"
                    onClick={() => setIsAddingTag(false)}
                    className="p-1 text-zinc-400 hover:text-white"
                >
                    <X size={12} />
                </button>
            </div>
        )}
      </div>
    </div>
  );
};
