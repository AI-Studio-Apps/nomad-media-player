
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
        MEMORY_NOMAD_KEY = key;
    },

    setNomadUrl(url: string) {
        MEMORY_NOMAD_URL = url;
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
            const baseUrl = url.endsWith('/') ? url : `${url}/`;
            // Test fetching Google favicon or a small text file
            const testTarget = 'https://www.google.com/robots.txt'; 
            const fetchUrl = `${baseUrl}?url=${encodeURIComponent(testTarget)}`;
            
            const res = await fetch(fetchUrl, {
                headers: { 'X-Proxy-Key': key }
            });

            if (res.status === 403 || res.status === 401) {
                throw new Error("Invalid Key (403)");
            }
            if (res.status >= 500) {
                throw new Error(`Server Error (${res.status})`);
            }
            if (!res.ok) {
                throw new Error(`HTTP Error ${res.status}`);
            }
            
            const text = await res.text();
            if (!text) throw new Error("Empty Response");

        } catch (e: any) {
            console.error("Test connection failed", e);
            // Distinguish CORS/Network errors (often caused by 500s on Preflight)
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                 throw new Error("Network/CORS Error (Check Server Logs)");
            }
            throw e;
        }
    },

    /**
     * Fetches text content from a URL using a failover proxy strategy.
     */
    async fetchText(targetUrl: string): Promise<string> {
        const settings = await dbService.getSettings();
        
        // 1. Priority: Nomad Proxy (Authenticated)
        if (MEMORY_NOMAD_KEY) {
            try {
                const workerUrl = MEMORY_NOMAD_URL || settings?.nomadUrl || DEFAULT_NOMAD_URL;
                const baseUrl = workerUrl.endsWith('/') ? workerUrl : `${workerUrl}/`;
                const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}`;
                
                const res = await fetch(fetchUrl, {
                    headers: { 'X-Proxy-Key': MEMORY_NOMAD_KEY }
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
            proxies.push(settings.customProxyUrl);
        }

        // 3. Priority: Public Proxies (Visitor Mode)
        // If we reach here, we are relying on unreliable public infra.
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
        let usedPublic = false;

        for (const proxyBase of proxies) {
            try {
                const isPublic = proxyBase.includes('allorigins') || proxyBase.includes('corsproxy');
                if (isPublic) usedPublic = true;

                const fetchUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
                const res = await fetch(fetchUrl);
                
                if (!res.ok) {
                    throw new Error(`Proxy ${proxyBase} returned ${res.status}`);
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
