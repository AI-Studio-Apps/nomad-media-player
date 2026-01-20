
import { dbService } from './db';
import { MediaItem, VideoItem } from '../types';
import { proxyService } from './proxy';

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
        // Fallback to proxy immediately if no key
        if (!MEMORY_API_KEY) {
            throw new Error('No API Key'); // Handled by caller to switch strategies
        }
        
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
     * Implements "API First, RSS Proxy Fallback" strategy.
     */
    async getVideos(item: MediaItem): Promise<VideoItem[]> {
        
        // Strategy 1: Official API (If Key exists)
        if (MEMORY_API_KEY) {
            try {
                return await this.fetchViaApi(item);
            } catch (apiError: any) {
                console.warn('YouTube API failed, falling back to RSS.', apiError.message);
                // Fallthrough to RSS
            }
        }

        // Strategy 2: RSS Feed via Proxy (Fallback)
        try {
            return await this.fetchViaRSS(item);
        } catch (rssError: any) {
            console.error('YouTube RSS Fallback failed', rssError);
            throw new Error('Failed to load content via API or RSS Proxy.');
        }
    },

    async fetchViaApi(item: MediaItem): Promise<VideoItem[]> {
        let playlistId = item.sourceId; // Default for playlists

        if (item.type === 'channel') {
             // Optimization: Use cached uploadsPlaylistId if available
             if (item.uploadsPlaylistId) {
                playlistId = item.uploadsPlaylistId;
            } else {
                // Lazy Load: Fetch it, save it, use it.
                const uploadsId = await this.getChannelUploadsId(item.sourceId);
                await dbService.update('channels', { ...item, uploadsPlaylistId: uploadsId });
                playlistId = uploadsId;
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
        
        if (!res.ok) throw new Error('YouTube API Error');

        const data = await res.json();
        const validItems = data.items.filter((i: any) => i.snippet.title !== 'Private video' && i.snippet.title !== 'Deleted video');
        return validItems.map(this.mapApiPlaylistItemToItem);
    },

    async fetchViaRSS(item: MediaItem): Promise<VideoItem[]> {
        let rssUrl = '';

        if (item.type === 'channel') {
            rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${item.sourceId}`;
        } else if (item.type === 'playlist') {
            rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${item.sourceId}`;
        } else {
             // Single Video fallback isn't great via RSS, but we can try scraping oEmbed or just return basic info
             return [{
                 id: item.sourceId,
                 title: item.name,
                 thumbnail: `https://i.ytimg.com/vi/${item.sourceId}/hqdefault.jpg`,
                 pubDate: new Date().toISOString(),
                 author: 'YouTube',
                 description: 'Preview via RSS unavailable for single videos.',
                 link: `https://www.youtube.com/watch?v=${item.sourceId}`,
                 platform: 'youtube'
             }];
        }

        const text = await proxyService.fetchText(rssUrl);
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "text/xml");
        const entries = Array.from(xml.getElementsByTagName("entry"));

        return entries.map(entry => {
            const getTag = (name: string) => {
                 return entry.getElementsByTagName(name)[0]?.textContent || 
                        entry.getElementsByTagNameNS("*", name)[0]?.textContent || "";
            };
            
            const videoId = getTag("yt:videoId");
            const title = getTag("title");
            const published = getTag("published");
            const author = getTag("name");
            const description = getTag("media:description");
            const thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

            return {
                id: videoId,
                title,
                thumbnail,
                pubDate: published,
                author,
                description,
                link: `https://www.youtube.com/watch?v=${videoId}`,
                platform: 'youtube'
            };
        });
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
            link: `https://www.youtube.com/watch?v=${snippet.resourceId.videoId}`,
            platform: 'youtube'
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
            link: `https://www.youtube.com/watch?v=${apiItem.id}`,
            platform: 'youtube'
        };
    }
}
