
import { dbService } from './db';

// Public defaults
export const DEFAULT_PROXY_1 = 'https://api.allorigins.win/raw?url=';
export const DEFAULT_PROXY_2 = 'https://corsproxy.io/?';
export const DEFAULT_NOMAD_URL = 'https://nomad.xoopserver.workers.dev/';

// In-memory store for credentials
let MEMORY_NOMAD_KEY: string | null = null;
let MEMORY_NOMAD_URL: string | null = null;

// Callback to notify UI of degraded performance
let visitorModeCallback: (() => void) | null = null;

export const proxyService = {
    
    setNomadKey(key: string) {
        MEMORY_NOMAD_KEY = key;
    },

    setNomadUrl(url: string) {
        MEMORY_NOMAD_URL = url;
    },

    onVisitorMode(callback: () => void) {
        visitorModeCallback = callback;
    },

    /**
     * Fetches text content from a URL using a failover proxy strategy.
     * Order of operations:
     * 1. Nomad Worker (if key is present) - Authenticated
     * 2. Custom Proxy (if defined in settings) - Homelab
     * 3. Public Proxies (Visitor Mode) - Triggers UI Warning
     */
    async fetchText(targetUrl: string): Promise<string> {
        const settings = await dbService.getSettings();
        
        // 1. Priority: Nomad Proxy (Authenticated)
        if (MEMORY_NOMAD_KEY) {
            try {
                const workerUrl = MEMORY_NOMAD_URL || settings?.nomadUrl || DEFAULT_NOMAD_URL;
                // Ensure trailing slash for cleanly appending query
                const baseUrl = workerUrl.endsWith('/') ? workerUrl : `${workerUrl}/`;
                const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}`;
                
                const res = await fetch(fetchUrl, {
                    headers: { 'X-Proxy-Key': MEMORY_NOMAD_KEY }
                });

                if (!res.ok) {
                    throw new Error(`Nomad Proxy returned ${res.status}`);
                }

                const text = await res.text();
                if (isValidResponse(text)) return text;
                
            } catch (e: any) {
                console.warn(`Nomad Proxy failed`, e.message);
                // Fallthrough to next tier
            }
        }

        const proxies: string[] = [];

        // 2. Priority: Custom Homelab Proxy
        if (settings?.customProxyUrl && settings.customProxyUrl.trim() !== '') {
            proxies.push(settings.customProxyUrl);
        }

        // 3. Priority: Public Proxies (Visitor Mode)
        // If we reach here, we are relying on unreliable public infra.
        // Trigger the UI warning only if we haven't successfully used Nomad/Custom.
        const isVisitorMode = proxies.length === 0; 
        
        if (settings?.proxy1Url && settings.proxy1Url.trim() !== '') {
            proxies.push(settings.proxy1Url);
        } else {
            proxies.push(DEFAULT_PROXY_1);
        }

        if (settings?.proxy2Url && settings.proxy2Url.trim() !== '') {
            proxies.push(settings.proxy2Url);
        } else {
            proxies.push(DEFAULT_PROXY_2);
        }

        let lastError: Error | null = null;

        for (const proxyBase of proxies) {
            try {
                // Determine if this specific proxy attempt is a "Visitor" attempt
                const isPublicProxy = proxyBase.includes('allorigins') || proxyBase.includes('corsproxy');
                if (isPublicProxy && visitorModeCallback) {
                     visitorModeCallback();
                }

                const fetchUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
                const res = await fetch(fetchUrl);
                
                if (!res.ok) {
                    throw new Error(`Proxy ${proxyBase} returned ${res.status}`);
                }
                
                const text = await res.text();
                
                if (isValidResponse(text)) return text;

            } catch (e: any) {
                console.warn(`Proxy failed: ${proxyBase}`, e.message);
                lastError = e;
                // Continue to next proxy in loop
            }
        }

        throw lastError || new Error('All proxies failed to fetch content');
    }
};

function isValidResponse(text: string): boolean {
    if (!text || text.includes('Access Denied') || text.includes('Proxy Error') || text.includes('403 Forbidden')) {
        return false;
    }
    return true;
}
