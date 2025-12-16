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

    // Call Instagram API directly to validate/refresh session
    console.log('Calling Instagram API directly for session validation');

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
      newStatus = 'active';
      updateData = {
        ...updateData,
        full_name: igUser?.full_name ?? '',
        profile_pic_url: igUser?.profile_pic_url ?? null,
        posts_count: igUser?.media_count ?? 0,
        followers_count: igUser?.follower_count ?? 0,
        following_count: igUser?.following_count ?? 0,
        bio: igUser?.biography ?? '',
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
        instagram_response: igResult
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
