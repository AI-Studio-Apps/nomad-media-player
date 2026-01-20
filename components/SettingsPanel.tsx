
import React, { useEffect, useState, useRef } from 'react';
import { Save, Key, CheckCircle, AlertCircle, Lock, Database, Download, Upload, Globe, Cloud, Youtube, Video, Clock, Loader } from 'lucide-react';
import { dbService } from '../services/db';
import { cryptoService } from '../services/crypto';
import { youtubeService } from '../services/youtube';
import { vimeoService } from '../services/vimeo';
import { dailymotionService } from '../services/dailymotion';
import { proxyService } from '../services/proxy';
import { DEFAULT_PROXY_1, DEFAULT_PROXY_2, DEFAULT_NOMAD_URL } from '../services/proxy';
import { Button } from './Button';
import { Input } from './Input';

interface SettingsPanelProps {
    sessionKey: CryptoKey;
}

const CACHE_OPTIONS = [
    { label: '8 Hours', value: 8 * 60 * 60 * 1000 },
    { label: '24 Hours', value: 24 * 60 * 60 * 1000 },
    { label: '48 Hours', value: 48 * 60 * 60 * 1000 },
    { label: '1 Week', value: 7 * 24 * 60 * 60 * 1000 },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ sessionKey }) => {
  // Platform Credentials
  const [apiKey, setApiKey] = useState('');
  const [vimeoToken, setVimeoToken] = useState('');
  const [dailymotionToken, setDailymotionToken] = useState('');

  // Nomad Proxy
  const [nomadKey, setNomadKey] = useState('');
  const [nomadUrl, setNomadUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');

  // Custom/Public Proxies
  const [customProxy, setCustomProxy] = useState('');
  const [proxy1, setProxy1] = useState(DEFAULT_PROXY_1);
  const [proxy2, setProxy2] = useState(DEFAULT_PROXY_2);

  // Cache
  const [cacheDuration, setCacheDuration] = useState(CACHE_OPTIONS[0].value);

  // Status States
  const [loading, setLoading] = useState(true);
  const [credsStatus, setCredsStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [credsMsg, setCredsMsg] = useState('');
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [proxyMsg, setProxyMsg] = useState('');
  const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [backupMsg, setBackupMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, [sessionKey]);

  const loadSettings = async () => {
    try {
      const settings = await dbService.getSettings();
      
      // Decrypt Credentials
      if (settings?.apiKey) setApiKey(await cryptoService.decryptData(settings.apiKey, sessionKey));
      if (settings?.vimeoToken) setVimeoToken(await cryptoService.decryptData(settings.vimeoToken, sessionKey));
      if (settings?.dailymotionToken) setDailymotionToken(await cryptoService.decryptData(settings.dailymotionToken, sessionKey));
      
      // Decrypt Nomad Key
      if (settings?.nomadProxyKey) setNomadKey(await cryptoService.decryptData(settings.nomadProxyKey, sessionKey));
      
      // Load URLs
      setNomadUrl(settings?.nomadUrl || DEFAULT_NOMAD_URL);
      setCustomProxy(settings?.customProxyUrl || '');
      setProxy1(settings?.proxy1Url || DEFAULT_PROXY_1);
      setProxy2(settings?.proxy2Url || DEFAULT_PROXY_2);

      // Load Cache
      if (settings?.feedCacheDuration) {
          setCacheDuration(settings.feedCacheDuration);
      }

    } catch (e) {
      console.error(e);
      setCredsStatus('error');
      setCredsMsg('Failed to decrypt existing keys.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredsStatus('idle');
    
    try {
        const settings = await dbService.getSettings() || {};
        
        // Encrypt all optional fields
        const encApiKey = apiKey.trim() ? await cryptoService.encryptData(apiKey.trim(), sessionKey) : undefined;
        const encVimeo = vimeoToken.trim() ? await cryptoService.encryptData(vimeoToken.trim(), sessionKey) : undefined;
        const encDaily = dailymotionToken.trim() ? await cryptoService.encryptData(dailymotionToken.trim(), sessionKey) : undefined;

        await dbService.saveSettings({ 
            ...settings,
            apiKey: encApiKey,
            vimeoToken: encVimeo,
            dailymotionToken: encDaily
        });
        
        // Update Services immediately
        youtubeService.setApiKey(apiKey.trim());
        vimeoService.setToken(vimeoToken.trim());
        dailymotionService.setToken(dailymotionToken.trim());

        setCredsStatus('success');
        setCredsMsg('Platform credentials encrypted and saved.');
    } catch (error: any) {
        setCredsStatus('error');
        setCredsMsg(error.message);
    }
  };

  const handleSaveNetwork = async (e: React.FormEvent) => {
      e.preventDefault();
      setProxyStatus('idle');

      try {
        const currentSettings = await dbService.getSettings() || {};
        
        // Encrypt Nomad Key
        const encNomadKey = nomadKey.trim() ? await cryptoService.encryptData(nomadKey.trim(), sessionKey) : undefined;
        
        // Update in-memory
        proxyService.setNomadKey(nomadKey.trim());
        proxyService.setNomadUrl(nomadUrl.trim());

        await dbService.saveSettings({
            ...currentSettings,
            nomadProxyKey: encNomadKey,
            nomadUrl: nomadUrl.trim(),
            customProxyUrl: customProxy.trim(),
            proxy1Url: proxy1.trim(),
            proxy2Url: proxy2.trim()
        });

        setProxyStatus('success');
        setProxyMsg('Network configuration saved.');
      } catch (e: any) {
          setProxyStatus('error');
          setProxyMsg('Failed to save settings: ' + e.message);
      }
  };

  const handleTestNomad = async () => {
      if (!nomadKey.trim()) return;
      setTestStatus('testing');
      setTestMsg('');
      const url = nomadUrl.trim() || DEFAULT_NOMAD_URL;
      
      try {
          await proxyService.testConnection(url, nomadKey.trim());
          setTestStatus('success');
          // If success, update local memory immediately so other fetches might benefit without saving
          proxyService.setNomadKey(nomadKey.trim());
          proxyService.setNomadUrl(url);
      } catch (e: any) {
          setTestStatus('error');
          setTestMsg(e.message || 'Failed');
      }
  };

  const handleCacheChange = async (duration: number) => {
      setCacheDuration(duration);
      try {
          const settings = await dbService.getSettings() || {};
          await dbService.saveSettings({
              ...settings,
              feedCacheDuration: duration
          });
      } catch (e) {
          console.error("Failed to save cache setting", e);
      }
  };

  // ... Import/Export logic remains same as previous ...
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

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!window.confirm("Warning: This will merge the backup with current data. Continue?")) {
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
              setBackupMsg('Database imported. Reload required.');
          } catch (err: any) {
              setBackupStatus('error');
              setBackupMsg('Import failed: Invalid file.');
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  if (loading) return <div>Loading secure settings...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <div className="flex items-center gap-2 text-green-400 bg-green-900/20 px-3 py-1 rounded-full w-fit mb-2">
            <Lock size={12} />
            <span className="text-xs font-semibold">Secure Encryption Active</span>
        </div>
      </div>

      {/* 1. Platform Integrations (Keys) */}
      <div className="bg-surface border border-zinc-700 rounded-xl p-6">
            <form onSubmit={handleSaveCredentials} className="space-y-6">
                <div className="flex items-start gap-4">
                    <div className="bg-zinc-900 p-3 rounded-lg text-primary">
                        <Key size={24} />
                    </div>
                    <div className="flex-1 space-y-4">
                        <h3 className="text-lg font-medium text-white">Platform Credentials</h3>
                        <p className="text-sm text-zinc-400 mb-4">
                            API Keys allow the app to fetch high-quality data directly from the source, bypassing proxies.
                        </p>
                        
                        <div className="space-y-4">
                             <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-1">
                                    <Youtube size={14} className="text-red-500" /> YouTube API Key
                                </label>
                                <Input 
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="AIzaSy..."
                                    type="password"
                                />
                             </div>
                             <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-1">
                                    <Video size={14} className="text-blue-400" /> Vimeo Access Token (Optional)
                                </label>
                                <Input 
                                    value={vimeoToken}
                                    onChange={e => setVimeoToken(e.target.value)}
                                    placeholder="Vimeo personal access token"
                                    type="password"
                                />
                             </div>
                             <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-1">
                                    <Video size={14} className="text-white" /> Dailymotion Token (Optional)
                                </label>
                                <Input 
                                    value={dailymotionToken}
                                    onChange={e => setDailymotionToken(e.target.value)}
                                    placeholder="Dailymotion bearer token"
                                    type="password"
                                />
                             </div>
                        </div>

                        {credsStatus !== 'idle' && (
                            <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${credsStatus === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900' : 'bg-red-900/20 text-red-400 border border-red-900'}`}>
                                {credsStatus === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {credsMsg}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit">Encrypt & Save Keys</Button>
                        </div>
                    </div>
                </div>
            </form>
      </div>

      {/* 2. Network Infrastructure */}
      <div className="bg-surface border border-zinc-700 rounded-xl p-6">
            <form onSubmit={handleSaveNetwork} className="space-y-6">
                <div className="flex items-start gap-4">
                    <div className="bg-zinc-900 p-3 rounded-lg text-blue-400">
                        <Globe size={24} />
                    </div>
                    <div className="flex-1 space-y-4">
                        <h3 className="text-lg font-medium text-white">Network Infrastructure</h3>
                        <p className="text-sm text-zinc-400">
                            Configure how the application connects to external content when API keys are missing.
                        </p>
                        
                        {/* Nomad Proxy */}
                        <div className="p-4 bg-blue-900/10 border border-blue-900/30 rounded-lg space-y-3">
                            <div className="flex items-center justify-between text-blue-300 font-semibold text-sm">
                                <div className="flex items-center gap-2">
                                    <Cloud size={16} /> Nomad Proxy (Private Worker)
                                </div>
                                {testStatus !== 'idle' && (
                                    <div className={`flex items-center gap-1 text-xs ${testStatus === 'success' ? 'text-green-400' : testStatus === 'testing' ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {testStatus === 'success' && <CheckCircle size={14} />}
                                        {testStatus === 'error' && <AlertCircle size={14} />}
                                        {testStatus === 'testing' && <Loader size={14} className="animate-spin" />}
                                        <span>
                                            {testStatus === 'success' ? 'Connected' : testStatus === 'testing' ? 'Testing...' : (testMsg || 'Failed')}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input 
                                    value={nomadUrl}
                                    onChange={e => {
                                        setNomadUrl(e.target.value);
                                        setTestStatus('idle');
                                        setTestMsg('');
                                    }}
                                    placeholder="https://nomad.workers.dev/"
                                    label="Worker URL"
                                />
                                <div className="relative">
                                    <Input 
                                        type="password"
                                        value={nomadKey}
                                        onChange={e => {
                                            setNomadKey(e.target.value);
                                            setTestStatus('idle');
                                            setTestMsg('');
                                        }}
                                        placeholder="Proxy Key"
                                        label="Proxy Key"
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleTestNomad}
                                        disabled={!nomadKey.trim() || testStatus === 'testing'}
                                        className="absolute right-2 top-8 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500 disabled:opacity-50"
                                    >
                                        Test
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Public/Custom Proxies */}
                        <div className="space-y-4 pt-2 border-t border-zinc-700/50">
                            <Input 
                                value={customProxy}
                                onChange={e => setCustomProxy(e.target.value)}
                                placeholder="https://my-proxy.homelab.local/?url="
                                label="Custom Homelab Proxy (Priority 2)"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input 
                                    value={proxy1}
                                    onChange={e => setProxy1(e.target.value)}
                                    placeholder="https://api.allorigins.win/raw?url="
                                    label="Public Proxy 1"
                                />
                                <Input 
                                    value={proxy2}
                                    onChange={e => setProxy2(e.target.value)}
                                    placeholder="https://corsproxy.io/?"
                                    label="Public Proxy 2"
                                />
                            </div>
                        </div>

                        {proxyStatus !== 'idle' && (
                            <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${proxyStatus === 'success' ? 'bg-green-900/20 text-green-400 border border-green-900' : 'bg-red-900/20 text-red-400 border border-red-900'}`}>
                                {proxyStatus === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {proxyMsg}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit" variant="secondary">Save Network Config</Button>
                        </div>
                    </div>
                </div>
            </form>
      </div>

      {/* 3. Cache Strategy */}
      <div className="bg-surface border border-zinc-700 rounded-xl p-6">
          <div className="flex items-start gap-4">
              <div className="bg-zinc-900 p-3 rounded-lg text-yellow-500">
                  <Clock size={24} />
              </div>
              <div className="flex-1 space-y-4">
                  <h3 className="text-lg font-medium text-white">Data Cache</h3>
                  <p className="text-sm text-zinc-400">
                      Store feed results locally to improve speed and reduce network usage. 
                      Fresh content will only be fetched after the selected duration.
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {CACHE_OPTIONS.map((opt) => {
                          const isSelected = cacheDuration === opt.value;
                          return (
                              <button
                                  key={opt.label}
                                  type="button"
                                  onClick={() => handleCacheChange(opt.value)}
                                  className={`aspect-square flex items-center justify-center rounded-xl border-2 transition-all font-semibold ${
                                      isSelected 
                                      ? 'bg-yellow-600 border-yellow-500 text-white shadow-lg shadow-yellow-900/20' 
                                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                  }`}
                              >
                                  {opt.label}
                              </button>
                          )
                      })}
                  </div>
              </div>
          </div>
      </div>

      {/* 4. Data Backup */}
      <div className="bg-surface border border-zinc-700 rounded-xl p-6">
             <div className="flex items-start gap-4">
                <div className="bg-zinc-900 p-3 rounded-lg text-purple-400">
                    <Database size={24} />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-medium text-white mb-1">Data Backup</h3>
                    <p className="text-sm text-zinc-400 mb-6">
                        Export your channels and settings (excluding encrypted keys for security) to JSON.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Button variant="secondary" onClick={handleExport} className="flex-1">
                            <Download size={16} className="mr-2" /> Export
                        </Button>
                        <Button variant="secondary" onClick={handleImportClick} className="flex-1">
                            <Upload size={16} className="mr-2" /> Import
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
  );
};
