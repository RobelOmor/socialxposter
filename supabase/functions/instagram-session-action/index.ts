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

    // Parse cookies - supports both string and JSON format
    let cookieObj: Record<string, string> = {};
    let cookieString = account.cookies;
    
    const trimmedCookies = account.cookies.trim();
    if (trimmedCookies.startsWith('{') && trimmedCookies.endsWith('}')) {
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

    let newStatus: 'active' | 'expired' = 'expired';
    let updateData: any = {
      last_checked: new Date().toISOString(),
    };

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      const igUser = userInfo.user;

      if (igUser) {
        newStatus = 'active';
        updateData = {
          ...updateData,
          full_name: igUser.full_name,
          profile_pic_url: igUser.profile_pic_url,
          posts_count: igUser.media_count || 0,
          followers_count: igUser.follower_count || 0,
          following_count: igUser.following_count || 0,
          status: 'active',
        };
        console.log('Session is active, updated stats');
      }
    } else {
      console.log('Session expired or invalid');
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
