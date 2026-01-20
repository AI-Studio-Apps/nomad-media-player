
import { MediaItem, VideoItem, Platform } from '../types';
import { youtubeService } from './youtube';
import { vimeoService } from './vimeo';
import { dailymotionService } from './dailymotion';
import { dbService } from './db';

interface DetectedSource {
    platform: Platform;
    sourceId: string;
    type: 'channel' | 'playlist' | 'video';
}

const DEFAULT_CACHE_DURATION = 8 * 60 * 60 * 1000; // 8 Hours Default

export const mediaResolver = {
    
    /**
     * Delegates the fetch request to the appropriate service plugin.
     * Implements intelligent caching to reduce API/Proxy hits.
     */
    async getVideos(item: MediaItem, forceRefresh = false): Promise<VideoItem[]> {
        
        // 1. Check Cache (skip for single videos usually, but keeping logic uniform is fine)
        if (!forceRefresh && item.cachedContent && item.lastFetched) {
            const settings = await dbService.getSettings();
            const cacheDuration = settings?.feedCacheDuration || DEFAULT_CACHE_DURATION;
            const now = Date.now();
            
            if (now - item.lastFetched < cacheDuration) {
                console.log(`[Cache Hit] Serving ${item.name} from IndexedDB`);
                return item.cachedContent;
            }
        }

        // 2. Network Fetch
        console.log(`[Network Fetch] retrieving ${item.name}`);
        const platform = item.platform || 'youtube'; // Default for legacy data
        let videos: VideoItem[] = [];

        switch (platform) {
            case 'vimeo':
                videos = await vimeoService.getVideos(item);
                break;
            case 'dailymotion':
                videos = await dailymotionService.getVideos(item);
                break;
            case 'youtube':
            default:
                videos = await youtubeService.getVideos(item);
                break;
        }

        // 3. Update Cache (Only for Channels and Playlists)
        if (videos.length > 0 && (item.type === 'channel' || item.type === 'playlist')) {
            const storeName = item.type === 'channel' ? 'channels' : 'playlists';
            // Create updated item object
            const updatedItem: MediaItem = {
                ...item,
                cachedContent: videos,
                lastFetched: Date.now()
            };
            
            // Fire and forget update to not block UI
            dbService.update(storeName, updatedItem).catch(e => console.warn("Failed to cache feed", e));
        }

        return videos;
    },

    /**
     * Parses a raw input string (URL or ID) and determines the platform and ID.
     */
    detectSource(input: string, contextType: 'channel' | 'playlist' | 'video'): DetectedSource {
        const text = input.trim();
        let url: URL;

        // Helper to check if input is a raw ID (alphanumeric/special chars, no dots/protocol)
        const isRawId = !text.includes('.') && !text.includes('://') && !text.includes(' ');

        if (isRawId) {
            return { platform: 'youtube', sourceId: text, type: contextType };
        }

        try {
            url = new URL(text.startsWith('http') ? text : `https://${text}`);
        } catch {
            return { platform: 'youtube', sourceId: text, type: contextType };
        }

        const hostname = url.hostname.replace('www.', '');
        const path = url.pathname;
        const pathParts = path.split('/').filter(p => p); // Removes empty strings, handling trailing slashes

        // --- VIMEO DETECTION ---
        if (hostname.includes('vimeo.com')) {
            // Case 1: Channel Video -> vimeo.com/channels/staffpicks/123456
            if (pathParts.includes('channels') && pathParts.length >= 3) {
                 const lastPart = pathParts[pathParts.length - 1];
                 if (!isNaN(Number(lastPart))) {
                     return { platform: 'vimeo', sourceId: lastPart, type: 'video' };
                 }
            }

            // Case 2: Standard Video -> vimeo.com/123456
            const potentialId = pathParts[pathParts.length - 1];
            if (!isNaN(Number(potentialId))) {
                return { platform: 'vimeo', sourceId: potentialId, type: 'video' };
            }

            // Case 3: Channel Collection -> vimeo.com/channels/staffpicks
            // We must explicitly store "channels/" prefix so the service knows to use the channels RSS endpoint
            if (pathParts[0] === 'channels' && pathParts.length >= 2) {
                return { platform: 'vimeo', sourceId: `channels/${pathParts[1]}`, type: 'channel' };
            }

            // Case 4: User/Profile -> vimeo.com/username
            // If it's not a video ID and not 'channels', assume User
            if (pathParts.length > 0) {
                return { platform: 'vimeo', sourceId: pathParts[0], type: 'channel' };
            }
        }

        // --- DAILYMOTION DETECTION ---
        if (hostname.includes('dailymotion.com') || hostname.includes('dai.ly')) {
            
            // 1. Video Short URL: dai.ly/x12345
            if (hostname.includes('dai.ly')) {
                return { platform: 'dailymotion', sourceId: path.slice(1), type: 'video' };
            }

            // 2. Standard Video: /video/x12345
            if (path.includes('/video/')) {
                 const id = path.split('/video/')[1].split('_')[0]; // remove slug if present
                 return { platform: 'dailymotion', sourceId: id, type: 'video' };
            }

            // 3. Playlist: /playlist/x6d14t
            if (path.includes('/playlist/')) {
                const id = path.split('/playlist/')[1].split('_')[0];
                return { platform: 'dailymotion', sourceId: id, type: 'playlist' };
            }
            
            // 4. Channel (User): /euronews-fr (Root path) or /user/euronews-fr
            const parts = path.split('/').filter(p => p);
            if (parts.length > 0) {
                // Handle legacy /user/username or modern /username
                const id = parts[0] === 'user' && parts.length > 1 ? parts[1] : parts[0];
                return { platform: 'dailymotion', sourceId: id, type: 'channel' };
            }
        }

        // --- YOUTUBE DETECTION (Fallback for standard youtube URLs) ---
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            let id = '';
            if (url.searchParams.has('v')) id = url.searchParams.get('v') || '';
            else if (path.startsWith('/embed/')) id = path.split('/embed/')[1];
            else if (hostname.includes('youtu.be')) id = path.slice(1);
            else if (path.startsWith('/shorts/')) id = path.split('/shorts/')[1];
            
            if (id) return { platform: 'youtube', sourceId: id, type: 'video' };
            
            if (url.searchParams.has('list')) {
                return { platform: 'youtube', sourceId: url.searchParams.get('list') || '', type: 'playlist' };
            }

            if (path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/@')) {
                const segments = path.split('/').filter(p => p);
                return { platform: 'youtube', sourceId: segments[segments.length - 1], type: 'channel' };
            }
        }

        // Default Fallback
        return { platform: 'youtube', sourceId: text, type: contextType };
    },

    getEmbedUrl(item: { platform?: Platform, sourceId: string }): string {
        const p = item.platform || 'youtube';
        switch (p) {
            case 'vimeo':
                return `https://player.vimeo.com/video/${item.sourceId}`;
            case 'dailymotion':
                return `https://www.dailymotion.com/embed/video/${item.sourceId}?autoplay=1`;
            case 'youtube':
            default:
                return `https://www.youtube.com/embed/${item.sourceId}?autoplay=1`;
        }
    }
};
