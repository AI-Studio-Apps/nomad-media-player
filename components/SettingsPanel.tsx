import React, { useEffect, useState, useRef } from 'react';
import { Save, Key, ExternalLink, CheckCircle, AlertCircle, Lock, Database, Download, Upload } from 'lucide-react';
import { dbService } from '../services/db';
import { cryptoService } from '../services/crypto';
import { youtubeService } from '../services/youtube';
import { Button } from './Button';
import { Input } from './Input';

interface SettingsPanelProps {
    sessionKey: CryptoKey;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ sessionKey }) => {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  
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
    } catch (e) {
      console.error(e);
      setStatus('error');
      setStatusMsg('Failed to decrypt existing key.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
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
        
        // Save to DB
        await dbService.saveSettings({ apiKey: encryptedData });
        
        // Update the in-memory service immediately
        youtubeService.setApiKey(apiKey.trim());

        setStatus('success');
        setStatusMsg('API Key encrypted and saved successfully.');
    } catch (error: any) {
        setStatus('error');
        setStatusMsg(error.message);
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
              // Optional: window.location.reload();
          } catch (err: any) {
              console.error(err);
              setBackupStatus('error');
              setBackupMsg('Import failed: Invalid file or database error.');
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset so same file can be selected again if needed
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
            <form onSubmit={handleSave} className="space-y-6">
                <div className="flex items-start gap-4">
                    <div className="bg-zinc-900 p-3 rounded-lg text-primary">
                        <Key size={24} />
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <h3 className="text-lg font-medium text-white mb-1">YouTube API Key</h3>
                            <p className="text-sm text-zinc-400 mb-4">
                                Required to fetch channel and playlist data.
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

        {/* Instructions */}
        <div className="p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
            <h3 className="font-semibold text-white mb-4">How to get an API Key</h3>
            <ol className="list-decimal list-inside space-y-3 text-zinc-400 text-sm">
                <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" className="text-primary hover:underline inline-flex items-center">Google Cloud Console <ExternalLink size={10} className="ml-1" /></a>.</li>
                <li>Create a new project (e.g., "Nomad Media Player").</li>
                <li>Navigate to "APIs & Services" &gt; "Library".</li>
                <li>Search for and enable <strong>YouTube Data API v3</strong>.</li>
                <li>Go to "Credentials" and create a new <strong>API Key</strong>.</li>
                <li>(Optional) Restrict the key to <code>HTTP Referrers</code> (add <code>http://localhost:3000</code> or your domain).</li>
                <li>Copy the key and paste it above.</li>
            </ol>
            <div className="mt-4 text-xs text-zinc-500">
                Note: The free quota allows for ~10,000 requests per day.
            </div>
        </div>

      </div>
    </div>
  );
};