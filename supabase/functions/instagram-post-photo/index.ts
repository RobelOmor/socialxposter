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

    const { accountId, imageData, imageUrl } = await req.json();
    
    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Account ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!imageData && !imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Image data or URL is required' }),
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

    if (account.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: 'Account session is expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Posting photo to account:', account.username);

    // Parse cookies
    const cookieObj: Record<string, string> = {};
    account.cookies.split(';').forEach((cookie: string) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        cookieObj[key.trim()] = value.trim();
      }
    });

    const csrfToken = cookieObj['csrftoken'];
    const dsUserId = cookieObj['ds_user_id'];

    // Get image buffer
    let imageBuffer: ArrayBuffer;
    
    if (imageUrl) {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to fetch image from URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      imageBuffer = await imageResponse.arrayBuffer();
    } else {
      // Handle base64 data
      const base64Data = imageData.split(',')[1] || imageData;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      imageBuffer = bytes.buffer;
    }

    const uploadId = Date.now().toString();
    const entityName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000) + 1000000000}`;

    // Step 1: Upload photo
    console.log('Uploading photo...');
    const uploadResponse = await fetch(
      `https://i.instagram.com/rupload_igphoto/${entityName}`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
          'X-CSRFToken': csrfToken,
          'X-IG-App-ID': '936619743392459',
          'X-Entity-Name': entityName,
          'X-Entity-Length': imageBuffer.byteLength.toString(),
          'X-Entity-Type': 'image/jpeg',
          'X-Instagram-Rupload-Params': JSON.stringify({
            upload_id: uploadId,
            media_type: 1,
            retry_context: JSON.stringify({
              num_step_auto_retry: 0,
              num_reupload: 0,
              num_step_manual_retry: 0,
            }),
            image_compression: JSON.stringify({
              lib_name: 'moz',
              lib_version: '3.1.m',
              quality: '80',
            }),
          }),
          'Cookie': account.cookies,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload photo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', uploadResult);

    // Step 2: Configure media
    console.log('Configuring media...');
    const configureResponse = await fetch(
      'https://i.instagram.com/api/v1/media/configure/',
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
          'X-CSRFToken': csrfToken,
          'X-IG-App-ID': '936619743392459',
          'Cookie': account.cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          upload_id: uploadId,
          source_type: '4',
          caption: '',
          _csrftoken: csrfToken,
          _uid: dsUserId,
          device_id: 'android-' + Math.random().toString(36).substring(2, 15),
          timezone_offset: '0',
        }).toString(),
      }
    );

    if (!configureResponse.ok) {
      const errorText = await configureResponse.text();
      console.error('Configure failed:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to configure media' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const configureResult = await configureResponse.json();
    console.log('Configure result:', configureResult);

    if (configureResult.status === 'ok') {
      // Update posts count
      await supabaseClient
        .from('instagram_accounts')
        .update({ posts_count: (account.posts_count || 0) + 1 })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          mediaId: configureResult.media?.id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: configureResult.message || 'Failed to post' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
