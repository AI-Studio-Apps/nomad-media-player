
import React, { useEffect, useState } from 'react';
import { Sparkles, Play, RotateCcw, Clock } from 'lucide-react';
import { MediaItem, VideoItem } from '../types';
import { dbService } from '../services/db';
import { youtubeService } from '../services/youtube';

interface RandomDiscoveryProps {
  channels: MediaItem[];
  onVideoClick: (video: VideoItem) => void;
}

const CACHE_DURATION_MS = 8 * 60 * 60 * 1000; // 8 Hours

export const RandomDiscovery: React.FC<RandomDiscoveryProps> = ({ channels, onVideoClick }) => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    loadContent();
  }, [channels]); // Reload if channels change, though mostly we rely on DB cache

  const loadContent = async (forceRefresh = false) => {
    if (channels.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Check Cache
      const settings = await dbService.getSettings();
      const cache = settings?.dashboardCache;
      const now = Date.now();

      if (!forceRefresh && cache && cache.videos.length > 0 && (now - cache.timestamp < CACHE_DURATION_MS)) {
        setVideos(cache.videos);
        setLastUpdated(cache.timestamp);
        setLoading(false);
        return;
      }

      // 2. Refresh Content (Fetch Logic)
      // Pick 3 random channels
      const shuffled = [...channels].sort(() => 0.5 - Math.random());
      const selectedChannels = shuffled.slice(0, 3);

      const newVideos: VideoItem[] = [];

      // Fetch 1 video from each selected channel
      // We process sequentially to be gentle on rate limits, or parallel for speed. Parallel is fine here.
      await Promise.all(selectedChannels.map(async (channel) => {
        try {
          const channelVideos = await youtubeService.getVideos(channel);
          if (channelVideos.length > 0) {
            newVideos.push(channelVideos[0]); // Take the latest
          }
        } catch (e) {
          console.warn(`Failed to fetch discovery for ${channel.name}`, e);
        }
      }));

      // 3. Update Cache in DB
      if (newVideos.length > 0) {
        const updatedSettings = {
          ...(settings || {}),
          dashboardCache: {
            timestamp: now,
            videos: newVideos
          }
        };
        await dbService.saveSettings(updatedSettings);
        
        setVideos(newVideos);
        setLastUpdated(now);
      } else if (cache?.videos) {
         // If fetch failed but we had old cache, keep old cache
         setVideos(cache.videos);
      }

    } catch (e) {
      console.error("Discovery error", e);
    } finally {
      setLoading(false);
    }
  };

  if (channels.length === 0) return null;

  return (
    <div className="mt-12 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
            <Sparkles className="text-yellow-400" size={24} />
            <h2 className="text-2xl font-bold text-white">Latest from your Sources</h2>
        </div>
        <div className="flex items-center gap-4">
             {lastUpdated && (
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Clock size={12} />
                    <span>Updated {new Date(lastUpdated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
             )}
            <button 
                onClick={() => loadContent(true)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-primary transition-colors"
                title="Force refresh (uses API quota)"
            >
                <RotateCcw size={14} /> Refresh
            </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {[1, 2, 3].map(i => (
             <div key={i} className="h-48 rounded-xl bg-surface border border-zinc-700 animate-pulse"></div>
           ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div 
                key={video.id} 
                className="group relative h-48 rounded-xl overflow-hidden cursor-pointer shadow-lg border border-zinc-700 hover:border-zinc-500 transition-all"
                onClick={() => onVideoClick(video)}
            >
              <img 
                src={video.thumbnail} 
                alt={video.title} 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              
              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 flex flex-col justify-end">
                <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                    <h3 className="text-white font-semibold line-clamp-2 text-sm mb-1">{video.title}</h3>
                    <p className="text-zinc-400 text-xs flex items-center gap-1">
                        {video.author}
                    </p>
                </div>
              </div>

              {/* Play Button Overlay */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20 backdrop-blur-[1px]">
                  <div className="bg-white/20 p-3 rounded-full backdrop-blur-md">
                      <Play fill="white" className="text-white" size={24} />
                  </div>
              </div>
            </div>
          ))}
          {videos.length === 0 && (
              <div className="col-span-3 text-center p-8 bg-surface rounded-xl border border-zinc-800 text-zinc-500 text-sm">
                  Add more channels and configure your API Key in settings to see random discoveries here.
              </div>
          )}
        </div>
      )}
    </div>
  );
};
