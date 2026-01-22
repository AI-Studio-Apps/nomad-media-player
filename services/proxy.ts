
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
            const testTarget = 'https://captive.apple.com/hotspot-detect.html'; 
            
            // CONSTRUCT QUERY PARAMS (The "Simplest" Strategy)
            const fetchUrl = `${baseUrl}?url=${encodeURIComponent(testTarget)}&key=${encodeURIComponent(cleanKey)}`;
            
            console.log(`[Proxy Test] Fetching: ${baseUrl}?url=...&key=***`);

            // MINIMAL FETCH CALL - NO custom headers, NO cache, NO mode options.
            const res = await fetch(fetchUrl, {
                method: 'GET'
            });

            if (res.status === 403 || res.status === 401) {
                // Read the specific error text from the worker to distinguish Origin vs Key errors
                const errorBody = await res.text();
                console.error("Worker 403 Response:", errorBody);

                if (errorBody.toLowerCase().includes('origin')) {
                     throw new Error("Access Denied: Domain not allowed. Update your Worker code to allow this Origin.");
                }
                
                throw new Error("Invalid Key. Ensure 'PROXY_SECRET' is set in Cloudflare Dashboard > Settings > Variables.");
            }
            if (res.status >= 500) {
                throw new Error(`Server Error (${res.status}) - Worker may be blocked or crashing.`);
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
            
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                 throw new Error("Network Error. If you see 'Error 1101', your Worker script crashed (check 'env' usage).");
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
                const settingUrl = (settings?.nomadUrl && settings.nomadUrl.trim() !== '') ? settings.nomadUrl : null;
                const rawWorkerUrl = MEMORY_NOMAD_URL || settingUrl || DEFAULT_NOMAD_URL;
                
                const workerUrl = rawWorkerUrl.trim();
                const baseUrl = workerUrl.endsWith('/') ? workerUrl : `${workerUrl}/`;
                
                const fetchUrl = `${baseUrl}?url=${encodeURIComponent(cleanTarget)}&key=${encodeURIComponent(MEMORY_NOMAD_KEY)}`;
                
                // MINIMAL FETCH CALL
                const res = await fetch(fetchUrl, {
                    method: 'GET'
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
                
                // MINIMAL FETCH CALL
                const res = await fetch(fetchUrl, {
                    method: 'GET'
                });
                
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
