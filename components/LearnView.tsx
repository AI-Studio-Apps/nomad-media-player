import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { VideoItem, Lesson } from '../types';
import { mediaResolver } from '../services/mediaResolver';
import { geminiService } from '../services/gemini';
import { dbService } from '../services/db';
import { Button } from './Button';
import { Modal, SaveLessonForm } from './Modals';
import { ArrowLeft, BookOpen, MessageSquare, Save, Sparkles, Send, Copy, Check } from 'lucide-react';

interface LearnViewProps {
  video: VideoItem;
  initialLesson?: Lesson;
  onBack: () => void;
  availableTags?: string[];
  onAddTag?: (tag: string) => void;
  onSaveComplete?: () => void;
}

export const LearnView: React.FC<LearnViewProps> = ({ 
  video, 
  initialLesson, 
  onBack, 
  availableTags, 
  onAddTag,
  onSaveComplete
}) => {
  const [activeTab, setActiveTab] = useState<'study' | 'chat'>('study');
  const [content, setContent] = useState<string>(initialLesson?.content || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Save State
  const [isSaved, setIsSaved] = useState(!!initialLesson);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll chat to bottom
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const generateStudyGuide = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await geminiService.generateLesson(video);
      setContent(result);
      // Reset save state since we have new content
      setIsSaved(false);
    } catch (e: any) {
      setError(e.message || "Failed to generate content");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatting(true);

    try {
        const geminiHistory = chatHistory.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }));

        const response = await geminiService.chatWithVideo(video, userMsg, geminiHistory);
        setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch (e) {
        setChatHistory(prev => [...prev, { role: 'model', text: "Error: Could not connect to AI." }]);
    } finally {
        setIsChatting(false);
    }
  };

  const handleSaveLesson = async (title: string, description: string, tags: string[]) => {
    if (!content) return;
    
    const lesson: Lesson = {
        title: title,
        description: description,
        category: 'General', 
        excerpt: content.slice(0, 150) + '...',
        content: content,
        videoId: video.id,
        videoUrl: video.link,
        tags: tags,
        createdAt: Date.now()
    };
    
    // If we are editing an existing lesson (initialLesson exists), we might want to update it instead of creating new
    // But for simplicity of this request ("save guide"), we'll treat it as saving the current state. 
    // If logic required update: if (initialLesson) lesson.id = initialLesson.id;
    
    await dbService.add('lessons', lesson);
    
    setIsSaved(true);
    if (onSaveComplete) onSaveComplete();
  };

  return (
    <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <div className="h-14 shrink-0 border-b border-zinc-700 flex items-center px-4 justify-between bg-zinc-900">
            <div className="flex items-center gap-4 flex-1">
                <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                    <span className="hidden sm:inline">Back</span>
                </button>
                <div className="h-6 w-px bg-zinc-700"></div>
                <h2 className="font-semibold text-white truncate max-w-md">{video.title}</h2>
            </div>

            {/* Top Right Save Button */}
            {activeTab === 'study' && content && (
                 <Button 
                    size="sm" 
                    variant={isSaved ? "secondary" : "primary"}
                    onClick={() => setIsSaveModalOpen(true)}
                    disabled={isSaved}
                >
                    {isSaved ? <Check size={16} className="mr-2" /> : <Save size={16} className="mr-2" />}
                    {isSaved ? 'Saved' : 'Save Guide'}
                </Button>
            )}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Left: Video Player */}
            <div className="flex-1 bg-black flex flex-col relative h-[40vh] lg:h-auto border-b lg:border-b-0 lg:border-r border-zinc-700">
                 <div className="flex-1 relative w-full h-full">
                    <iframe
                        className="absolute inset-0 w-full h-full"
                        src={mediaResolver.getEmbedUrl({ platform: video.platform, sourceId: video.id })}
                        title={video.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                 </div>
                 {/* Video Info Footer */}
                 <div className="p-4 bg-zinc-900 border-t border-zinc-800 text-sm text-zinc-400 hidden lg:block shrink-0">
                     <p className="line-clamp-2">{video.description}</p>
                 </div>
            </div>

            {/* Right: AI Companion */}
            <div className="w-full lg:w-[450px] bg-surface flex flex-col h-[60vh] lg:h-auto">
                {/* Tabs */}
                <div className="flex border-b border-zinc-700 shrink-0">
                    <button 
                        onClick={() => setActiveTab('study')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'study' ? 'border-primary text-white bg-zinc-800' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                    >
                        <BookOpen size={16} /> Study Guide
                    </button>
                    <button 
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'chat' ? 'border-primary text-white bg-zinc-800' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                    >
                        <MessageSquare size={16} /> Tutor Chat
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {/* STUDY TAB */}
                    {activeTab === 'study' && (
                        <div className="space-y-6 pb-20">
                            {!content && !isLoading && !error && (
                                <div className="text-center py-12">
                                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
                                        <Sparkles size={32} />
                                    </div>
                                    <h3 className="text-white font-semibold mb-2">Generate Learning Material</h3>
                                    <p className="text-zinc-400 text-sm mb-6 px-4">
                                        Use Gemini AI to analyze the video metadata and create a summary, quiz, and reflection questions.
                                    </p>
                                    <Button onClick={generateStudyGuide}>
                                        Generate Guide
                                    </Button>
                                    {!geminiService.getApiKey() && (
                                        <p className="mt-4 text-xs text-red-400">
                                            Warning: Gemini API Key not set in Settings.
                                        </p>
                                    )}
                                </div>
                            )}

                            {isLoading && (
                                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                    <p className="text-zinc-400 text-sm animate-pulse">Analyzing context...</p>
                                </div>
                            )}

                            {error && (
                                <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-300 text-sm text-center">
                                    {error}
                                    <div className="mt-2">
                                        <Button size="sm" variant="secondary" onClick={generateStudyGuide}>Retry</Button>
                                    </div>
                                </div>
                            )}

                            {content && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="prose prose-invert prose-sm max-w-none">
                                        <ReactMarkdown 
                                            components={{
                                                h1: ({node, ...props}) => <h1 className="text-xl font-bold text-primary mt-6 mb-3 pb-2 border-b border-zinc-700" {...props} />,
                                                h2: ({node, ...props}) => <h2 className="text-lg font-semibold text-white mt-5 mb-2" {...props} />,
                                                h3: ({node, ...props}) => <h3 className="text-md font-medium text-zinc-200 mt-4 mb-2" {...props} />,
                                                p: ({node, ...props}) => <p className="text-zinc-400 mb-3 leading-relaxed" {...props} />,
                                                ul: ({node, ...props}) => <ul className="list-disc ml-5 mb-4 text-zinc-300 space-y-1" {...props} />,
                                                ol: ({node, ...props}) => <ol className="list-decimal ml-5 mb-4 text-zinc-300 space-y-1" {...props} />,
                                                li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                                strong: ({node, ...props}) => <strong className="text-white font-semibold" {...props} />,
                                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-zinc-600 pl-4 py-1 my-4 text-zinc-500 italic" {...props} />,
                                            }}
                                        >
                                            {content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* CHAT TAB */}
                    {activeTab === 'chat' && (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 space-y-4 pb-4">
                                {chatHistory.length === 0 && (
                                    <div className="text-center text-zinc-500 py-8 text-sm">
                                        Ask me anything about the video!
                                    </div>
                                )}
                                {chatHistory.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                                            <ReactMarkdown 
                                                components={{
                                                    p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                                                    ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-2" {...props} />,
                                                    ol: ({node, ...props}) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                                                }}
                                            >
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                ))}
                                {isChatting && (
                                    <div className="flex justify-start">
                                        <div className="bg-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-500 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
                                            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-100"></span>
                                            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-200"></span>
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat Input (Only visible on chat tab) */}
                {activeTab === 'chat' && (
                    <div className="p-4 border-t border-zinc-700 bg-zinc-900 shrink-0">
                        <form onSubmit={handleSendMessage} className="relative">
                            <input
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-full pl-4 pr-12 py-2.5 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-zinc-500"
                                placeholder="Ask a question..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                disabled={isChatting}
                            />
                            <button 
                                type="submit"
                                disabled={!chatInput.trim() || isChatting}
                                className="absolute right-2 top-2 p-1 text-primary hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send size={18} />
                            </button>
                        </form>
                    </div>
                )}
            </div>

            {/* Save Modal */}
            <Modal 
                isOpen={isSaveModalOpen} 
                onClose={() => setIsSaveModalOpen(false)} 
                title="Save Learning Guide"
            >
                <SaveLessonForm 
                    defaultTitle={video.title}
                    onSave={handleSaveLesson}
                    onClose={() => setIsSaveModalOpen(false)}
                    availableTags={availableTags}
                    onAddTag={onAddTag}
                />
            </Modal>
        </div>
    </div>
  );
};