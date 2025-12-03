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

    // Parse cookies to extract required values
    const cookieObj: Record<string, string> = {};
    cookies.split(';').forEach((cookie: string) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        cookieObj[key.trim()] = value.trim();
      }
    });

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
          'Cookie': cookies,
        },
      }
    );

    if (!userInfoResponse.ok) {
      console.error('Instagram API error:', userInfoResponse.status);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session cookies' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userInfo = await userInfoResponse.json();
    const igUser = userInfo.user;

    if (!igUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not fetch Instagram user info' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
          cookies: cookies,
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
