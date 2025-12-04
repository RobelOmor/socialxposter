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

    // Parse cookies - supports string, JSON object, and JSON array formats
    let cookieObj: Record<string, string> = {};
    let cookieString = account.cookies;
    
    const trimmedCookies = account.cookies.trim();
    
    if (trimmedCookies.startsWith('[') && trimmedCookies.endsWith(']')) {
      try {
        const jsonArray = JSON.parse(trimmedCookies);
        jsonArray.forEach((cookie: { name: string; value: string }) => {
          if (cookie.name && cookie.value) {
            cookieObj[cookie.name] = cookie.value;
          }
        });
        cookieString = Object.entries(cookieObj)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
      } catch (e) {
        console.error('Failed to parse JSON array cookies:', e);
      }
    } else if (trimmedCookies.startsWith('{') && trimmedCookies.endsWith('}')) {
      try {
        cookieObj = JSON.parse(trimmedCookies);
        cookieString = Object.entries(cookieObj)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
      } catch (e) {
        console.error('Failed to parse JSON cookies:', e);
      }
    } else {
      account.cookies.split(';').forEach((cookie: string) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          cookieObj[key.trim()] = value.trim();
        }
      });
    }

    const dsUserId = cookieObj['ds_user_id'];
    const csrfToken = cookieObj['csrftoken'];

    // Test/refresh session by fetching user info
    console.log('=== Instagram Session Check START ===');
    console.log('Account username:', account.username);
    console.log('ds_user_id:', dsUserId);
    console.log('csrftoken:', csrfToken ? 'present' : 'missing');
    
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

    // Log raw response details
    console.log('=== Instagram API Response ===');
    console.log('HTTP Status:', userInfoResponse.status);
    console.log('Status Text:', userInfoResponse.statusText);
    
    const responseText = await userInfoResponse.text();
    console.log('Raw Response Body:', responseText);
    
    let newStatus: 'active' | 'expired' = 'expired';
    let updateData: any = {
      last_checked: new Date().toISOString(),
    };

    // Try to parse the response
    let userInfo: any = null;
    try {
      userInfo = JSON.parse(responseText);
      console.log('Parsed JSON:', JSON.stringify(userInfo, null, 2));
    } catch (e) {
      console.log('Failed to parse response as JSON');
    }

    if (userInfoResponse.ok && userInfo?.user) {
      const igUser = userInfo.user;
      newStatus = 'active';
      updateData = {
        ...updateData,
        full_name: igUser.full_name,
        profile_pic_url: igUser.profile_pic_url,
        posts_count: igUser.media_count || 0,
        followers_count: igUser.follower_count || 0,
        following_count: igUser.following_count || 0,
        bio: igUser.biography || '',
        status: 'active',
      };
      console.log('Session is ACTIVE');
    } else {
      console.log('Session marked as EXPIRED');
      console.log('Reason - Response OK:', userInfoResponse.ok, '| User exists:', !!userInfo?.user);
      if (userInfo?.message) console.log('Instagram message:', userInfo.message);
      if (userInfo?.status) console.log('Instagram status:', userInfo.status);
      if (userInfo?.error_type) console.log('Error type:', userInfo.error_type);
      if (userInfo?.spam) console.log('Spam flag:', userInfo.spam);
      if (userInfo?.lock) console.log('Lock flag:', userInfo.lock);
      if (userInfo?.checkpoint_url) console.log('Checkpoint URL:', userInfo.checkpoint_url);
      updateData.status = 'expired';
    }
    console.log('=== Instagram Session Check END ===')

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
        data: updateData
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
