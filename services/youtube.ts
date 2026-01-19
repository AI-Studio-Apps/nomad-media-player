import { dbService } from './db';
import { MediaItem, VideoItem } from '../types';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// The API key is now held in memory here after decryption, not fetched from DB directly on every call
let MEMORY_API_KEY: string | null = null;

export const youtubeService = {
    
    setApiKey(key: string) {
        MEMORY_API_KEY = key;
    },

    getApiKey(): string | null {
        return MEMORY_API_KEY;
    },

    /**
     * Resolves the 'Uploads' playlist ID for a given Channel ID.
     */
    async getChannelUploadsId(channelId: string): Promise<string> {
        if (!MEMORY_API_KEY) throw new Error('YouTube API Key is missing or locked. Please go to Settings.');
        
        const res = await fetch(`${BASE_URL}/channels?part=contentDetails&id=${channelId}&key=${MEMORY_API_KEY}`);
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || 'Failed to fetch channel details');
        }

        const data = await res.json();
        if (!data.items?.[0]) throw new Error('Channel not found');
        return data.items[0].contentDetails.relatedPlaylists.uploads;
    },

    /**
     * Main fetcher for UI. Handles Channels (via Uploads ID), Playlists, and Single Videos.
     */
    async getVideos(item: MediaItem): Promise<VideoItem[]> {
        if (!MEMORY_API_KEY) throw new Error('YouTube API Key is missing or locked. Please go to Settings.');
        
        let playlistId = item.sourceId; // Default for playlists

        if (item.type === 'channel') {
            // Optimization: Use cached uploadsPlaylistId if available
            if (item.uploadsPlaylistId) {
                playlistId = item.uploadsPlaylistId;
            } else {
                // Lazy Load: Fetch it, save it, use it.
                try {
                    const uploadsId = await this.getChannelUploadsId(item.sourceId);
                    
                    // Update DB silently to cache this for next time
                    await dbService.update('channels', { ...item, uploadsPlaylistId: uploadsId });
                    
                    playlistId = uploadsId;
                } catch (e) {
                    console.error("Failed to resolve channel uploads ID", e);
                    throw e;
                }
            }
        } else if (item.type === 'video') {
             // Handle single video fetch directly
             const res = await fetch(`${BASE_URL}/videos?part=snippet,statistics&id=${item.sourceId}&key=${MEMORY_API_KEY}`);
             if (!res.ok) throw new Error('Failed to fetch video details');
             const data = await res.json();
             return data.items.map(this.mapApiVideoToItem);
        }

        // Fetch Playlist Items (Limit 50)
        const res = await fetch(`${BASE_URL}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${MEMORY_API_KEY}`);
        
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || 'YouTube API Error');
        }

        const data = await res.json();
        
        // Filter out private/deleted videos which sometimes appear without thumbnails
        const validItems = data.items.filter((i: any) => i.snippet.title !== 'Private video' && i.snippet.title !== 'Deleted video');
        
        return validItems.map(this.mapApiPlaylistItemToItem);
    },

    mapApiPlaylistItemToItem(apiItem: any): VideoItem {
        const snippet = apiItem.snippet;
        return {
            id: snippet.resourceId.videoId,
            title: snippet.title,
            thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
            pubDate: snippet.publishedAt,
            author: snippet.channelTitle,
            description: snippet.description,
            link: `https://www.youtube.com/watch?v=${snippet.resourceId.videoId}`
        };
    },

    mapApiVideoToItem(apiItem: any): VideoItem {
        const snippet = apiItem.snippet;
        return {
            id: apiItem.id,
            title: snippet.title,
            thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || '',
            pubDate: snippet.publishedAt,
            author: snippet.channelTitle,
            description: snippet.description,
            link: `https://www.youtube.com/watch?v=${apiItem.id}`
        };
    }
}