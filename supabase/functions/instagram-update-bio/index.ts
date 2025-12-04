import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Parse request body
    const { accountId, newBio } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Fetch the account
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

    // Parse cookies
    let cookieString = '';
    let csrfToken = '';
    let dsUserId = '';
    
    const cookiesRaw = account.cookies;
    
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(cookiesRaw);
      
      if (Array.isArray(parsed)) {
        // JSON array format (Netscape cookie format)
        const cookieParts: string[] = [];
        for (const cookie of parsed) {
          if (cookie.name && cookie.value) {
            cookieParts.push(`${cookie.name}=${cookie.value}`);
            if (cookie.name === 'csrftoken') csrfToken = cookie.value;
            if (cookie.name === 'ds_user_id') dsUserId = cookie.value;
          }
        }
        cookieString = cookieParts.join('; ');
      } else if (typeof parsed === 'object') {
        // JSON object format
        const cookieParts: string[] = [];
        for (const [key, value] of Object.entries(parsed)) {
          cookieParts.push(`${key}=${value}`);
          if (key === 'csrftoken') csrfToken = value as string;
          if (key === 'ds_user_id') dsUserId = value as string;
        }
        cookieString = cookieParts.join('; ');
      }
    } catch {
      // String format
      cookieString = cookiesRaw;
      const parts = cookiesRaw.split(';');
      for (const part of parts) {
        const [key, value] = part.trim().split('=');
        if (key === 'csrftoken') csrfToken = value;
        if (key === 'ds_user_id') dsUserId = value;
      }
    }

    if (!csrfToken || !dsUserId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid cookies: missing csrftoken or ds_user_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Updating bio for user ${dsUserId}, new bio: "${newBio}"`);

    // Update bio via Instagram API
    const formData = new URLSearchParams();
    formData.append('raw_text', newBio || '');

    const response = await fetch('https://i.instagram.com/api/v1/accounts/set_biography/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-IG-App-ID': '936619743392459',
        'X-IG-Device-ID': crypto.randomUUID(),
        'X-CSRFToken': csrfToken,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieString,
        'Origin': 'https://www.instagram.com',
        'Referer': 'https://www.instagram.com/',
      },
      body: formData.toString(),
    });

    const responseText = await response.text();
    console.log('Instagram API Response Status:', response.status);
    console.log('Instagram API Response Body:', responseText);

    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    // Check for suspension/challenge
    if (responseData.message === 'challenge_required' || 
        (responseData.challenge?.url && responseData.challenge.url.includes('instagram.com/accounts/suspended'))) {
      // Update account status to suspended
      await supabase
        .from('instagram_accounts')
        .update({ status: 'suspended', last_checked: new Date().toISOString() })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Account is suspended',
          reason: 'suspended',
          instagram_response: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check for login required
    if (responseData.message === 'login_required' || response.status === 401) {
      await supabase
        .from('instagram_accounts')
        .update({ status: 'expired', last_checked: new Date().toISOString() })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Session expired, please re-login',
          reason: 'expired',
          instagram_response: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check for success
    if (response.ok && responseData.status === 'ok') {
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
    }

    // Other error
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: responseData.message || 'Failed to update bio',
        reason: 'unknown',
        instagram_response: responseData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('Error updating bio:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
