import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const bucketName = 'kanal-doluluk';

const client = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const SupabaseService = {
  isEnabled: Boolean(client),

  async listFiles() {
    if (!client) throw new Error('Supabase client is not initialized');
    const { data, error } = await client.storage
      .from(bucketName)
      .list('', { limit: 1000, offset: 0, sortBy: { column: 'updated_at', order: 'desc' } });

    if (error) {
      console.warn('⚠️ listFiles error (RLS policy may be missing):', error.message);
      return [];
    }
    return data || [];
  },

  async downloadFile(path) {
    if (!client) throw new Error('Supabase client is not initialized');
    const { data, error } = await client.storage.from(bucketName).download(path);
    if (error) throw error;
    return data;
  },

  async downloadViaPublicUrl(path) {
    if (!client) throw new Error('Supabase client is not initialized');
    const url = this.getPublicUrl(path);
    if (!url) throw new Error('Could not get public URL');
    console.log('📥 Downloading via public URL:', url);
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.blob();
  },

  getPublicUrl(path) {
    if (!client) throw new Error('Supabase client is not initialized');
    const { data } = client.storage.from(bucketName).getPublicUrl(path);
    return data?.publicUrl ?? null;
  },
};
