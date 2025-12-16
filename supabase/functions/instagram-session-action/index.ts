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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { accountId, action } = await req.json();
    
    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get account
    const { data: account, error: accountError } = await supabaseClient
      .from('instagram_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Performing ${action} on account:`, account.username);

    // Get assigned proxy for this account
    const { data: assignedProxy, error: proxyFetchError } = await supabaseClient
      .from('instagram_proxies')
      .select('*')
      .eq('used_by_account_id', accountId)
      .single();

    if (proxyFetchError || !assignedProxy) {
      console.error('No assigned proxy for account:', accountId);
      return new Response(
        JSON.stringify({ success: false, error: 'No proxy assigned to this account. Please re-add the account.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using assigned proxy:', assignedProxy.proxy_host, ':', assignedProxy.proxy_port);

    // Get VPS IP from admin config
    const { data: config, error: configError } = await supabaseAdmin
      .from('telegram_admin_config')
      .select('instagram_vps_ip')
      .single();

    if (configError || !config?.instagram_vps_ip) {
      console.error('Instagram VPS IP not configured:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Instagram VPS IP not configured in admin panel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let vpsBaseUrl = config.instagram_vps_ip;
    
    // Handle different URL formats
    if (vpsBaseUrl.includes('.ngrok') || vpsBaseUrl.includes('ngrok-free.app')) {
      if (!vpsBaseUrl.startsWith('http://') && !vpsBaseUrl.startsWith('https://')) {
        vpsBaseUrl = `https://${vpsBaseUrl}`;
      }
    } else if (vpsBaseUrl.startsWith('http://') || vpsBaseUrl.startsWith('https://')) {
      // URL already has protocol, use as-is
    } else {
      // Plain IP, use Instagram port 8001
      vpsBaseUrl = `http://${vpsBaseUrl}:8001`;
    }

    vpsBaseUrl = vpsBaseUrl.replace(/\/$/, '');

    // Build proxy string in ip:port:user:pass format
    const proxyString = assignedProxy.proxy_username && assignedProxy.proxy_password
      ? `${assignedProxy.proxy_host}:${assignedProxy.proxy_port}:${assignedProxy.proxy_username}:${assignedProxy.proxy_password}`
      : `${assignedProxy.proxy_host}:${assignedProxy.proxy_port}`;

    console.log(`Calling VPS for session validation: ${vpsBaseUrl}/validate-session`);

    // Call VPS to validate session with proxy
    const vpsResponse = await fetch(`${vpsBaseUrl}/validate-session`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ 
        cookies: account.cookies,
        // Backward compatible field (some VPS builds expect this)
        proxy: proxyString,
        // Telegram-style explicit fields (recommended)
        proxy_host: assignedProxy.proxy_host,
        proxy_port: assignedProxy.proxy_port,
        proxy_username: assignedProxy.proxy_username,
        proxy_password: assignedProxy.proxy_password,
      }),
    });

    const vpsResult = await vpsResponse.json();
    console.log('VPS Response:', JSON.stringify(vpsResult));

    // If VPS cannot use SOCKS proxy, do NOT mark account as expired.
    if (typeof vpsResult?.error === 'string' && vpsResult.error.toLowerCase().includes('missing dependencies for socks')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Instagram VPS-এ SOCKS support dependency নেই. VPS container এ `pip install "httpx[socks]"` (বা `socksio`) দিয়ে আবার restart/build করুন.',
          reason: 'vps_proxy_dependency_missing',
          vps_response: vpsResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let newStatus: 'active' | 'expired' | 'suspended' = 'expired';
    let updateData: any = {
      last_checked: new Date().toISOString(),
    };

    const isValid = (vpsResult?.success && vpsResult?.user) || vpsResult?.valid === true;

    const isSuspended =
      vpsResult?.status === 'suspended' ||
      vpsResult?.message === 'challenge_required' ||
      (typeof vpsResult?.url === 'string' &&
        vpsResult.url.includes('instagram.com/accounts/suspended/'));

    if (isValid) {
      // VPS may return either { success: true, user: {...} } or { valid: true, ...fields }
      const igUser =
        vpsResult?.user && typeof vpsResult.user === 'object' ? vpsResult.user : vpsResult;

      newStatus = 'active';
      updateData = {
        ...updateData,
        full_name: igUser?.full_name ?? '',
        profile_pic_url: igUser?.profile_pic_url ?? null,
        posts_count: igUser?.media_count ?? igUser?.posts_count ?? 0,
        followers_count: igUser?.follower_count ?? igUser?.followers_count ?? 0,
        following_count: igUser?.following_count ?? 0,
        bio: igUser?.biography ?? igUser?.bio ?? '',
        status: 'active',
      };
      console.log('Session is ACTIVE');
    } else if (isSuspended) {
      console.log('=== SUSPEND DETECTED ===');
      newStatus = 'suspended';
      updateData.status = 'suspended';
    } else {
      console.log('Session marked as EXPIRED');
      updateData.status = 'expired';
    }

    // Update account
    const { error: updateError } = await supabaseClient
      .from('instagram_accounts')
      .update(updateData)
      .eq('id', accountId);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: newStatus,
        data: updateData,
        vps_response: vpsResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
