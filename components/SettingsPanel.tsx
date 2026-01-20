
import React, { useEffect, useState, useRef } from 'react';
import { Save, Key, CheckCircle, AlertCircle, Lock, Database, Download, Upload, Globe } from 'lucide-react';
import { dbService } from '../services/db';
import { cryptoService } from '../services/crypto';
import { youtubeService } from '../services/youtube';
import { DEFAULT_PROXY_1, DEFAULT_PROXY_2 } from '../services/proxy';
import { Button } from './Button';
import { Input } from './Input';

interface SettingsPanelProps {
    sessionKey: CryptoKey;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ sessionKey }) => {
  const [apiKey, setApiKey] = useState('');
  
  // Proxy State
  const [customProxy, setCustomProxy] = useState('');
  const [proxy1, setProxy1] = useState(DEFAULT_PROXY_1);
  const [proxy2, setProxy2] = useState(DEFAULT_PROXY_2);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [proxyMsg, setProxyMsg] = useState('');

  // Backup State
  const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, [sessionKey]);

  const loadSettings = async () => {
    try {
      const settings = await dbService.getSettings();
      if (settings?.apiKey) {
        // Decrypt the stored key using the session key
        const decrypted = await cryptoService.decryptData(settings.apiKey, sessionKey);
        setApiKey(decrypted);
      }
      
      // Load Proxies or defaults
      setCustomProxy(settings?.customProxyUrl || '');
      setProxy1(settings?.proxy1Url || DEFAULT_PROXY_1);
      setProxy2(settings?.proxy2Url || DEFAULT_PROXY_2);

    } catch (e) {
      console.error(e);
      setStatus('error');
      setStatusMsg('Failed to decrypt existing key.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    
    setStatus('idle');
    
    // Simple validation fetch
    try {
        const testUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=GoogleDevelopers&key=${apiKey.trim()}`;
        const res = await fetch(testUrl);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error?.message || 'Invalid API Key');
        }

        // Encrypt the key before saving
        const encryptedData = await cryptoService.encryptData(apiKey.trim(), sessionKey);
        
        // Get existing settings to preserve other fields
        const currentSettings = await dbService.getSettings() || {};

        // Save to DB
        await dbService.saveSettings({ 
            ...currentSettings,
            apiKey: encryptedData 
        });
        
        // Update the in-memory service immediately
        youtubeService.setApiKey(apiKey.trim());

        setStatus('success');
        setStatusMsg('API Key encrypted and saved successfully.');
    } catch (error: any) {
        setStatus('error');
        setStatusMsg(error.message);
    }
  };

  const handleSaveProxy = async (e: React.FormEvent) => {
      e.preventDefault();
      setProxyStatus('idle');

      try {
        // Get existing settings
        const currentSettings = await dbService.getSettings() || {};
        
        await dbService.saveSettings({
            ...currentSettings,
            customProxyUrl: customProxy.trim(),
            proxy1Url: proxy1.trim(),
            proxy2Url: proxy2.trim()
        });

        setProxyStatus('success');
        setProxyMsg('Proxy failover chain updated.');
      } catch (e: any) {
          setProxyStatus('error');
          setProxyMsg('Failed to save settings.');
      }
  };

  const handleExport = async () => {
      try {
          const data = await dbService.exportFullDB();
          const jsonString = JSON.stringify(data, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = `nomad-backup-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setBackupStatus('success');
          setBackupMsg('Database exported successfully.');
      } catch (e: any) {
          setBackupStatus('error');
          setBackupMsg('Export failed: ' + e.message);
      }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!window.confirm("Warning: This will merge the backup file with your current data. Existing items with the same ID will be overwritten. Continue?")) {
          e.target.value = '';
          return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = event.target?.result as string;
              const data = JSON.parse(json);
              await dbService.importFullDB(data);
              setBackupStatus('success');
              setBackupMsg('Database imported successfully. Please reload the page to see changes.');
          } catch (err: any) {
              console.error(err);
              setBackupStatus('error');
              setBackupMsg('Import failed: Invalid file or database error.');
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  if (loading) return <div>Loading secure settings...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <div className="flex items-center gap-2 text-green-400 bg-green-900/20 px-3 py-1 rounded-full w-fit mb-2">
            <Lock size={12} />
            <span className="text-xs font-semibold">Secure Encryption Active</span>
        </div>
        <p className="text-zinc-400">
            Configure your application preferences and manage your data.
        </p>
      </div>

      <div className="space-y-8">
        
        {/* API Key Section */}
        <div className="bg-surface border border-zinc-700 rounded-xl p-6">
            <form onSubmit={handleSaveApiKey} className="space-y-6">
                <div className="flex items-start gap-4">
                    <div className="bg-zinc-900 p-3 rounded-lg text-primary">
                        <Key size={24} />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-white mb-1">YouTube API Key</h3>
                            <p className="text-sm text-zinc-400 mb-4">
                                Required to fetch YouTube channel and playlist data.
                            </p>
                            <Input 
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                type="password"
                                required
                            />
                        </div>

                        {status !== 'idle' && (
                            <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${status === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900' : 'bg-red-900/20 text-red-400 border border-red-900'}`}>
                                {status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {statusMsg}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit">
                                <Save size={16} className="mr-2" /> Encrypt & Save
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>

        {/* Proxy Settings */}
        <div className="bg-surface border border-zinc-700 rounded-xl p-6">
            <form onSubmit={handleSaveProxy} className="space-y-6">
                <div className="flex items-start gap-4">
                    <div className="bg-zinc-900 p-3 rounded-lg text-blue-400">
                        <Globe size={24} />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-white mb-1">Network & Homelab</h3>
                            <p className="text-sm text-zinc-400 mb-4">
                                Configure CORS proxies for fetching RSS feeds (e.g. Vimeo). 
                                The application will try these in order until one succeeds.
                            </p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-green-400 mb-1">Proxy 1 (Default)</label>
                                    <Input 
                                        value={proxy1}
                                        onChange={e => setProxy1(e.target.value)}
                                        placeholder="https://api.allorigins.win/raw?url="
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-semibold text-yellow-400 mb-1">Proxy 2 (Fallback)</label>
                                    <Input 
                                        value={proxy2}
                                        onChange={e => setProxy2(e.target.value)}
                                        placeholder="https://corsproxy.io/?"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-primary mb-1">Proxy 3 (Custom / Homelab)</label>
                                    <Input 
                                        value={customProxy}
                                        onChange={e => setCustomProxy(e.target.value)}
                                        placeholder="https://my-proxy.homelab.local/?url="
                                    />
                                    <p className="text-xs text-zinc-500 mt-2">
                                        If set, this custom proxy is attempted first. Ensure it ends with the query parameter (e.g. <code>?url=</code>).
                                    </p>
                                </div>
                            </div>
                        </div>

                        {proxyStatus !== 'idle' && (
                            <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${proxyStatus === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900' : 'bg-red-900/20 text-red-400 border border-red-900'}`}>
                                {proxyStatus === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {proxyMsg}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit" variant="secondary">
                                <Save size={16} className="mr-2" /> Save Configuration
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>

        {/* Data Management Section */}
        <div className="bg-surface border border-zinc-700 rounded-xl p-6">
             <div className="flex items-start gap-4">
                <div className="bg-zinc-900 p-3 rounded-lg text-purple-400">
                    <Database size={24} />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-medium text-white mb-1">Data Management</h3>
                    <p className="text-sm text-zinc-400 mb-6">
                        Backup your channels, playlists, favorites, and settings to a JSON file. 
                        Useful for migrating between devices or browsers.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button variant="secondary" onClick={handleExport} className="flex-1">
                            <Download size={16} className="mr-2" /> Export Backup
                        </Button>
                        <Button variant="secondary" onClick={handleImportClick} className="flex-1">
                            <Upload size={16} className="mr-2" /> Import Backup
                        </Button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept="application/json" 
                            className="hidden" 
                        />
                    </div>
                    
                    {backupStatus !== 'idle' && (
                        <div className={`mt-4 flex items-center gap-2 text-sm p-3 rounded-md ${backupStatus === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900' : 'bg-red-900/20 text-red-400 border border-red-900'}`}>
                            {backupStatus === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {backupMsg}
                        </div>
                    )}
                </div>
             </div>
        </div>

      </div>
    </div>
  );
};
