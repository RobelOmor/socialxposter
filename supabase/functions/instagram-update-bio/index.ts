import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { accountId, newBio } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { data: account, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      console.error('Account fetch error:', accountError);
      return new Response(
        JSON.stringify({ success: false, error: 'Account not found or access denied' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log(`Updating bio for account: ${account.username}`);

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

    // Call Instagram API directly to update bio
    console.log('Calling Instagram API directly to update bio');

    const formData = new URLSearchParams();
    formData.append('biography', newBio || '');
    formData.append('email', '');
    formData.append('phone_number', '');
    formData.append('external_url', '');
    formData.append('first_name', account.full_name || '');

    const igResponse = await fetch('https://i.instagram.com/api/v1/accounts/edit_profile/', {
      method: 'POST',
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
        'X-IG-App-ID': '936619743392459',
        'X-CSRFToken': csrfToken,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: formData.toString(),
    });

    const igResult = await igResponse.json();
    console.log('Instagram API Response:', JSON.stringify(igResult));

    if (igResult.status === 'ok' || igResult.user) {
      // Update bio in database
      await supabase
        .from('instagram_accounts')
        .update({ bio: newBio || '', last_checked: new Date().toISOString() })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Bio updated successfully',
          newBio: newBio || ''
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Check if account is suspended/expired
      if (igResult.message === 'challenge_required') {
        await supabase
          .from('instagram_accounts')
          .update({ status: 'suspended', last_checked: new Date().toISOString() })
          .eq('id', accountId);

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Account is suspended',
            reason: 'suspended'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      } else if (igResult.message === 'login_required') {
        await supabase
          .from('instagram_accounts')
          .update({ status: 'expired', last_checked: new Date().toISOString() })
          .eq('id', accountId);

        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Session expired',
            reason: 'expired'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: igResult.message || 'Failed to update bio'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

  } catch (error) {
    console.error('Error updating bio:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
