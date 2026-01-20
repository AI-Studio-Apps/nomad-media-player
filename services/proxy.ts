
import { dbService } from './db';

// Public defaults
export const DEFAULT_PROXY_1 = 'https://api.allorigins.win/raw?url=';
export const DEFAULT_PROXY_2 = 'https://corsproxy.io/?';

export const proxyService = {
    
    /**
     * Fetches text content from a URL using a failover proxy strategy.
     * Order of operations:
     * 1. Custom Proxy (if defined in settings) - Priority for Homelab
     * 2. Proxy 1 (Default: AllOrigins)
     * 3. Proxy 2 (Fallback: CORSProxy)
     */
    async fetchText(targetUrl: string): Promise<string> {
        const settings = await dbService.getSettings();
        const proxies: string[] = [];

        // 1. Add Custom Proxy if exists (Priority)
        if (settings?.customProxyUrl && settings.customProxyUrl.trim() !== '') {
            proxies.push(settings.customProxyUrl);
        }

        // 2. Add Proxy 1 (User setting OR Default)
        if (settings?.proxy1Url && settings.proxy1Url.trim() !== '') {
            proxies.push(settings.proxy1Url);
        } else {
            proxies.push(DEFAULT_PROXY_1);
        }

        // 3. Add Proxy 2 (User setting OR Default)
        if (settings?.proxy2Url && settings.proxy2Url.trim() !== '') {
            proxies.push(settings.proxy2Url);
        } else {
            proxies.push(DEFAULT_PROXY_2);
        }

        let lastError: Error | null = null;

        for (const proxyBase of proxies) {
            try {
                const fetchUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
                const res = await fetch(fetchUrl);
                
                if (!res.ok) {
                    throw new Error(`Proxy ${proxyBase} returned ${res.status}`);
                }
                
                const text = await res.text();
                
                // Simple validation: Ensure we didn't just get a proxy error page
                if (!text || text.includes('Access Denied') || text.includes('Proxy Error')) {
                    throw new Error('Invalid response content');
                }

                return text;
            } catch (e: any) {
                console.warn(`Proxy failed: ${proxyBase}`, e.message);
                lastError = e;
                // Continue to next proxy in loop
            }
        }

        throw lastError || new Error('All proxies failed to fetch content');
    }
};
