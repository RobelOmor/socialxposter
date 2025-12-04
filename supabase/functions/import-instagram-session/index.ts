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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

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

    // Fetch user info from Instagram
    const userInfoResponse = await fetch(
      `https://i.instagram.com/api/v1/users/${dsUserId}/info/`,
      {
        headers: {
          'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
          'X-CSRFToken': csrfToken,
          'X-IG-App-ID': '936619743392459',
          'Cookie': cookieString,
        },
      }
    );

    const responseText = await userInfoResponse.text();
    console.log('Instagram API Response Status:', userInfoResponse.status);
    console.log('Instagram API Response Body:', responseText);

    let userInfo;
    try {
      userInfo = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Instagram response:', e);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response from Instagram',
          details: responseText.substring(0, 200)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for suspended account
    const isSuspended = userInfo.message === 'challenge_required' && 
      userInfo.challenge?.url?.includes('instagram.com/accounts/suspended');
    
    if (isSuspended) {
      console.log('Account is SUSPENDED');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account is SUSPENDED by Instagram',
          reason: 'suspended',
          instagram_response: userInfo
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for challenge required (not suspended but needs verification)
    if (userInfo.message === 'challenge_required') {
      console.log('Challenge required:', userInfo.challenge?.url);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account requires verification - please verify on Instagram app first',
          reason: 'challenge_required',
          instagram_response: userInfo
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for login required
    if (userInfo.message === 'login_required' || userInfo.message === 'Please wait a few minutes before you try again.') {
      console.log('Login required or rate limited');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: userInfo.message === 'login_required' ? 'Session expired - cookies are invalid' : 'Rate limited - please try again later',
          reason: userInfo.message === 'login_required' ? 'expired' : 'rate_limited',
          instagram_response: userInfo
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for other errors
    if (!userInfoResponse.ok || userInfo.status === 'fail') {
      console.error('Instagram API error:', userInfoResponse.status, userInfo.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: userInfo.message || 'Invalid or expired session cookies',
          reason: 'api_error',
          instagram_response: userInfo
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const igUser = userInfo.user;

    if (!igUser) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Could not fetch Instagram user info - invalid response',
          reason: 'no_user_data',
          instagram_response: userInfo
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Instagram user found:', igUser.username);

    // Check if account already exists
    const { data: existingAccount } = await supabaseClient
      .from('instagram_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('username', igUser.username)
      .single();

    if (existingAccount) {
      // Account already exists - return duplicate status
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account already connected',
          duplicate: true,
          data: { username: igUser.username }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Insert new account
      const { error: insertError } = await supabaseClient
        .from('instagram_accounts')
        .insert({
          user_id: user.id,
          username: igUser.username,
          full_name: igUser.full_name,
          profile_pic_url: igUser.profile_pic_url,
          posts_count: igUser.media_count || 0,
          followers_count: igUser.follower_count || 0,
          following_count: igUser.following_count || 0,
          bio: igUser.biography || '',
          cookies: cookieString,
          status: 'active',
          last_checked: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: {
          username: igUser.username,
          full_name: igUser.full_name,
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
