import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ProxyAgent, fetch as undiciFetch } from "https://esm.sh/undici@6.6.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create proxied fetch function
async function proxiedFetch(url: string, options: any, proxyUrl: string): Promise<any> {
  const dispatcher = new ProxyAgent(proxyUrl);
  const response = await undiciFetch(url, {
    ...options,
    dispatcher,
  });
  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const proxy711Password = Deno.env.get('PROXY_711_PASSWORD') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    // Service client to read admin config
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

    // Get 711proxy config from admin settings
    const { data: adminConfig } = await supabaseAdmin
      .from('telegram_admin_config')
      .select('proxy_711_host, proxy_711_port, proxy_711_username')
      .limit(1)
      .single();

    // Build proxy URL
    let proxyUrl = '';
    const useProxy = adminConfig?.proxy_711_host && adminConfig?.proxy_711_username && proxy711Password;
    
    if (useProxy) {
      proxyUrl = `http://${adminConfig.proxy_711_username}:${proxy711Password}@${adminConfig.proxy_711_host}:${adminConfig.proxy_711_port || 10000}`;
      console.log('Using 711proxy:', adminConfig.proxy_711_host);
    } else {
      console.warn('711proxy not configured, using direct connection (may be blocked by Instagram)');
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

    // Check if account has a proxy assigned (legacy check - now we use 711proxy)
    const { data: proxy, error: proxyError } = await supabaseClient
      .from('instagram_proxies')
      .select('id, proxy_host, proxy_port')
      .eq('used_by_account_id', accountId)
      .single();

    if (proxyError || !proxy) {
      return new Response(
        JSON.stringify({ success: false, error: 'No proxy assigned. Please assign a proxy first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Performing ${action} on account:`, account.username, 'via 711proxy');

    // Parse cookies
    let cookieObj: Record<string, string> = {};
    const cookieString = account.cookies;
    
    if (cookieString.includes(';')) {
      cookieString.split(';').forEach((cookie: string) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          cookieObj[key.trim()] = value.trim();
        }
      });
    }

    const csrfToken = cookieObj['csrftoken'] || '';
    const dsUserId = cookieObj['ds_user_id'] || '';

    const commonHeaders = {
      'Cookie': cookieString,
      'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
      'X-IG-App-ID': '936619743392459',
      'X-CSRFToken': csrfToken,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-IG-Device-ID': crypto.randomUUID(),
      'X-IG-Android-ID': 'android-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16),
    };

    // Step 1: Validate session with current_user endpoint using proxy
    console.log('Calling Instagram API for session validation via 711proxy');
    
    let igResponse: any;
    if (useProxy) {
      igResponse = await proxiedFetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
        method: 'GET',
        headers: commonHeaders,
      }, proxyUrl);
    } else {
      igResponse = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
        method: 'GET',
        headers: commonHeaders,
      });
    }

    const igResponseText = await igResponse.text();
    let igResult: any;
    try {
      igResult = JSON.parse(igResponseText);
    } catch (e) {
      console.error('Failed to parse Instagram response:', igResponseText.substring(0, 500));
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid response from Instagram' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Session validation response status:', igResponse.status);

    let newStatus: 'active' | 'expired' | 'suspended' = 'expired';
    let updateData: any = {
      last_checked: new Date().toISOString(),
    };

    // Check for suspended account
    const isSuspended = igResult?.message === 'challenge_required' ||
      igResult?.message === 'user_has_logged_out' ||
      (typeof igResult?.checkpoint_url === 'string' && igResult.checkpoint_url.includes('suspended'));

    // Check for valid response
    const isValid = igResult?.user && igResponse.status === 200;

    if (isValid) {
      const igUser = igResult.user;
      const userId = igUser?.pk || dsUserId;
      
      newStatus = 'active';
      updateData = {
        ...updateData,
        full_name: igUser?.full_name ?? '',
        profile_pic_url: igUser?.profile_pic_url ?? null,
        bio: igUser?.biography ?? '',
        status: 'active',
      };

      // Step 2: Fetch user stats from /users/{user_id}/info/ endpoint using proxy
      if (userId) {
        console.log('Fetching user stats for user_id:', userId);
        try {
          let statsResponse: any;
          if (useProxy) {
            statsResponse = await proxiedFetch(`https://i.instagram.com/api/v1/users/${userId}/info/`, {
              method: 'GET',
              headers: commonHeaders,
            }, proxyUrl);
          } else {
            statsResponse = await fetch(`https://i.instagram.com/api/v1/users/${userId}/info/`, {
              method: 'GET',
              headers: commonHeaders,
            });
          }

          if (statsResponse.ok) {
            const statsText = await statsResponse.text();
            const statsResult = JSON.parse(statsText);
            console.log('User stats response:', JSON.stringify(statsResult).substring(0, 500));

            if (statsResult?.user) {
              const statsUser = statsResult.user;
              updateData.posts_count = statsUser?.media_count ?? 0;
              updateData.followers_count = statsUser?.follower_count ?? 0;
              updateData.following_count = statsUser?.following_count ?? 0;
              console.log(`Stats: posts=${updateData.posts_count}, followers=${updateData.followers_count}, following=${updateData.following_count}`);
            }
          } else {
            console.log('Stats fetch failed with status:', statsResponse.status);
          }
        } catch (statsError) {
          console.error('Error fetching stats:', statsError);
        }
      }

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
        instagram_response: igResult,
        proxy_used: useProxy ? adminConfig?.proxy_711_host : 'none'
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
