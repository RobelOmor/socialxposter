import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get admin config for VPS URL
    const { data: config, error: configError } = await supabaseClient
      .from('telegram_admin_config')
      .select('*')
      .limit(1)
      .single();

    if (configError && configError.code !== 'PGRST116') {
      throw new Error('Failed to fetch config: ' + configError.message);
    }

    if (!config?.vps_ip) {
      return new Response(
        JSON.stringify({ error: 'VPS not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vpsBaseUrl = config.vps_ip.startsWith('http') 
      ? config.vps_ip 
      : `http://${config.vps_ip}:8000`;

    const { endpoint, method = 'GET', body } = await req.json();

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Endpoint required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vpsUrl = `${vpsBaseUrl}${endpoint}`;
    console.log(`Proxying ${method} request to: ${vpsUrl}`);

    // Inject API credentials into the body for endpoints that need them
    let enrichedBody = body || {};
    if (endpoint !== '/health') {
      enrichedBody = {
        ...enrichedBody,
        api_id: enrichedBody.api_id || config.api_id || '2040',
        api_hash: enrichedBody.api_hash || config.api_hash || 'b18441a1ff607e10a989891a5462e627',
      };
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method !== 'GET') {
      fetchOptions.body = JSON.stringify(enrichedBody);
    }

    const response = await fetch(vpsUrl, fetchOptions);
    const responseText = await response.text();
    console.log(`VPS Response (${response.status}):`, responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw_response: responseText, parse_error: true };
    }

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('VPS Proxy Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
