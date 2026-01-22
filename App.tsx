
import React, { useEffect, useState } from 'react';
import { 
  Menu, Plus, Settings, List, Star, 
  ChevronRight, ChevronDown, Trash2, LogOut, Info, Edit2, Youtube, Shield, Search, Tag as TagIcon, X, ExternalLink, Bookmark, Play, AlertTriangle, Brain, BookOpen
} from 'lucide-react';
import { dbService } from './services/db';
import { cryptoService } from './services/crypto';
import { youtubeService } from './services/youtube';
import { vimeoService } from './services/vimeo';
import { dailymotionService } from './services/dailymotion';
import { proxyService, ProxyStatus } from './services/proxy';
import { geminiService } from './services/gemini';
import { mediaResolver } from './services/mediaResolver';
import { MediaItem, ViewState, Tag, VideoItem, Lesson } from './types';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { Modal, AddItemForm, RenameTagForm } from './components/Modals';
import { FeedViewer } from './components/FeedViewer';
import { SettingsPanel } from './components/SettingsPanel';
import { RandomDiscovery } from './components/RandomDiscovery';
import { LearnView } from './components/LearnView';

function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Auth Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Security State (In Memory Only)
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);

  // Data State
  const [channels, setChannels] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<MediaItem[]>([]);
  const [favorites, setFavorites] = useState<MediaItem[]>([]);
  const [watchLater, setWatchLater] = useState<MediaItem[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<ViewState>({ type: 'dashboard' });
  const [expandedSections, setExpandedSections] = useState({
    channels: false,
    playlists: false,
    favorites: false,
    tags: false,
    watchLater: false,
    lessons: false
  });
  
  // Notification State
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>('none');
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Dashboard Clock State
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modals & Editing
  const [modalType, setModalType] = useState<'channel' | 'playlist' | 'video' | null>(null);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  
  // Global Player State (for Random Video click)
  const [overlayVideo, setOverlayVideo] = useState<VideoItem | null>(null);

  // Initialize DB
  useEffect(() => {
    const init = async () => {
      try {
        await dbService.init();
        const userExists = await dbService.hasUsers();
        setHasUser(userExists);
        setIsDbReady(true);
      } catch (e) {
        console.error("DB Init Failed", e);
        setAuthError("Failed to initialize database. Please reload.");
      }
    };
    init();

    // Register Listener for Proxy Status
    proxyService.onProxyStatusChange((status) => {
        setProxyStatus(status);
    });
  }, []);

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Data on Auth and Decrypt Settings
  useEffect(() => {
    if (isAuthenticated && sessionKey) {
      loadData();
      initializeSecureServices();
    }
  }, [isAuthenticated, sessionKey]);

  const initializeSecureServices = async () => {
      if (!sessionKey) return;
      try {
          const settings = await dbService.getSettings();
          if (settings) {
              
              // 1. Initialize Nomad Proxy
              if (settings.nomadProxyKey) {
                  try {
                      const decryptedProxyKey = await cryptoService.decryptData(settings.nomadProxyKey, sessionKey);
                      proxyService.setNomadKey(decryptedProxyKey);
                  } catch (e) { console.warn("Could not decrypt Nomad Proxy Key"); }
              }
              if (settings.nomadUrl) {
                  proxyService.setNomadUrl(settings.nomadUrl);
              }

              // 2. Initialize YouTube
              if (settings.apiKey) {
                  try {
                      const decryptedKey = await cryptoService.decryptData(settings.apiKey, sessionKey);
                      youtubeService.setApiKey(decryptedKey);
                  } catch (e) { console.warn("Could not decrypt YouTube API Key"); }
              }

              // 3. Initialize Vimeo
              if (settings.vimeoToken) {
                  try {
                      const decryptedVimeo = await cryptoService.decryptData(settings.vimeoToken, sessionKey);
                      vimeoService.setToken(decryptedVimeo);
                  } catch (e) { console.warn("Could not decrypt Vimeo Token"); }
              }

              // 4. Initialize Dailymotion
              if (settings.dailymotionToken) {
                  try {
                      const decryptedDaily = await cryptoService.decryptData(settings.dailymotionToken, sessionKey);
                      dailymotionService.setToken(decryptedDaily);
                  } catch (e) { console.warn("Could not decrypt Dailymotion Token"); }
              }

              // 5. Initialize Gemini
              if (settings.geminiApiKey) {
                  try {
                      const decryptedGemini = await cryptoService.decryptData(settings.geminiApiKey, sessionKey);
                      geminiService.setApiKey(decryptedGemini);
                  } catch (e) { console.warn("Could not decrypt Gemini API Key"); }
              }
          }
      } catch (e) {
          console.error("Failed to initialize secure services", e);
      }
  };

  const loadData = async () => {
    const [chans, plays, favs, wl, lssns, tagList] = await Promise.all([
      dbService.getAll<MediaItem>('channels'),
      dbService.getAll<MediaItem>('playlists'),
      dbService.getAll<MediaItem>('favorites'),
      dbService.getAll<MediaItem>('watchLater'),
      dbService.getAll<Lesson>('lessons'),
      dbService.getAll<Tag>('tags')
    ]);
    setChannels(chans);
    setPlaylists(plays);
    setFavorites(favs);
    setWatchLater(wl);
    setLessons(lssns);
    setTags(tagList.map(t => t.name));
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (!username || !password) {
        setAuthError('Please fill in all fields');
        return;
    }

    try {
      if (hasUser) {
        // LOGIN FLOW
        const user = await dbService.getUser(username);
        if (!user) {
            setAuthError('User not found');
            return;
        }

        // 1. Derive key from input password + stored salt
        const key = await cryptoService.deriveKey(password, user.salt);
        
        // 2. Create verifier from derived key
        const verifier = await cryptoService.createVerifier(key);

        // 3. Compare with stored verifier
        if (verifier === user.verifier) {
            setSessionKey(key);
            setIsAuthenticated(true);
        } else {
            setAuthError('Invalid credentials');
        }

      } else {
        // REGISTER FLOW
        // 1. Generate Salt
        const salt = cryptoService.generateSalt();
        
        // 2. Derive Key
        const key = await cryptoService.deriveKey(password, salt);
        
        // 3. Create Verifier
        const verifier = await cryptoService.createVerifier(key);

        // 4. Store user
        await dbService.register({ username, salt, verifier });
        
        setSessionKey(key);
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error(err);
      setAuthError('Authentication failed');
    }
  };

  const handleSaveItem = async (itemData: Omit<MediaItem, 'id' | 'createdAt'>) => {
    const storeMap = {
      'channel': 'channels',
      'playlist': 'playlists',
      'video': 'favorites'
    };

    if (editingItem) {
        const updatedItem = { ...editingItem, ...itemData };
        // Determine store based on original item type, unless it's a "watchLater" UI item which uses 'video' schema but different store
        await dbService.update(storeMap[itemData.type], updatedItem);
        if ((activeView as any).item?.id === editingItem.id) {
            setActiveView({ ...activeView, item: updatedItem } as ViewState);
        }
    } else {
        const newItem = { ...itemData, createdAt: Date.now() };
        await dbService.add(storeMap[itemData.type], newItem);
    }
    loadData();
    closeModal();
  };

  const handleAddToWatchLater = async (video: VideoItem) => {
      // Check if already exists
      const exists = watchLater.some(w => w.sourceId === video.id);
      if (exists) return;

      const mediaItem: MediaItem = {
          name: video.title,
          sourceId: video.id,
          url: video.link,
          type: 'video',
          platform: video.platform,
          tags: [],
          createdAt: Date.now()
      };
      
      await dbService.add('watchLater', mediaItem);
      loadData();
  };
  
  const handleLaunchLearn = (video: VideoItem) => {
      setOverlayVideo(null); // Close overlay if open
      setActiveView({ type: 'learn', video });
  };

  const handleOpenLesson = (lesson: Lesson) => {
    // Reconstruct video item from lesson data to pass to LearnView
    const video: VideoItem = {
        id: lesson.videoId,
        title: lesson.title,
        link: lesson.videoUrl,
        // Best effort reconstruction
        pubDate: new Date(lesson.createdAt).toISOString(), 
        thumbnail: '', 
        author: 'Saved Lesson', 
        description: lesson.description || '',
        platform: 'youtube' // Default assumption if not stored
    };
    setActiveView({ type: 'learn', video, initialLesson: lesson });
  };

  const handleRenameTag = async (newName: string) => {
      if (!renamingTag) return;
      try {
          await dbService.renameTag(renamingTag, newName);
          // If viewing that tag, update view
          if (activeView.type === 'tag' && activeView.tag === renamingTag) {
              setActiveView({ type: 'tag', tag: newName });
          }
          await loadData();
          setRenamingTag(null);
      } catch (e) {
          console.error("Failed to rename tag", e);
      }
  };

  const handleEditClick = (e: React.MouseEvent, item: MediaItem) => {
      e.stopPropagation();
      setEditingItem(item);
      setModalType(item.type);
  };

  const closeModal = () => {
      setModalType(null);
      setEditingItem(null);
      setRenamingTag(null);
  };

  const handleAddTag = async (tagName: string) => {
    if (tags.includes(tagName)) return;
    await dbService.add('tags', { name: tagName });
    loadData();
  };

  const handleDelete = async (e: React.MouseEvent, type: string, id: number) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this item?')) return;

    const storeMap: Record<string, string> = {
      'channel': 'channels',
      'playlist': 'playlists',
      'video': 'favorites',
      'watch_later': 'watchLater',
      'lesson': 'lessons'
    };

    await dbService.delete(storeMap[type], id);
    
    // Reset view if we just deleted the active item
    if ((activeView as any).item?.id === id || ((activeView as any).initialLesson?.id === id)) {
        setActiveView({ type: 'dashboard' });
    }
    loadData();
  };

  const handleDeleteTag = async (e: React.MouseEvent, tag: string) => {
      e.stopPropagation();
      if (!window.confirm(`Delete tag "${tag}"? This will remove it from all items.`)) return;

      await dbService.deleteTag(tag);
      if (activeView.type === 'tag' && activeView.tag === tag) {
          setActiveView({ type: 'dashboard' });
      }
      loadData();
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUsername('');
    setPassword('');
    setSessionKey(null);
    youtubeService.setApiKey('');
    vimeoService.setToken('');
    dailymotionService.setToken('');
    proxyService.setNomadKey('');
    geminiService.setApiKey('');
    setActiveView({ type: 'dashboard' });
  };

  // Search Logic
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      if (q.trim().length > 0) {
          setActiveView({ type: 'search', query: q });
      } else {
          setActiveView({ type: 'dashboard' });
      }
  };

  const getFilteredItems = (query: string, items: MediaItem[]) => {
      const lowerQ = query.toLowerCase();
      return items.filter(item => 
          item.name.toLowerCase().includes(lowerQ) || 
          item.tags?.some(t => t.toLowerCase().includes(lowerQ))
      );
  };

  const getTaggedItems = (tag: string, items: MediaItem[]) => {
      return items.filter(item => item.tags?.includes(tag));
  };

  const formatDashboardDate = (date: Date) => {
      return date.toLocaleString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: false 
      }).replace(/,/g, '');
  };

  // Helper to convert MediaItem (from Watch Later) to VideoItem (for Player)
  const mediaItemToVideoItem = (item: MediaItem): VideoItem => ({
      id: item.sourceId,
      title: item.name,
      link: item.url,
      pubDate: new Date(item.createdAt).toISOString(),
      thumbnail: '', // Player handles loading via embed
      author: item.platform || 'Unknown',
      description: '',
      platform: item.platform || 'youtube'
  });

  if (!isDbReady) {
    return <div className="h-screen w-screen bg-background flex items-center justify-center text-zinc-400">Loading Secure Database...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface p-8 rounded-xl shadow-2xl border border-zinc-700">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Nomad Media Player</h1>
            <p className="text-zinc-400">{hasUser ? 'Welcome back' : 'Initialize your distraction-free workspace'}</p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-6">
            <Input 
              label="Username" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Enter username"
            />
            <Input 
              label="Password" 
              type="password"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Enter password"
            />
            
            {authError && <div className="text-red-400 text-sm text-center">{authError}</div>}
            
            <Button type="submit" className="w-full" size="lg">
              {hasUser ? 'Unlock' : 'Create Vault'}
            </Button>
          </form>
          
          <div className="mt-6 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 flex gap-3">
              <Shield className="text-green-500 shrink-0" size={20} />
              <p className="text-xs text-zinc-400">
                  <strong>Private & Secure:</strong> Your research and viewing habits are stored locally and encrypted. We support your right to focus without surveillance.
              </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle Learn View Separately (Full Screen)
  if (activeView.type === 'learn') {
      return (
          <LearnView 
            video={activeView.video} 
            initialLesson={activeView.initialLesson}
            onBack={() => setActiveView({ type: 'dashboard' })}
            availableTags={tags}
            onAddTag={handleAddTag}
            onSaveComplete={loadData}
          />
      );
  }

  // Generic Sidebar Item Renderer with Section Awareness
  const renderSidebarItem = (item: MediaItem, icon: React.ReactNode, section: string) => {
    // Strict Highlight Logic: Match ID AND Section
    const isActive = (activeView as any).item?.id === item.id && (activeView as any).section === section;
    const isWatchLater = section === 'watch_later';
    
    return (
        <div 
          key={item.id}
          onClick={() => setActiveView({ type: item.type as any, item, section })}
          className={`group flex items-center justify-between p-2 pl-9 rounded-md cursor-pointer text-sm transition-colors ${
            isActive 
              ? 'bg-blue-600/20 text-blue-400' 
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {icon}
            <span className="truncate">{item.name}</span>
          </div>
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            {!isWatchLater && (
                <button onClick={(e) => handleEditClick(e, item)} className="text-zinc-500 hover:text-blue-400 p-1">
                    <Edit2 size={14} />
                </button>
            )}
            <button onClick={(e) => handleDelete(e, section, item.id!)} className="text-zinc-500 hover:text-red-400 p-1">
                <Trash2 size={14} />
            </button>
          </div>
        </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-zinc-200">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 border-r border-zinc-700 bg-surface transition-all duration-300 ease-in-out flex flex-col overflow-hidden`}>
        <div 
            onClick={() => setActiveView({ type: 'dashboard' })}
            className="p-4 border-b border-zinc-700 flex items-center gap-2 cursor-pointer hover:bg-zinc-800 transition-colors"
            title="Go to Dashboard"
        >
            <div className="bg-primary p-1.5 rounded-lg">
                <List size={20} className="text-white" />
            </div>
            <span className="font-bold text-white text-lg truncate">Nomad Media Player</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Learning Guides - NEW */}
          <div>
            <button onClick={() => toggleSection('lessons')} className="w-full flex items-center justify-between p-2 text-zinc-300 hover:text-white font-medium">
              <div className="flex items-center gap-2">
                {expandedSections.lessons ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <BookOpen size={18} />
                <span>Learning Guides</span>
              </div>
            </button>
            {expandedSections.lessons && (
                <div className="space-y-0.5">
                    {lessons.map(lesson => (
                         <div 
                            key={lesson.id}
                            onClick={() => handleOpenLesson(lesson)}
                            className={`group flex items-center justify-between p-2 pl-9 rounded-md cursor-pointer text-sm transition-colors ${
                                ((activeView as any).initialLesson?.id === lesson.id)
                                ? 'bg-blue-600/20 text-blue-400' 
                                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                                <span className="truncate">{lesson.title}</span>
                            </div>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => handleDelete(e, 'lesson', lesson.id!)} className="text-zinc-500 hover:text-red-400 p-1">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {lessons.length === 0 && <div className="pl-9 p-2 text-xs text-zinc-600">No saved guides</div>}
                </div>
            )}
          </div>

          {/* Channels */}
          <div>
            <button onClick={() => toggleSection('channels')} className="w-full flex items-center justify-between p-2 text-zinc-300 hover:text-white font-medium">
              <div className="flex items-center gap-2">
                {expandedSections.channels ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Youtube size={18} />
                <span>Channels</span>
              </div>
            </button>
            {expandedSections.channels && (
              <div className="space-y-0.5">
                {channels.map(ch => renderSidebarItem(ch, <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>, 'channels'))}
                {channels.length === 0 && <div className="pl-9 p-2 text-xs text-zinc-600">No channels</div>}
              </div>
            )}
          </div>

          {/* Playlists */}
          <div>
            <button onClick={() => toggleSection('playlists')} className="w-full flex items-center justify-between p-2 text-zinc-300 hover:text-white font-medium">
              <div className="flex items-center gap-2">
                {expandedSections.playlists ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <List size={18} />
                <span>Playlists</span>
              </div>
            </button>
            {expandedSections.playlists && (
              <div className="space-y-0.5">
                {playlists.map(pl => renderSidebarItem(pl, <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>, 'playlists'))}
                {playlists.length === 0 && <div className="pl-9 p-2 text-xs text-zinc-600">No playlists</div>}
              </div>
            )}
          </div>

          {/* Favorites */}
          <div>
            <button onClick={() => toggleSection('favorites')} className="w-full flex items-center justify-between p-2 text-zinc-300 hover:text-white font-medium">
              <div className="flex items-center gap-2">
                {expandedSections.favorites ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Star size={18} />
                <span>Favorites</span>
              </div>
            </button>
            {expandedSections.favorites && (
              <div className="space-y-0.5">
                {favorites.map(fav => renderSidebarItem(fav, <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>, 'favorites'))}
                {favorites.length === 0 && <div className="pl-9 p-2 text-xs text-zinc-600">No favorites</div>}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <button onClick={() => toggleSection('tags')} className="w-full flex items-center justify-between p-2 text-zinc-300 hover:text-white font-medium">
              <div className="flex items-center gap-2">
                {expandedSections.tags ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <TagIcon size={18} />
                <span>Tags</span>
              </div>
            </button>
            {expandedSections.tags && (
              <div className="space-y-0.5">
                 {tags.map(tag => (
                   <div 
                    key={tag}
                    onClick={() => setActiveView({ type: 'tag', tag })}
                    className={`group flex items-center justify-between p-2 pl-9 rounded-md cursor-pointer text-sm transition-colors ${
                      (activeView.type === 'tag' && activeView.tag === tag)
                        ? 'bg-blue-600/20 text-blue-400' 
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                   >
                     <div className="flex items-center gap-2 truncate">
                       <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
                       <span className="truncate">{tag}</span>
                     </div>
                     <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setRenamingTag(tag); }} 
                            className="text-zinc-500 hover:text-blue-400 p-1"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button 
                            onClick={(e) => handleDeleteTag(e, tag)} 
                            className="text-zinc-500 hover:text-red-400 p-1"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                   </div>
                 ))}
                 {tags.length === 0 && <div className="pl-9 p-2 text-xs text-zinc-600">No tags</div>}
              </div>
            )}
          </div>

          {/* Watch Later - Below Tags */}
          <div>
            <button onClick={() => toggleSection('watchLater')} className="w-full flex items-center justify-between p-2 text-zinc-300 hover:text-white font-medium">
              <div className="flex items-center gap-2">
                {expandedSections.watchLater ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Bookmark size={18} />
                <span>Watch Later</span>
              </div>
              <span className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 rounded">{watchLater.length}</span>
            </button>
            {expandedSections.watchLater && (
              <div className="space-y-0.5 pb-4">
                 {watchLater.map(item => renderSidebarItem(item, <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>, 'watch_later'))}
                 {watchLater.length === 0 && <div className="pl-9 p-2 text-xs text-zinc-600">Queue is empty</div>}
              </div>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-zinc-700 space-y-2">
           <button onClick={() => setActiveView({type: 'about'})} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white w-full p-2 rounded hover:bg-zinc-800">
               <Info size={16} /> About
           </button>
           <button onClick={() => setActiveView({type: 'settings'})} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white w-full p-2 rounded hover:bg-zinc-800">
               <Settings size={16} /> Settings
           </button>
           <button onClick={logout} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 w-full p-2 rounded hover:bg-zinc-800">
               <LogOut size={16} /> Lock Vault
           </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-background relative">
        <header className="h-16 border-b border-zinc-700 bg-surface/50 backdrop-blur flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md">
              <Menu size={20} />
            </button>
            <h2 className="font-semibold text-white hidden md:block">
              {activeView.type === 'dashboard' ? 'Workspace' : activeView.type === 'about' ? 'About' : activeView.type === 'settings' ? 'Settings' : activeView.type === 'search' ? 'Search' : activeView.type === 'tag' ? `Tag: ${activeView.tag}` : (activeView as any).item?.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative mr-2 hidden sm:block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Search your library..." 
                    value={searchQuery}
                    onChange={handleSearch}
                    className="h-9 w-48 lg:w-64 rounded-md border border-zinc-700 bg-zinc-900/50 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                />
            </div>

            <Button variant="secondary" size="sm" onClick={() => setModalType('channel')}><Plus size={16} className="mr-1" /> Source</Button>
            <Button variant="secondary" size="sm" onClick={() => setModalType('playlist')}><Plus size={16} className="mr-1" /> Path</Button>
            <Button variant="secondary" size="sm" onClick={() => setModalType('video')}><Plus size={16} className="mr-1" /> Ref</Button>
          </div>
        </header>

        {/* Proxy Status Feedback */}
        {proxyStatus === 'public' && (
             <div className="bg-yellow-900/30 border-b border-yellow-900/50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-yellow-200">
                    <AlertTriangle size={16} />
                    <span>Visitor Mode: Using public proxies. Performance may be degraded. Add Nomad Key for reliability.</span>
                </div>
                <button onClick={() => setProxyStatus('none')} className="text-yellow-200/50 hover:text-yellow-200">
                    <X size={16} />
                </button>
             </div>
        )}
        {proxyStatus === 'secure' && (
             <div className="bg-green-900/20 border-b border-green-900/30 px-4 py-1 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-green-400">
                    <Shield size={12} />
                    <span>Using Nomad Proxy</span>
                </div>
             </div>
        )}

        <div className="flex-1 overflow-hidden relative overflow-y-auto">
          {activeView.type === 'dashboard' && (
            <div className="p-8 max-w-5xl mx-auto pb-20">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
                  <h1 className="text-4xl font-bold text-white">Welcome, {username}</h1>
                  <div className="text-zinc-400 text-lg mt-2 md:mt-0 font-medium">
                      {formatDashboardDate(currentDate)}
                  </div>
              </div>

              {/* Watch Later Horizontal List */}
              {watchLater.length > 0 && (
                  <div className="mb-10">
                      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                          <Bookmark size={24} className="text-blue-400" /> Watch Later
                      </h2>
                      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
                          {watchLater.slice().reverse().map(item => (
                              <div 
                                key={item.id} 
                                className="min-w-[280px] w-[280px] bg-surface rounded-xl border border-zinc-700 hover:border-blue-500 transition-all cursor-pointer overflow-hidden flex flex-col group relative"
                                onClick={() => setOverlayVideo(mediaItemToVideoItem(item))}
                              >
                                  <div className="aspect-video bg-black relative">
                                        <img 
                                            src={`https://i.ytimg.com/vi/${item.sourceId}/mqdefault.jpg`} 
                                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/320x180?text=No+Preview'; }}
                                            alt={item.name} 
                                            className="w-full h-full object-cover" 
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
                                                <Play size={24} className="text-white fill-white" />
                                            </div>
                                        </div>
                                  </div>
                                  <div className="p-3">
                                      <h3 className="font-semibold text-white text-sm line-clamp-2 mb-1">{item.name}</h3>
                                      <div className="flex items-center justify-between">
                                        <div className="flex gap-2">
                                            <span className="text-xs text-zinc-500 uppercase">{item.platform}</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleLaunchLearn(mediaItemToVideoItem(item)); }}
                                                className="text-zinc-500 hover:text-yellow-400 transition-colors"
                                                title="Learn Mode"
                                            >
                                                <Brain size={14} />
                                            </button>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDelete(e, 'watch_later', item.id!)}
                                            className="text-zinc-500 hover:text-red-400 text-xs"
                                        >
                                            Remove
                                        </button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-surface p-6 rounded-xl border border-zinc-700 hover:border-blue-500 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-500/10" onClick={() => setModalType('channel')}>
                    <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-lg flex items-center justify-center mb-4"><Youtube size={24} /></div>
                    <h3 className="text-xl font-semibold text-white mb-2">Manage Channels</h3>
                    <p className="text-zinc-400 font-semibold mb-2">Knowledge Sources</p>
                    <p className="text-zinc-400 text-sm">Follow specific educators and channels without algorithmic noise.</p>
                </div>
                <div className="bg-surface p-6 rounded-xl border border-zinc-700 hover:border-purple-500 cursor-pointer transition-all hover:shadow-lg hover:shadow-purple-500/10" onClick={() => setModalType('playlist')}>
                    <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center mb-4"><List size={24} /></div>
                    <h3 className="text-xl font-semibold text-white mb-2">Add Playlist</h3>
                    <p className="text-zinc-400 font-semibold mb-2">Curated Study Paths</p>
                    <p className="text-zinc-400 text-sm">Organize lecture series and course materials for sequential learning.</p>
                </div>
                <div className="bg-surface p-6 rounded-xl border border-zinc-700 hover:border-yellow-500 cursor-pointer transition-all hover:shadow-lg hover:shadow-yellow-500/10" onClick={() => setModalType('video')}>
                    <div className="w-12 h-12 bg-yellow-500/20 text-yellow-400 rounded-lg flex items-center justify-center mb-4"><Star size={24} /></div>
                    <h3 className="text-xl font-semibold text-white mb-2">Save Favorites</h3>
                    <p className="text-zinc-400 font-semibold mb-2">Reference Library</p>
                    <p className="text-zinc-400 text-sm">Build a personal library of key talks, tutorials, and research material.</p>
                </div>
              </div>

              {/* Random Discovery Component */}
              <RandomDiscovery 
                channels={channels} 
                onVideoClick={setOverlayVideo} 
                onBookmark={handleAddToWatchLater} 
                onLearn={handleLaunchLearn}
              />

              <div>
                  <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                      <TagIcon size={24} className="text-primary" /> Explore Topics
                  </h2>
                  <div className="flex flex-wrap gap-4">
                      {tags.map(tag => (
                          <button
                              key={tag}
                              onClick={() => setActiveView({ type: 'tag', tag })}
                              className="px-6 py-3 bg-surface hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-300 hover:text-white transition-all text-sm font-medium hover:border-zinc-500 shadow-sm"
                          >
                              #{tag}
                          </button>
                      ))}
                      {tags.length === 0 && <p className="text-zinc-500 italic">No topics defined yet.</p>}
                  </div>
              </div>
            </div>
          )}
          
          {/* ... Rest of components (Search, Tag, FeedViewer, About, Settings) ... */}
          {activeView.type === 'search' && (
             <div className="p-8 max-w-6xl mx-auto overflow-y-auto h-full pb-20">
                <h1 className="text-2xl font-bold text-white mb-6">Search Results for "{activeView.query}"</h1>
                
                <div className="space-y-8">
                    {/* Channels */}
                    <section>
                        <h2 className="text-lg font-semibold text-green-400 mb-3 flex items-center gap-2"><Youtube size={18} /> Sources</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {getFilteredItems(activeView.query, channels).map(item => (
                                <div key={item.id} onClick={() => setActiveView({ type: 'channel', item, section: 'channels' })} className="bg-surface border border-zinc-700 p-4 rounded-lg cursor-pointer hover:border-green-500 transition-colors">
                                    <h3 className="font-bold text-white">{item.name}</h3>
                                    <p className="text-xs text-zinc-500 truncate mt-1">ID: {item.sourceId}</p>
                                </div>
                            ))}
                            {getFilteredItems(activeView.query, channels).length === 0 && <p className="text-zinc-500 text-sm italic">No matching sources.</p>}
                        </div>
                    </section>
                    {/* ... Playlists & Favorites ... */}
                    <section>
                        <h2 className="text-lg font-semibold text-purple-400 mb-3 flex items-center gap-2"><List size={18} /> Study Paths</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {getFilteredItems(activeView.query, playlists).map(item => (
                                <div key={item.id} onClick={() => setActiveView({ type: 'playlist', item, section: 'playlists' })} className="bg-surface border border-zinc-700 p-4 rounded-lg cursor-pointer hover:border-purple-500 transition-colors">
                                    <h3 className="font-bold text-white">{item.name}</h3>
                                    <p className="text-xs text-zinc-500 truncate mt-1">ID: {item.sourceId}</p>
                                </div>
                            ))}
                            {getFilteredItems(activeView.query, playlists).length === 0 && <p className="text-zinc-500 text-sm italic">No matching paths.</p>}
                        </div>
                    </section>
                     <section>
                        <h2 className="text-lg font-semibold text-yellow-400 mb-3 flex items-center gap-2"><Star size={18} /> References</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {getFilteredItems(activeView.query, favorites).map(item => (
                                <div key={item.id} onClick={() => setActiveView({ type: 'video', item, section: 'favorites' })} className="bg-surface border border-zinc-700 p-4 rounded-lg cursor-pointer hover:border-yellow-500 transition-colors">
                                    <h3 className="font-bold text-white truncate">{item.name}</h3>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {item.tags?.map(t => <span key={t} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-600">#{t}</span>)}
                                    </div>
                                </div>
                            ))}
                             {getFilteredItems(activeView.query, favorites).length === 0 && <p className="text-zinc-500 text-sm italic">No matching references.</p>}
                        </div>
                    </section>
                </div>
             </div>
          )}

          {activeView.type === 'tag' && (
             <div className="p-8 max-w-6xl mx-auto overflow-y-auto h-full pb-20">
                <div className="flex items-center gap-3 mb-6">
                    <TagIcon size={24} className="text-primary" />
                    <h1 className="text-2xl font-bold text-white">Topic: <span className="text-primary">{activeView.tag}</span></h1>
                </div>
                <div className="space-y-8">
                    <section>
                        <h2 className="text-lg font-semibold text-green-400 mb-3 flex items-center gap-2"><Youtube size={18} /> Sources</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {getTaggedItems(activeView.tag, channels).map(item => (
                                <div key={item.id} onClick={() => setActiveView({ type: 'channel', item, section: 'channels' })} className="bg-surface border border-zinc-700 p-4 rounded-lg cursor-pointer hover:border-green-500 transition-colors">
                                    <h3 className="font-bold text-white">{item.name}</h3>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {item.tags?.map(t => <span key={t} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-600">#{t}</span>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                     <section>
                        <h2 className="text-lg font-semibold text-purple-400 mb-3 flex items-center gap-2"><List size={18} /> Study Paths</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {getTaggedItems(activeView.tag, playlists).map(item => (
                                <div key={item.id} onClick={() => setActiveView({ type: 'playlist', item, section: 'playlists' })} className="bg-surface border border-zinc-700 p-4 rounded-lg cursor-pointer hover:border-purple-500 transition-colors">
                                    <h3 className="font-bold text-white">{item.name}</h3>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {item.tags?.map(t => <span key={t} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-600">#{t}</span>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                     <section>
                        <h2 className="text-lg font-semibold text-yellow-400 mb-3 flex items-center gap-2"><Star size={18} /> References</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {getTaggedItems(activeView.tag, favorites).map(item => (
                                <div key={item.id} onClick={() => setActiveView({ type: 'video', item, section: 'favorites' })} className="bg-surface border border-zinc-700 p-4 rounded-lg cursor-pointer hover:border-yellow-500 transition-colors">
                                    <h3 className="font-bold text-white truncate">{item.name}</h3>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {item.tags?.map(t => <span key={t} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-600">#{t}</span>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
             </div>
          )}

          {(activeView.type === 'channel' || activeView.type === 'playlist' || activeView.type === 'video') && (
            <FeedViewer 
                item={(activeView as any).item} 
                onBookmark={handleAddToWatchLater} 
                onLearn={handleLaunchLearn}
            />
          )}

          {activeView.type === 'settings' && sessionKey && <SettingsPanel sessionKey={sessionKey} />}
          
          {activeView.type === 'about' && (
              <div className="p-8 max-w-3xl mx-auto">
                  <h1 className="text-3xl font-bold text-white mb-6">Nomad Media Player</h1>
                  <div className="prose prose-invert">
                      <p className="text-lg text-zinc-300 mb-4">Nomad Media Player is a purpose-built workspace for <strong>intentional viewing</strong> and research.</p>
                      <p className="text-zinc-400">
                        In an era of abundant information, this tool allows students and professionals to curate their own educational feeds, separating valuable learning resources from the algorithmic loops of entertainment platforms.
                      </p>
                      <p className="text-zinc-400 mt-4">
                         It fosters a proactive approach to media consumption, ensuring your time is spent on content you selected, not content suggested to you.
                      </p>
                      
                      <h3 className="text-xl font-semibold text-white mt-8 mb-4">Privacy & Security</h3>
                      <p className="text-zinc-400">
                          This application uses <strong>Client-Side Encryption</strong>. Your password is never stored. 
                          Instead, we verify a cryptographic signature derived from it. 
                          Your API Key and viewing preferences are encrypted locally using <strong>AES-GCM</strong>.
                      </p>

                      <h3 className="text-xl font-semibold text-white mt-8 mb-4">License</h3>
                      <p className="text-zinc-400">© 2026 <a href="https://github.com/AI-Studio-Apps/nomad-media-player" className="text-zinc-200 hover:text-blue-400" target="_blank" rel="noopeneer">AI Studio Apps</a> — Nuno Luciano</p>
                      <p className="text-zinc-400">Nomad Media Player is released under the MIT License.</p>
                  </div>
              </div>
          )}
        </div>
      </main>

      {/* Global Overlay Video Player for Random Discovery & Watch Later */}
      {overlayVideo && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={() => setOverlayVideo(null)}>
            <div className="w-full max-w-5xl bg-surface rounded-2xl overflow-hidden shadow-2xl border border-zinc-700 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-zinc-700 flex items-center justify-between bg-zinc-900">
                    <h3 className="font-semibold text-white truncate pr-4">{overlayVideo.title}</h3>
                    <div className="flex items-center gap-3">
                         <button
                            onClick={(e) => { setOverlayVideo(null); handleLaunchLearn(overlayVideo); }}
                            className="flex items-center gap-2 px-3 py-1 bg-yellow-900/20 text-yellow-500 rounded text-sm hover:bg-yellow-900/40"
                        >
                            <Brain size={16} /> Learn
                        </button>
                        <button 
                            onClick={(e) => handleAddToWatchLater(overlayVideo)}
                            className="text-zinc-400 hover:text-white"
                            title="Add to Watch Later"
                        >
                            <Bookmark size={20} />
                        </button>
                        <button 
                            onClick={() => setOverlayVideo(null)}
                            className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>
                <div className="aspect-video bg-black w-full">
                    <iframe
                        width="100%"
                        height="100%"
                        src={mediaResolver.getEmbedUrl({ platform: overlayVideo.platform, sourceId: overlayVideo.id })}
                        title={overlayVideo.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
                <div className="p-4 bg-zinc-900 text-sm flex justify-between items-center text-zinc-400">
                    <span>{new Date(overlayVideo.pubDate).toLocaleString()}</span>
                    <a href={overlayVideo.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white">
                        Watch on {overlayVideo.platform} <ExternalLink size={14} />
                    </a>
                </div>
            </div>
        </div>
      )}

      <Modal isOpen={!!modalType || !!renamingTag} onClose={closeModal} title={
          renamingTag ? `Rename Tag` : 
          `${editingItem ? 'Edit' : 'Add New'} ${modalType === 'channel' ? 'Channel' : modalType === 'playlist' ? 'Playlist' : 'Favorite'}`
      }>
        {modalType && (
          <AddItemForm type={modalType} onSave={handleSaveItem} onClose={closeModal} availableTags={tags} onAddTag={handleAddTag} initialData={editingItem || undefined} />
        )}
        {renamingTag && (
            <RenameTagForm oldName={renamingTag} onSave={handleRenameTag} onClose={closeModal} />
        )}
      </Modal>
    </div>
  );
}

export default App;