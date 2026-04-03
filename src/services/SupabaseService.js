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

    if (error) throw error;
    return data || [];
  },

  async downloadFile(path) {
    if (!client) throw new Error('Supabase client is not initialized');
    const { data, error } = await client.storage.from(bucketName).download(path);
    if (error) throw error;
    return data;
  },

  getPublicUrl(path) {
    if (!client) throw new Error('Supabase client is not initialized');
    const { data, error } = client.storage.from(bucketName).getPublicUrl(path);
    if (error) throw error;
    return data?.publicUrl ?? null;
  },
};
