import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoint, ...params } = await req.json();
    
    console.log(`Instagram VPS Proxy - Endpoint: ${endpoint}`);

    // Get admin config for VPS IP
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Instagram VPS IP from admin config
    const { data: config, error: configError } = await supabase
      .from('telegram_admin_config')
      .select('instagram_vps_ip')
      .single();

    if (configError || !config?.instagram_vps_ip) {
      console.error('Instagram VPS IP not configured:', configError);
      return new Response(
        JSON.stringify({ error: 'Instagram VPS IP not configured in admin panel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let vpsBaseUrl = config.instagram_vps_ip;
    
    // Handle different URL formats
    if (vpsBaseUrl.includes('.ngrok') || vpsBaseUrl.includes('ngrok-free.app')) {
      // ngrok URL - use https without port
      if (!vpsBaseUrl.startsWith('http://') && !vpsBaseUrl.startsWith('https://')) {
        vpsBaseUrl = `https://${vpsBaseUrl}`;
      }
    } else if (vpsBaseUrl.startsWith('http://') || vpsBaseUrl.startsWith('https://')) {
      // URL already has protocol - check if it has a port already
      // If no port specified and not ngrok, add :8001
      const urlObj = new URL(vpsBaseUrl);
      if (!urlObj.port && !vpsBaseUrl.includes('ngrok')) {
        vpsBaseUrl = `${urlObj.protocol}//${urlObj.hostname}:8001`;
      }
    } else {
      // Plain IP without protocol - add http and port 8001
      // Check if port is already included (e.g., "192.168.1.1:8001")
      if (vpsBaseUrl.includes(':')) {
        vpsBaseUrl = `http://${vpsBaseUrl}`;
      } else {
        vpsBaseUrl = `http://${vpsBaseUrl}:8001`;
      }
    }

    // Remove trailing slash
    vpsBaseUrl = vpsBaseUrl.replace(/\/$/, '');

    const vpsUrl = `${vpsBaseUrl}${endpoint}`;
    console.log(`Forwarding to VPS: ${vpsUrl}`);

    // Use GET for health check, POST for other endpoints
    const isHealthCheck = endpoint === "/" || endpoint === "/health";
    
    const response = await fetch(vpsUrl, {
      method: isHealthCheck ? 'GET' : 'POST',
      headers: isHealthCheck ? {} : {
        'Content-Type': 'application/json',
      },
      body: isHealthCheck ? undefined : JSON.stringify(params),
    });

    const data = await response.json();
    console.log(`VPS Response status: ${response.status}`);

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    console.error('Instagram VPS Proxy Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to connect to VPS';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
