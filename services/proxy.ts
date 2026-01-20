
import { dbService } from './db';

// Public defaults
export const DEFAULT_PROXY_1 = 'https://api.allorigins.win/raw?url=';
export const DEFAULT_PROXY_2 = 'https://corsproxy.io/?';
export const DEFAULT_NOMAD_URL = 'https://nomad.xoopserver.workers.dev/';

// In-memory store for credentials
let MEMORY_NOMAD_KEY: string | null = null;
let MEMORY_NOMAD_URL: string | null = null;

export type ProxyStatus = 'secure' | 'custom' | 'public' | 'none';

// Callback to notify UI of connection status
let statusCallback: ((status: ProxyStatus) => void) | null = null;

export const proxyService = {
    
    setNomadKey(key: string) {
        MEMORY_NOMAD_KEY = key ? key.trim() : null;
    },

    setNomadUrl(url: string) {
        MEMORY_NOMAD_URL = url ? url.trim() : null;
    },

    onProxyStatusChange(callback: (status: ProxyStatus) => void) {
        statusCallback = callback;
    },

    /**
     * Used by Settings Panel to verify if key/url combination works.
     * Tries to fetch a simple stable URL.
     * Throws specific errors for UI diagnostics.
     */
    async testConnection(url: string, key: string): Promise<void> {
        try {
            const cleanUrl = url ? url.trim() : '';
            if (!cleanUrl) throw new Error("Worker URL is empty");
            
            const cleanKey = key ? key.trim() : '';
            const baseUrl = cleanUrl.endsWith('/') ? cleanUrl : `${cleanUrl}/`;
            
            // Test fetching a highly-available, neutral target.
            // Google/Robots.txt is often blocked by data centers, causing Worker errors (500)
            // which leads to missing CORS headers.
            // captive.apple.com is designed for connectivity checks and returns "Success".
            const testTarget = 'https://captive.apple.com/hotspot-detect.html'; 
            const fetchUrl = `${baseUrl}?url=${encodeURIComponent(testTarget)}`;
            
            console.log(`[Proxy Test] Fetching: ${fetchUrl}`);

            const res = await fetch(fetchUrl, {
                method: 'GET',
                mode: 'cors', // Explicitly request CORS
                cache: 'no-store', // Prevent browser from using cached failed CORS responses
                credentials: 'omit', // Do not send cookies
                headers: { 
                    'X-Proxy-Key': cleanKey 
                }
            });

            if (res.status === 403 || res.status === 401) {
                throw new Error("Invalid Key (403)");
            }
            if (res.status >= 500) {
                // This is common if the Worker is blocked by the target, or if the Worker script crashed
                throw new Error(`Server Error (${res.status}) - Worker may be blocked by target`);
            }
            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}`);
            }
            
            const text = await res.text();
            if (!text) throw new Error("Empty Response");

            // Simple validation that we got expected content
            if (!text.includes('Success') && !text.toLowerCase().includes('html')) {
                 throw new Error("Invalid response content");
            }

        } catch (e: any) {
            console.error("Test connection failed", e);
            // Distinguish CORS/Network errors (often caused by 500s on Preflight)
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                 throw new Error("CORS/Network Error. Check Worker 'Allowed Origins' or Key.");
            }
            throw e;
        }
    },

    /**
     * Fetches text content from a URL using a failover proxy strategy.
     */
    async fetchText(targetUrl: string): Promise<string> {
        const settings = await dbService.getSettings();
        const cleanTarget = targetUrl.trim();
        
        // 1. Priority: Nomad Proxy (Authenticated)
        if (MEMORY_NOMAD_KEY) {
            try {
                // Ensure no spaces in worker URL
                // Check if MEMORY_NOMAD_URL is set, else check settings, else default.
                // Handle empty string in settings:
                const settingUrl = (settings?.nomadUrl && settings.nomadUrl.trim() !== '') ? settings.nomadUrl : null;
                const rawWorkerUrl = MEMORY_NOMAD_URL || settingUrl || DEFAULT_NOMAD_URL;
                
                const workerUrl = rawWorkerUrl.trim();
                const baseUrl = workerUrl.endsWith('/') ? workerUrl : `${workerUrl}/`;
                
                const fetchUrl = `${baseUrl}?url=${encodeURIComponent(cleanTarget)}`;
                
                const res = await fetch(fetchUrl, {
                    headers: { 'X-Proxy-Key': MEMORY_NOMAD_KEY }, // Key is already trimmed by setter
                    mode: 'cors',
                    credentials: 'omit'
                });

                if (!res.ok) {
                    throw new Error(`Nomad Proxy returned ${res.status}`);
                }

                const text = await res.text();
                if (isValidResponse(text)) {
                    if (statusCallback) statusCallback('secure');
                    return text;
                }
                
            } catch (e: any) {
                console.warn(`Nomad Proxy failed`, e.message);
                // Fallthrough to next tier
            }
        }

        const proxies: string[] = [];

        // 2. Priority: Custom Homelab Proxy
        if (settings?.customProxyUrl && settings.customProxyUrl.trim() !== '') {
            proxies.push(settings.customProxyUrl.trim());
        }

        // 3. Priority: Public Proxies (Visitor Mode)
        if (settings?.proxy1Url && settings.proxy1Url.trim() !== '') {
            proxies.push(settings.proxy1Url.trim());
        } else {
            proxies.push(DEFAULT_PROXY_1);
        }

        if (settings?.proxy2Url && settings.proxy2Url.trim() !== '') {
            proxies.push(settings.proxy2Url.trim());
        } else {
            proxies.push(DEFAULT_PROXY_2);
        }

        let lastError: Error | null = null;
        let usedPublic = false;

        for (const proxyBase of proxies) {
            try {
                const cleanProxyBase = proxyBase.trim();
                const isPublic = cleanProxyBase.includes('allorigins') || cleanProxyBase.includes('corsproxy');
                if (isPublic) usedPublic = true;

                const fetchUrl = `${cleanProxyBase}${encodeURIComponent(cleanTarget)}`;
                const res = await fetch(fetchUrl);
                
                if (!res.ok) {
                    throw new Error(`Proxy ${cleanProxyBase} returned ${res.status}`);
                }
                
                const text = await res.text();
                
                if (isValidResponse(text)) {
                    // Success! Report status.
                    if (statusCallback) {
                        if (usedPublic) statusCallback('public');
                        else statusCallback('custom');
                    }
                    return text;
                }

            } catch (e: any) {
                console.warn(`Proxy failed: ${proxyBase}`, e.message);
                lastError = e;
                // Continue to next proxy in loop
            }
        }
        
        if (statusCallback) statusCallback('none');
        throw lastError || new Error('All proxies failed to fetch content');
    }
};

function isValidResponse(text: string): boolean {
    if (!text || text.includes('Access Denied') || text.includes('Proxy Error') || text.includes('403 Forbidden')) {
        return false;
    }
    return true;
}
