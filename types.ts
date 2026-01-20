
export interface UserAuth {
  username: string;
  salt: string; // Base64 encoded random salt
  verifier: string; // Base64 encoded hash of the derived key (to verify password is correct)
}

export interface EncryptedData {
  iv: string; // Base64 initialization vector
  ciphertext: string; // Base64 encrypted data
}

export interface Tag {
  id?: number;
  name: string;
}

export interface DashboardCache {
  timestamp: number;
  videos: VideoItem[];
}

export interface AppSettings {
  id?: string; // 'config'
  
  // Platform Credentials
  apiKey?: EncryptedData; // YouTube API Key
  vimeoToken?: EncryptedData; // Vimeo Access Token
  dailymotionToken?: EncryptedData; // Dailymotion Bearer Token

  // Nomad Infrastructure
  nomadProxyKey?: EncryptedData; // Nomad Cloudflare Worker Key
  nomadUrl?: string; // Custom Worker URL override
  
  // Public/Custom Proxy Configuration
  customProxyUrl?: string; // Priority 2 (Custom/Homelab)
  proxy1Url?: string;      // Priority 3 (Default: AllOrigins)
  proxy2Url?: string;      // Priority 4 (Fallback: CORSProxy)

  // Cache Strategy
  dashboardCache?: DashboardCache;
  feedCacheDuration?: number; // Milliseconds to keep channel/playlist data
}

export type Platform = 'youtube' | 'vimeo' | 'dailymotion';

export interface MediaItem {
  id?: number;
  name: string;
  sourceId: string; // The ID (Channel ID, Playlist ID, Video ID)
  url: string; // Web URL (e.g. youtube.com/watch?v=...)
  type: 'channel' | 'playlist' | 'video';
  platform?: Platform; // Defaults to 'youtube' if undefined for backward compatibility
  tags?: string[];
  uploadsPlaylistId?: string; // Cache for Channel's "Uploads" playlist
  createdAt: number;
  
  // Content Caching
  cachedContent?: VideoItem[];
  lastFetched?: number;
}

export interface VideoItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  thumbnail: string;
  author: string;
  description: string;
  platform: Platform;
  views?: string; // Optional if we fetch stats later
}

export type ViewState = 
  | { type: 'dashboard' } 
  | { type: 'channel', item: MediaItem, section?: string } 
  | { type: 'playlist', item: MediaItem, section?: string } 
  | { type: 'video', item: MediaItem, section?: string }
  | { type: 'about' }
  | { type: 'settings' }
  | { type: 'search', query: string }
  | { type: 'tag', tag: string };

export const DEFAULT_CHANNELS: Partial<MediaItem>[] = [
  { name: 'ARTE.tv', sourceId: 'UCVogAsASqbceBmQMi1WA39g', type: 'channel', platform: 'youtube', tags: ['Documentary', 'Education'] },
  { name: 'Deutsche Welle', sourceId: 'UCW39zufHfsuGgpLviKh297Q', type: 'channel', platform: 'youtube', tags: ['Documentary', 'News', 'Travel'] },
  { name: 'Get.factual', sourceId: 'UCvD34fvRZ3QHWSkU1aUM99w', type: 'channel', platform: 'youtube', tags: ['History', 'Science', 'Technology'] },
  { name: 'National Geographic', sourceId: 'UCpVm7bg6pXKo1Pr6k5kxG9A', type: 'channel', platform: 'youtube', tags: ['Science', 'Exploration', 'Adventure'] },
  { name: 'NOVA', sourceId: 'UCjHz5SVHeMT0AViCYZvsGDA', type: 'channel', platform: 'youtube', tags: ['Science'] },
];

export const DEFAULT_PLAYLISTS: Partial<MediaItem>[] = [
  { name: 'Arte Space', sourceId: 'PL-eZcc0GI8-XnEWudxZl2db9wxUtwUV_6', type: 'playlist', platform: 'youtube', tags: ['Documentary', 'Education', 'Space'] },
  { name: 'Ancient Civilizations', sourceId: 'PLivjPDlt6ApQ-KbhlMBoVf-1zI3mglTvQ', type: 'playlist', platform: 'youtube', tags: ['Documentary', 'Education', 'History'] },
];

export const DEFAULT_TAGS = [
  'Documentary', 'Education', 'News', 'Travel', 'History', 
  'Science', 'Technology', 'Exploration', 'Adventure', 'Space'
];
