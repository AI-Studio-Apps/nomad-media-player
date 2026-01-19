<div align="center">
<img width="auto" height="auto" alt="nomad media player" src="nomad-media-player-screenshot.jpg" />
</div>


# 🌍 Nomad Media Player

Nomad Media Player stores your favorite public channels, playlists, and videos locally.
A self-hosted app for digital nomads—built with local-first design and privacy-respecting architecture.

Nomad Media Player is a purpose-built workspace for intentional viewing and research.

In an era of abundant information, this tool allows students and professionals to curate their own educational feeds, separating valuable learning resources from the algorithmic loops of entertainment platforms.

It fosters a proactive approach to media consumption, ensuring your time is spent on content you selected, not content suggested to you.

> Built with open web tech. Runs entirely in your browser.


https://ai-studio-apps.github.io/nomad-media-player/


## 🎥 Connect YouTube

The transition from RSS to the YouTube Data API v3 upgrade improves stability, data quality,   
and allow fetching more videos.  

YouTube Data API v3 allows up to 50 items per request, full metadata, max-resolution thumbnails,   
and requires no "hacky" CORS proxies.


### YouTube API key

To fetch your public YouTube videos or channel info, you’ll need a free **YouTube Data API key** from Google.

### How to get it:  

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **YouTube Data API v3**
4. Create an **API key** under "Credentials"
5. (Recommended) Restrict the key to your app’s domain and the YouTube API

### Save it in the app:   

- Open the web app
- Go to **Settings → Integrations → YouTube**
- Paste your API key and click **Save**
- Your key is stored **only in your browser** (via IndexedDB).

> ℹ️ This key only accesses **public data** (e.g., video titles, thumbnails). It cannot modify your channel or access private content.

## Security

**Web Crypto API (window.crypto)** Modern browsers have built-in JavaScript APIs that allow web developers to perform cryptographic operations (encryption, decryption, signing) directly in the browser, enabling client-side encryption.

Since the data is stored in IndexedDB, it is sandboxed to your specific domain (origin).   
Other websites cannot access it.

Using the Web Crypto API (window.crypto) ensures that sensitive data (like the API Key) is encrypted before it is saved to IndexedDB.

1. Zero-Knowledge Architecture: The database will only store a Salt and a Verifier for the user. It will never store the password.
2. Session Key: When the user logs in, it derives a CryptoKey from the password + the stored salt. This key exists only in memory (RAM) while the page is open.
3. Encrypted API Key: The YouTube API Key is encrypted with this Session Key before being stored. Even if someone steals the database file, they cannot use the API Key without the user's password.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. Create an account
4. Set the YouTube `API_KEY` in **Settings**

> [!CAUTION]
> Client-Side Encryption Enabled: Your password and API keys are encrypted in your browser using AES-GCM and PBKDF2. We cannot recover your password if you lose it.


## Development

Nomad Media Player design to support multiple video platforms beyond YouTube.   
The following review outlines current and planned integrations—focusing on services that offer public, client-side–friendly APIs for fetching playlist and video metadata.

All integrations should be implemented **without backend dependencies**, using only browser-based requests to official public APIs.

### Video platforms

Most major video platforms offer public REST APIs, but access, cost, and ease of use vary significantly. Below is a clear, practical comparison focused on free-tier availability, authentication needs, and suitability for a client-side app like nomad-media-player (hosted on GitHub Pages).

### ✅ Quick Summary Table

| Platform     | Free Public API? | Auth Required? | Client-Side Friendly? | Notes |
|--------------|------------------|----------------|------------------------|-------|
| **YouTube**  | ✅ Yes (API key) | ❌ No (for public data) | ✅ Yes | Best for your use case |
| **Vimeo**    | ✅ Yes (basic)   | ❌ No (public videos) | ✅ Yes | Simple, clean REST API |
| **Dailymotion** | ✅ Yes        | ❌ No (public content) | ✅ Yes | Underrated, easy to use |
| **Twitch**   | ✅ Yes           | ✅ Yes (OAuth/client ID) | ⚠️ Limited | Only **public stream/channel info**; no VODs without auth |
| **TikTok**   | ❌ **No public API** | — | ❌ No | No official way to fetch user videos by URL |


### 🔍 Detailed Breakdown

#### 1. **YouTube**  
- **API**: [YouTube Data API v3](https://developers.google.com/youtube/v3)  
- **Free tier**: 10,000 units/day (enough for ~10k video lookups)  
- **Client-side use**: ✅ Just an API key  
- **What you can get**: Video title, description, thumbnail, channel info  
- **Limitation**: Cannot access private/unlisted videos

✅ **Best choice** for our current model.

---

#### 2. **Vimeo**  
- **API**: [Vimeo Developer API](https://developer.vimeo.com/api)  
- **Free tier**: ✅ Public endpoints require **no auth**  
- **Endpoint example**:  
  ```http
  GET https://api.vimeo.com/videos/{video_id}
  ```
- **Client-side use**: ✅ Works with `fetch()` from browser  
- **What you can get**: Title, description, thumbnail, duration (for public videos)  
- **Note**: Private/embed-restricted videos return 403

✅ **Excellent alternative** simple and open.

---

#### 3. **Dailymotion**  
- **API**: [Dailymotion API](https://www.dailymotion.com/developer)  
- **Free tier**: ✅ Public data via simple REST  
- **Endpoint example**:  
  ```http
  GET https://api.dailymotion.com/video/{video_id}?fields=title,description,thumbnail_url
  ```
- **Client-side use**: ✅ No auth needed for public content  
- **What you can get**: Basic metadata and thumbnails

✅ **Underrated but solid** great for fallback support.

---

#### 4. **Twitch**  
- **API**: [Twitch Helix API](https://dev.twitch.tv/docs/api)  
- **Free tier**: ✅ But **requires Client ID** (no secret needed for public data)  
- **Client-side use**: ⚠️ Possible, but rate-limited (~30 req/min per IP)  
- **What you can get**:  
  - Live stream info ✅  
  - Channel info ✅  
  - **Past broadcasts (VODs)?** ❌ Only with OAuth + user consent  
- **Limitation**: Cannot fetch arbitrary VODs by URL without user login

⚠️ **Only useful if you focus on live streams**, not general video playback.

---

#### 5. **TikTok**  
- **Official API**: ❌ **No public REST API** for fetching user videos  
- **Workarounds**:  
  - Unofficial scrapers (unreliable, against ToS)  
  - TikTok Embed API (for embedding only—not metadata)  
- **Embed example**:  
  ```html
  <blockquote class="tiktok-embed" cite="https://www.tiktok.com/@user/video/123"></blockquote>
  <script async src="https://www.tiktok.com/embed.js"></script>
  ```
- **But**: You **cannot get title/thumbnail via API** programmatically

❌ **Not viable** for our use case.


## License

© 2026 Nuno Luciano  
Licensed under the [MIT License](./LICENSE).
