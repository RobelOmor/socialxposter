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

    // Get VPS IP from admin config
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const { data: config, error: configError } = await supabaseAdmin
      .from('telegram_admin_config')
      .select('vps_ip')
      .single();

    if (configError || !config?.vps_ip) {
      console.error('VPS IP not configured:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'VPS IP not configured in admin panel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    console.log(`Calling VPS for session validation: ${vpsBaseUrl}/validate-session`);

    // Call VPS to validate session
    const vpsResponse = await fetch(`${vpsBaseUrl}/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: account.cookies }),
    });

    const vpsResult = await vpsResponse.json();
    console.log('VPS Response:', JSON.stringify(vpsResult));

    let newStatus: 'active' | 'expired' | 'suspended' = 'expired';
    let updateData: any = {
      last_checked: new Date().toISOString(),
    };

    const isValid = (vpsResult?.success && vpsResult?.user) || vpsResult?.valid === true;

    const isSuspended =
      vpsResult?.status === 'suspended' ||
      vpsResult?.message === 'challenge_required' ||
      (typeof vpsResult?.url === 'string' &&
        vpsResult.url.includes('instagram.com/accounts/suspended/'));

    if (isValid) {
      // VPS may return either { success: true, user: {...} } or { valid: true, ...fields }
      const igUser =
        vpsResult?.user && typeof vpsResult.user === 'object' ? vpsResult.user : vpsResult;

      newStatus = 'active';
      updateData = {
        ...updateData,
        full_name: igUser?.full_name ?? '',
        profile_pic_url: igUser?.profile_pic_url ?? null,
        posts_count: igUser?.media_count ?? igUser?.posts_count ?? 0,
        followers_count: igUser?.follower_count ?? igUser?.followers_count ?? 0,
        following_count: igUser?.following_count ?? 0,
        bio: igUser?.biography ?? igUser?.bio ?? '',
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
        vps_response: vpsResult
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
