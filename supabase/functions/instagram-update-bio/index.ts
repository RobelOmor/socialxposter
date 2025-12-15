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

    // Get VPS IP from admin config
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config, error: configError } = await supabaseAdmin
      .from('telegram_admin_config')
      .select('vps_ip')
      .single();

    if (configError || !config?.vps_ip) {
      console.error('VPS IP not configured:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'VPS IP not configured in admin panel' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    let vpsBaseUrl = config.vps_ip;
    
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

    console.log(`Calling VPS for bio update: ${vpsBaseUrl}/update-bio`);

    // Call VPS to update bio
    const vpsResponse = await fetch(`${vpsBaseUrl}/update-bio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookies: account.cookies,
        new_bio: newBio || '',
      }),
    });

    const vpsResult = await vpsResponse.json();
    console.log('VPS Response:', JSON.stringify(vpsResult));

    if (vpsResult.success) {
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
      if (vpsResult.status === 'suspended') {
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
      } else if (vpsResult.status === 'expired') {
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
          error: vpsResult.error || 'Failed to update bio'
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
