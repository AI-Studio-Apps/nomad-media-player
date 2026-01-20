
import { MediaItem, VideoItem } from '../types';
import { proxyService } from './proxy';

// Vimeo's oEmbed endpoint is reliable for public data without auth tokens (Single Video)
const BASE_OEMBED_URL = 'https://vimeo.com/api/oembed.json';

export const vimeoService = {
    async getVideos(item: MediaItem): Promise<VideoItem[]> {
        
        // 1. Handle Single Video (oEmbed)
        if (item.type === 'video') {
            try {
                const videoUrl = item.url || `https://vimeo.com/${item.sourceId}`;
                const res = await fetch(`${BASE_OEMBED_URL}?url=${encodeURIComponent(videoUrl)}`);
                
                if (!res.ok) throw new Error('Failed to fetch Vimeo metadata');
                
                const data = await res.json();
                
                return [{
                    id: item.sourceId,
                    title: data.title,
                    description: data.description || '',
                    thumbnail: data.thumbnail_url,
                    author: data.author_name,
                    pubDate: data.upload_date || new Date().toISOString(),
                    link: `https://vimeo.com/${data.video_id}`,
                    platform: 'vimeo'
                }];
            } catch (error) {
                console.error('Vimeo Video Fetch Error:', error);
                // Fallback for UI if fetch fails
                return [{
                    id: item.sourceId,
                    title: item.name,
                    description: 'Metadata unavailable',
                    thumbnail: '', 
                    author: 'Vimeo',
                    pubDate: new Date().toISOString(),
                    link: `https://vimeo.com/${item.sourceId}`,
                    platform: 'vimeo'
                }];
            }
        } 
        
        // 2. Handle Channels & Users (RSS Feed via Proxy)
        else {
            try {
                // Construct RSS URL
                // Note: Vimeo RSS feeds are typically /channels/{id}/videos/rss or /{user}/videos/rss
                let rssUrl = '';
                if (item.sourceId.startsWith('channels/')) {
                     // If we explicitly detected it as a channel path
                     rssUrl = `https://vimeo.com/${item.sourceId}/videos/rss`;
                } else {
                     // Assume User or simple ID
                     rssUrl = `https://vimeo.com/${item.sourceId}/videos/rss`;
                }

                // Use the Failover Proxy Service
                const text = await proxyService.fetchText(rssUrl);
                
                if (!text.trim().startsWith('<')) {
                    throw new Error('Invalid RSS response');
                }

                const parser = new DOMParser();
                const xml = parser.parseFromString(text, "text/xml");
                
                const items = Array.from(xml.getElementsByTagName("item"));
                
                return items.map(node => {
                    const getTag = (name: string) => {
                        return node.getElementsByTagName(name)[0]?.textContent || 
                               node.getElementsByTagNameNS("*", name)[0]?.textContent || "";
                    };

                    const title = getTag("title") || "Untitled";
                    const link = getTag("link") || "";
                    const id = link.split('/').pop() || "";
                    const description = getTag("description");
                    const pubDate = getTag("pubDate") || getTag("date") || new Date().toISOString();
                    const author = getTag("creator") || getTag("dc:creator") || "Vimeo Creator";

                    let thumbnail = "";
                    
                    const mediaThumb = node.getElementsByTagNameNS("*", "thumbnail")[0];
                    if (mediaThumb) {
                        thumbnail = mediaThumb.getAttribute("url") || "";
                    } 
                    
                    if (!thumbnail) {
                        const mediaContent = node.getElementsByTagNameNS("*", "content")[0];
                        if (mediaContent && mediaContent.getAttribute("type")?.includes("image")) {
                            thumbnail = mediaContent.getAttribute("url") || "";
                        }
                    }

                    if (!thumbnail && description) {
                        const imgMatch = description.match(/src="([^"]+)"/);
                        if (imgMatch) thumbnail = imgMatch[1];
                    }

                    return {
                        id,
                        title,
                        description: description.replace(/<[^>]*>/g, '').slice(0, 200) + '...',
                        thumbnail,
                        author,
                        pubDate: new Date(pubDate).toISOString(),
                        link,
                        platform: 'vimeo'
                    };
                });

            } catch (error) {
                console.error('Vimeo RSS Fetch Error:', error);
                // Return empty to allow UI to handle "No Videos" gracefully
                return [];
            }
        }
    }
};
