
import { MediaItem, VideoItem } from '../types';

const BASE_URL = 'https://api.dailymotion.com';

export const dailymotionService = {
    async getVideos(item: MediaItem): Promise<VideoItem[]> {
        
        // Common fields we want to fetch
        const fields = 'id,title,description,thumbnail_720_url,owner.screenname,created_time,url';

        try {
            if (item.type === 'video') {
                const res = await fetch(`${BASE_URL}/video/${item.sourceId}?fields=${fields}`);
                if (!res.ok) throw new Error('Dailymotion video not found');
                const data = await res.json();
                
                return [{
                    id: data.id,
                    title: data.title,
                    description: data.description,
                    thumbnail: data.thumbnail_720_url,
                    author: data['owner.screenname'],
                    pubDate: new Date(data.created_time * 1000).toISOString(),
                    link: data.url,
                    platform: 'dailymotion'
                }];
            } else if (item.type === 'channel') {
                // Fetch videos from a user
                const res = await fetch(`${BASE_URL}/user/${item.sourceId}/videos?fields=${fields}&limit=20`);
                if (!res.ok) throw new Error('Dailymotion channel not found');
                const data = await res.json();
                
                return data.list.map((vid: any) => ({
                    id: vid.id,
                    title: vid.title,
                    description: vid.description,
                    thumbnail: vid.thumbnail_720_url,
                    author: vid['owner.screenname'],
                    pubDate: new Date(vid.created_time * 1000).toISOString(),
                    link: vid.url,
                    platform: 'dailymotion'
                }));
            } else if (item.type === 'playlist') {
                 // Fetch videos from a playlist
                 const res = await fetch(`${BASE_URL}/playlist/${item.sourceId}/videos?fields=${fields}&limit=20`);
                 if (!res.ok) throw new Error('Dailymotion playlist not found');
                 const data = await res.json();
                 
                 return data.list.map((vid: any) => ({
                     id: vid.id,
                     title: vid.title,
                     description: vid.description,
                     thumbnail: vid.thumbnail_720_url,
                     author: vid['owner.screenname'],
                     pubDate: new Date(vid.created_time * 1000).toISOString(),
                     link: vid.url,
                     platform: 'dailymotion'
                 }));
            }
            
            return [];
        } catch (error) {
            console.error('Dailymotion Fetch Error:', error);
            // Return empty to avoid crashing UI, allows user to see "No videos found"
            return [];
        }
    }
};
