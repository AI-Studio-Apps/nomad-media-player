import { UserAuth, MediaItem, DEFAULT_CHANNELS, DEFAULT_PLAYLISTS, DEFAULT_TAGS, AppSettings, Tag } from '../types';

const DB_NAME = 'NomadMediaSecureDB';
const DB_VERSION = 4; // Bump version to force schema update and reseeding

export class DBService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        
        // Auth Store
        if (!db.objectStoreNames.contains('auth')) {
          db.createObjectStore('auth', { keyPath: 'username' });
        }

        // Channels
        let channelStore: IDBObjectStore;
        if (!db.objectStoreNames.contains('channels')) {
          channelStore = db.createObjectStore('channels', { keyPath: 'id', autoIncrement: true });
          channelStore.createIndex('name', 'name', { unique: false });
        } else {
            channelStore = transaction.objectStore('channels');
        }

        // Playlists
        let playlistStore: IDBObjectStore;
        if (!db.objectStoreNames.contains('playlists')) {
          playlistStore = db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
        } else {
            playlistStore = transaction.objectStore('playlists');
        }

        // Favorites
        if (!db.objectStoreNames.contains('favorites')) {
          const store = db.createObjectStore('favorites', { keyPath: 'id', autoIncrement: true });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }

        // Tags
        let tagStore: IDBObjectStore;
        if (!db.objectStoreNames.contains('tags')) {
          tagStore = db.createObjectStore('tags', { keyPath: 'id', autoIncrement: true });
          tagStore.createIndex('name', 'name', { unique: true });
        } else {
            tagStore = transaction.objectStore('tags');
        }

        // Settings (API Key)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }

        // --- MIGRATION / SEEDING LOGIC (Runs on V4 update) ---
        // Warning: This logic effectively resets the default stores to the new configuration
        // requested by the user.
        
        // 1. Clear and Reseed Channels
        channelStore.clear(); 
        DEFAULT_CHANNELS.forEach(cat => {
            channelStore.add({
              ...cat,
              url: `https://www.youtube.com/channel/${cat.sourceId}`,
              createdAt: Date.now()
            });
        });

        // 2. Clear and Reseed Playlists
        playlistStore.clear();
        DEFAULT_PLAYLISTS.forEach(pl => {
            playlistStore.add({
                ...pl,
                url: `https://www.youtube.com/playlist?list=${pl.sourceId}`,
                createdAt: Date.now()
            });
        });

        // 3. Update Tags
        tagStore.clear();
        DEFAULT_TAGS.forEach(tag => {
            tagStore.add({ name: tag });
        });
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
    });
  }

  async hasUsers(): Promise<boolean> {
    const users = await this.getAll<UserAuth>('auth');
    return users.length > 0;
  }

  async getUser(username: string): Promise<UserAuth | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');
      const transaction = this.db.transaction(['auth'], 'readonly');
      const store = transaction.objectStore('auth');
      const request = store.get(username);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Registration now takes the full auth object constructed by the app (including salt/verifier)
  async register(auth: UserAuth): Promise<void> {
    return this.add('auth', auth);
  }

  // Settings Helper
  async getSettings(): Promise<AppSettings | undefined> {
    return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB not initialized');
        const tx = this.db.transaction(['settings'], 'readonly');
        const req = tx.objectStore('settings').get('config');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
  }

  async saveSettings(settings: AppSettings): Promise<void> {
      return this.update('settings', { ...settings, id: 'config' });
  }

  // Backup & Restore

  async exportFullDB(): Promise<Record<string, any[]>> {
    if (!this.db) throw new Error('DB not initialized');
    const storeNames = ['auth', 'channels', 'playlists', 'favorites', 'tags', 'settings'];
    const exportData: Record<string, any[]> = {};

    for (const name of storeNames) {
        exportData[name] = await this.getAll(name);
    }
    return exportData;
  }

  async importFullDB(data: Record<string, any[]>): Promise<void> {
      return new Promise((resolve, reject) => {
          if (!this.db) return reject('DB not initialized');
          
          const storeNames = ['auth', 'channels', 'playlists', 'favorites', 'tags', 'settings'];
          // Open a transaction for all stores
          const transaction = this.db.transaction(storeNames, 'readwrite');
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);

          storeNames.forEach(storeName => {
              if (data[storeName] && Array.isArray(data[storeName])) {
                  const store = transaction.objectStore(storeName);
                  data[storeName].forEach(item => {
                      store.put(item);
                  });
              }
          });
      });
  }

  // Tag Management (Cascading Updates)

  async getTagByName(name: string): Promise<Tag | undefined> {
    return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB not initialized');
        const tx = this.db.transaction(['tags'], 'readonly');
        const index = tx.objectStore('tags').index('name');
        const req = index.get(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
  }

  async deleteTag(tagName: string): Promise<void> {
    if (!this.db) return Promise.reject('DB not initialized');
    
    // 1. Get Tag ID to delete from tags store
    const tag = await this.getTagByName(tagName);
    if (!tag || !tag.id) return; 

    const storeNames = ['tags', 'channels', 'playlists', 'favorites'];
    const tx = this.db.transaction(storeNames, 'readwrite');

    // 2. Delete Tag from tags store
    tx.objectStore('tags').delete(tag.id);

    // 3. Cascade Delete: Remove string from all media items
    ['channels', 'playlists', 'favorites'].forEach(storeName => {
        const store = tx.objectStore(storeName);
        const req = store.openCursor();
        req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
            if (cursor) {
                const item = cursor.value as MediaItem;
                if (item.tags && item.tags.includes(tagName)) {
                    item.tags = item.tags.filter(t => t !== tagName);
                    cursor.update(item);
                }
                cursor.continue();
            }
        };
    });

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
  }

  async renameTag(oldName: string, newName: string): Promise<void> {
      if (!this.db) return Promise.reject('DB not initialized');

      const tag = await this.getTagByName(oldName);
      if (!tag || !tag.id) return;

      const storeNames = ['tags', 'channels', 'playlists', 'favorites'];
      const tx = this.db.transaction(storeNames, 'readwrite');

      // 1. Update Tag Store
      const tagStore = tx.objectStore('tags');
      tag.name = newName;
      tagStore.put(tag);

      // 2. Cascade Update: Replace string in all media items
      ['channels', 'playlists', 'favorites'].forEach(storeName => {
          const store = tx.objectStore(storeName);
          const req = store.openCursor();
          req.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
              if (cursor) {
                  const item = cursor.value as MediaItem;
                  if (item.tags && item.tags.includes(oldName)) {
                      item.tags = item.tags.map(t => t === oldName ? newName : t);
                      cursor.update(item);
                  }
                  cursor.continue();
              }
          };
      });
      
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
  }

  // Generic CRUD Helpers

  async getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async add<T>(storeName: string, item: T): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(item);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async update<T>(storeName: string, item: T): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item); // put updates if key exists

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, id: number | string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const dbService = new DBService();