
import React, { useEffect, useState } from 'react';
import { ExternalLink, Play, Clock, User, X, Bookmark, Check, RotateCcw, Brain } from 'lucide-react';
import { MediaItem, VideoItem } from '../types';
import { mediaResolver } from '../services/mediaResolver';

interface FeedViewerProps {
  item: MediaItem;
  onBookmark?: (video: VideoItem) => void;
  onLearn?: (video: VideoItem) => void;
}

export const FeedViewer: React.FC<FeedViewerProps> = ({ item, onBookmark, onLearn }) => {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [lastFetchedTime, setLastFetchedTime] = useState<number | null>(null);

  useEffect(() => {
    setActiveVideo(null);
    setItems([]);
    setLastFetchedTime(item.lastFetched || null);
    
    // Initial load (uses cache if available)
    loadContent(false);
  }, [item]);

  const loadContent = async (forceRefresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const videoItems = await mediaResolver.getVideos(item, forceRefresh);
        setItems(videoItems);
        if (forceRefresh) {
            setLastFetchedTime(Date.now());
        }
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Failed to load content.');
      } finally {
        setLoading(false);
      }
  };

  const handleBookmark = (e: React.MouseEvent, vid: VideoItem) => {
      e.stopPropagation();
      if (onBookmark) {
          onBookmark(vid);
          setBookmarkedIds(prev => new Set(prev).add(vid.id));
      }
  };

  const handleLearn = (e: React.MouseEvent, vid: VideoItem) => {
    e.stopPropagation();
    if (onLearn) {
        onLearn(vid);
    }
  };

  // 1. Single Video View (Reference/Favorite)
  if (item.type === 'video') {
      const displayItem: VideoItem = items[0] || {
          id: item.sourceId,
          title: item.name,
          description: '',
          platform: item.platform || 'youtube',
          link: item.url,
          pubDate: new Date(item.createdAt).toISOString(),
          thumbnail: '',
          author: item.platform || 'Unknown'
      };

    return (
      <div className="w-full max-w-4xl mx-auto mt-8 p-4">
        <div className="flex items-center gap-2 mb-4">
             <h2 className="text-2xl font-bold text-white">{displayItem.title}</h2>
             <span className="text-xs uppercase bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">{displayItem.platform}</span>
        </div>
        
        <div className="aspect-video w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-700 relative">
          <iframe
            width="100%"
            height="100%"
            src={mediaResolver.getEmbedUrl({ platform: displayItem.platform, sourceId: displayItem.id })}
            title={item.name}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
                {item.tags?.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-zinc-800 text-blue-400 rounded-full text-xs border border-zinc-700">
                        #{tag}
                    </span>
                ))}
            </div>
            
            <div className="flex items-center gap-4">
                {onLearn && (
                    <button 
                        onClick={(e) => handleLearn(e, displayItem)}
                        className="flex items-center gap-2 px-3 py-2 bg-yellow-900/30 text-yellow-500 rounded border border-yellow-900/50 hover:bg-yellow-900/50 transition-colors text-sm"
                    >
                        <Brain size={16} /> Learn Mode
                    </button>
                )}
                <a 
                    href={displayItem.link || item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                    <ExternalLink size={14} />
                    Open on {displayItem.platform}
                </a>
            </div>
        </div>
        {items[0]?.description && (
            <div className="mt-8 p-4 bg-surface rounded-lg border border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">Description</h3>
                <p className="text-sm text-zinc-400 whitespace-pre-wrap">{items[0].description.slice(0, 300)}...</p>
            </div>
        )}
      </div>
    );
  }

  // 2. Feed View (Channels & Playlists)
  return (
    <div className="w-full h-full overflow-y-auto p-6 relative">
      <div className="flex items-center justify-between mb-8">
        <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">{item.name}</h1>
            <div className="flex gap-2 items-center">
                <span className="capitalize px-2 py-1 bg-zinc-800 text-zinc-400 text-xs rounded border border-zinc-700">{item.platform || 'youtube'}</span>
                {item.type === 'channel' && <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded border border-green-900">Source</span>}
                {item.type === 'playlist' && <span className="px-2 py-1 bg-purple-900/50 text-purple-400 text-xs rounded border border-purple-900">Path</span>}
                {lastFetchedTime && (
                    <span className="text-xs text-zinc-500 ml-2">
                        Cached: {new Date(lastFetchedTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                )}
            </div>
        </div>
        
        <button 
            onClick={() => loadContent(true)}
            className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm transition-colors text-zinc-300 hover:text-white"
            title="Force Refresh from Network"
            disabled={loading}
        >
            <RotateCcw size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {loading && items.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => (
                <div key={i} className="animate-pulse bg-surface rounded-xl h-64 border border-zinc-700"></div>
            ))}
        </div>
      )}

      {error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 border border-red-900/50 bg-red-900/10 rounded-xl text-center">
            <div className="text-red-400 mb-2 font-semibold">Error Loading Feed</div>
            <div className="text-red-200 text-sm max-w-md">{error}</div>
            {error.includes('API Key') && (
                <div className="mt-4 text-xs text-zinc-400">Go to Settings to configure your YouTube API Key.</div>
            )}
        </div>
      )}

      {/* Render Items (either from cache or network) */}
      {(items.length > 0) && (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
          {items.map((vid) => (
            <div key={vid.id} className="group bg-surface rounded-xl overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-all hover:shadow-xl hover:shadow-blue-900/10 flex flex-col relative">
              
              <div 
                className="aspect-video bg-black relative overflow-hidden cursor-pointer"
                onClick={() => setActiveVideo(vid)}
              >
                {vid.thumbnail ? (
                    <img 
                    src={vid.thumbnail} 
                    alt={vid.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                        <Play size={32} />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                        className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors transform scale-90 group-hover:scale-100 duration-300"
                    >
                        <Play size={32} fill="currentColor" />
                    </button>
                </div>
              </div>

              <div className="p-4 flex flex-col flex-grow">
                <h3 
                    className="font-semibold text-white mb-2 line-clamp-2 leading-snug group-hover:text-primary transition-colors cursor-pointer"
                    onClick={() => setActiveVideo(vid)}
                >
                  {vid.title}
                </h3>
                
                <div className="mt-auto pt-4 space-y-2">
                    <div className="flex items-center text-xs text-zinc-400 gap-2">
                        <User size={12} />
                        <span className="truncate">{vid.author}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                        <div className="flex items-center gap-2">
                            <Clock size={12} />
                            <span>{new Date(vid.pubDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {onLearn && (
                                <button
                                    onClick={(e) => handleLearn(e, vid)}
                                    className="text-zinc-500 hover:text-yellow-400 transition-colors"
                                    title="Learn Mode"
                                >
                                    <Brain size={16} />
                                </button>
                            )}
                            {onBookmark && (
                                <button 
                                    onClick={(e) => handleBookmark(e, vid)}
                                    className={`transition-colors ${bookmarkedIds.has(vid.id) ? 'text-green-400' : 'text-zinc-500 hover:text-white'}`}
                                    title="Watch Later"
                                >
                                    {bookmarkedIds.has(vid.id) ? <Check size={16} /> : <Bookmark size={16} />}
                                </button>
                            )}
                            <a 
                                href={vid.link} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                                title="Open in new tab"
                            >
                                <ExternalLink size={16} />
                            </a>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {!loading && !error && items.length === 0 && (
        <div className="text-center text-zinc-500 py-12">
            No videos found.
        </div>
      )}

      {/* In-App Player Overlay */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={() => setActiveVideo(null)}>
            <div className="w-full max-w-5xl bg-surface rounded-2xl overflow-hidden shadow-2xl border border-zinc-700 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-zinc-700 flex items-center justify-between bg-zinc-900">
                    <h3 className="font-semibold text-white truncate pr-4">{activeVideo.title}</h3>
                    <div className="flex items-center gap-2">
                        {onLearn && (
                            <button
                                onClick={() => { setActiveVideo(null); if(onLearn) onLearn(activeVideo); }}
                                className="flex items-center gap-2 px-3 py-1 bg-yellow-900/20 text-yellow-500 rounded text-sm hover:bg-yellow-900/40"
                            >
                                <Brain size={16} /> Learn
                            </button>
                        )}
                        <button 
                            onClick={() => setActiveVideo(null)}
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
                        src={mediaResolver.getEmbedUrl({ platform: activeVideo.platform, sourceId: activeVideo.id })}
                        title={activeVideo.title}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
                <div className="p-4 bg-zinc-900 text-sm flex justify-between items-center text-zinc-400">
                    <span>{new Date(activeVideo.pubDate).toLocaleString()}</span>
                    <div className="flex gap-4">
                        {onBookmark && (
                             <button 
                                onClick={(e) => handleBookmark(e, activeVideo)}
                                className={`flex items-center gap-2 hover:text-white ${bookmarkedIds.has(activeVideo.id) ? 'text-green-400' : ''}`}
                            >
                                {bookmarkedIds.has(activeVideo.id) ? <Check size={14} /> : <Bookmark size={14} />} Watch Later
                            </button>
                        )}
                        <a href={activeVideo.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white">
                            Watch on {activeVideo.platform} <ExternalLink size={14} />
                        </a>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
