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

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { cookies } = await req.json();
    
    if (!cookies) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cookies are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for available proxy first
    const { data: availableProxy, error: proxyError } = await supabaseClient
      .from('instagram_proxies')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'available')
      .is('used_by_account_id', null)
      .limit(1)
      .single();

    if (proxyError || !availableProxy) {
      console.log('No available proxy found');
      return new Response(
        JSON.stringify({ success: false, error: 'No available proxy. Please add a proxy first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using proxy:', availableProxy.proxy_host, ':', availableProxy.proxy_port);

    // Parse cookies to extract required values - supports string, JSON object, and JSON array formats
    let cookieObj: Record<string, string> = {};
    let cookieString = cookies;
    
    const trimmedCookies = cookies.trim();
    
    // Check if cookies is JSON array format (array of {name, value} objects)
    if (trimmedCookies.startsWith('[') && trimmedCookies.endsWith(']')) {
      try {
        const jsonArray = JSON.parse(trimmedCookies);
        jsonArray.forEach((cookie: { name: string; value: string }) => {
          if (cookie.name && cookie.value) {
            cookieObj[cookie.name] = cookie.value;
          }
        });
        // Convert to cookie string for API requests
        cookieString = Object.entries(cookieObj)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
        console.log('Parsed JSON array cookies, found keys:', Object.keys(cookieObj));
      } catch (e) {
        console.error('Failed to parse JSON array cookies:', e);
      }
    } 
    // Check if cookies is JSON object format
    else if (trimmedCookies.startsWith('{') && trimmedCookies.endsWith('}')) {
      try {
        cookieObj = JSON.parse(trimmedCookies);
        cookieString = Object.entries(cookieObj)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
        console.log('Parsed JSON object cookies');
      } catch (e) {
        console.error('Failed to parse JSON object cookies:', e);
      }
    } 
    // String format cookies
    else {
      cookies.split(';').forEach((cookie: string) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          cookieObj[key.trim()] = value.trim();
        }
      });
      console.log('Parsed string format cookies');
    }

    const sessionId = cookieObj['sessionid'];
    const dsUserId = cookieObj['ds_user_id'];
    const csrfToken = cookieObj['csrftoken'];

    if (!sessionId || !dsUserId || !csrfToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required cookies: sessionid, ds_user_id, csrftoken' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating Instagram session for user:', dsUserId);

    // Call Instagram API directly to validate session
    const igResponse = await fetch('https://i.instagram.com/api/v1/accounts/current_user/?edit=true', {
      method: 'GET',
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
        'X-IG-App-ID': '936619743392459',
        'X-CSRFToken': csrfToken,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-Device-ID': crypto.randomUUID(),
        'X-IG-Android-ID': 'android-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16),
      },
    });

    const igResult = await igResponse.json();
    console.log('Instagram API Response status:', igResponse.status);
    console.log('Instagram API Response:', JSON.stringify(igResult).substring(0, 500));

    // Check for suspended account
    const isSuspended = igResult?.message === 'challenge_required' ||
      igResult?.message === 'user_has_logged_out' ||
      (typeof igResult?.checkpoint_url === 'string' && igResult.checkpoint_url.includes('suspended'));
    
    if (isSuspended) {
      console.log('Account is SUSPENDED');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account is SUSPENDED by Instagram',
          reason: 'suspended',
          instagram_response: igResult
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for challenge required
    if (igResult?.message === 'challenge_required') {
      console.log('Challenge required');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account requires verification - please verify on Instagram app first',
          reason: 'challenge_required',
          instagram_response: igResult
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for login required / expired
    if (igResult?.message === 'login_required' || igResponse.status === 401 || !igResult?.user) {
      console.log('Session invalid or expired');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Session expired - cookies are invalid',
          reason: 'expired',
          instagram_response: igResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const igUser = igResult.user;
    const username = igUser?.username || `user_${dsUserId}`;

    console.log('Instagram user found:', username);

    // Check if account already exists
    const { data: existingAccount } = await supabaseClient
      .from('instagram_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('username', username)
      .single();

    if (existingAccount) {
      // Account already exists - return duplicate status
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account already connected',
          duplicate: true,
          data: { username }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new account
    const { data: newAccount, error: insertError } = await supabaseClient
      .from('instagram_accounts')
      .insert({
        user_id: user.id,
        username: username,
        full_name: igUser?.full_name || '',
        profile_pic_url: igUser?.profile_pic_url || null,
        posts_count: igUser?.media_count ?? 0,
        followers_count: igUser?.follower_count ?? 0,
        following_count: igUser?.following_count ?? 0,
        bio: igUser?.biography ?? '',
        cookies: cookieString,
        status: 'active',
        last_checked: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark proxy as used by this account
    const { error: proxyUpdateError } = await supabaseClient
      .from('instagram_proxies')
      .update({ 
        status: 'used',
        used_by_account_id: newAccount.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', availableProxy.id);

    if (proxyUpdateError) {
      console.error('Failed to update proxy status:', proxyUpdateError);
    } else {
      console.log('Proxy marked as used for account:', newAccount.id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: {
          username: username,
          full_name: igUser?.full_name || '',
        }
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
