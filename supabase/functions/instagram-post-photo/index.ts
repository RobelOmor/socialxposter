import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSTAGRAM_MIN_RATIO = 4 / 5; // 0.8 (4:5)
const INSTAGRAM_MAX_RATIO = 1.91;  // 1.91:1
const INSTAGRAM_MAX_DIMENSION = 1080; // standard feed max side
const INSTAGRAM_JPEG_QUALITY = 85;

async function normalizeImageForInstagram(
  originalBytes: Uint8Array,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const img = await Image.decode(originalBytes);

  const originalWidth = img.width;
  const originalHeight = img.height;
  const ratio = originalWidth / originalHeight;

  let cropX = 0;
  let cropY = 0;
  let cropWidth = originalWidth;
  let cropHeight = originalHeight;

  if (ratio < INSTAGRAM_MIN_RATIO) {
    // Too tall -> crop height
    cropHeight = Math.floor(originalWidth / INSTAGRAM_MIN_RATIO);
    cropY = Math.max(0, Math.floor((originalHeight - cropHeight) / 2));
  } else if (ratio > INSTAGRAM_MAX_RATIO) {
    // Too wide -> crop width
    cropWidth = Math.floor(originalHeight * INSTAGRAM_MAX_RATIO);
    cropX = Math.max(0, Math.floor((originalWidth - cropWidth) / 2));
  }

  let out = img;
  if (cropWidth !== originalWidth || cropHeight !== originalHeight) {
    out = img.crop(cropX, cropY, cropWidth, cropHeight);
  }

  const maxDim = Math.max(out.width, out.height);
  if (maxDim > INSTAGRAM_MAX_DIMENSION) {
    const scale = INSTAGRAM_MAX_DIMENSION / maxDim;
    const targetW = Math.max(1, Math.round(out.width * scale));
    const targetH = Math.max(1, Math.round(out.height * scale));
    out = out.resize(targetW, targetH);
  }

  const bytes = await out.encodeJPEG(INSTAGRAM_JPEG_QUALITY);
  return { bytes, width: out.width, height: out.height };
}

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

    // Get image bytes
    let imageBytes: Uint8Array;
    
    if (imageUrl) {
      // Force JPEG format for Unsplash and similar services that return WebP
      let finalUrl = imageUrl;
      if (imageUrl.includes('unsplash.com')) {
        // Remove auto=format and add fm=jpg to force JPEG
        finalUrl = imageUrl.replace(/auto=format[^&]*/g, '').replace(/&&/g, '&');
        finalUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + 'fm=jpg';
      }
      
      console.log('Downloading image from URL:', finalUrl);
      // Download with browser-like headers requesting JPEG specifically
      const imageResponse = await fetch(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/jpeg,image/png,image/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': imageUrl,
        }
      });
      
      if (!imageResponse.ok) {
        console.error('Image download failed:', imageResponse.status, imageResponse.statusText);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to download image: ${imageResponse.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
      console.log('Downloaded image bytes:', imageBytes.length);
      
      if (imageBytes.length < 100) {
        console.error('Downloaded image too small, likely blocked');
        return new Response(
          JSON.stringify({ success: false, error: 'Image download failed - received empty or too small file' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (imageData) {
      // imageData is base64 encoded
      const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'No image provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Image size:', imageBytes.length, 'bytes');

    // IMPORTANT: Instagram checks the REAL uploaded image aspect ratio.
    // So we must actually crop/resize the image bytes (not only send crop params).
    let imgWidth = 1080;
    let imgHeight = 1080;

    try {
      const normalized = await normalizeImageForInstagram(imageBytes);
      imageBytes = normalized.bytes;
      imgWidth = normalized.width;
      imgHeight = normalized.height;
      console.log('Final image for Instagram:', imgWidth, 'x', imgHeight, 'bytes:', imageBytes.length);
    } catch (e) {
      console.error('Image decode/normalize failed:', e);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unsupported/corrupt image. Please try a direct JPG/PNG image link.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Generate upload ID
    const uploadId = Date.now().toString();
    const uploadName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000) + 1000000000}`;

    // Step 1: Upload image to Instagram with actual dimensions
    console.log('Step 1: Uploading image to Instagram...');
    
    const uploadHeaders = {
      'Cookie': cookieString,
      'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
      'X-IG-App-ID': '936619743392459',
      'X-CSRFToken': csrfToken,
      'X-Instagram-Rupload-Params': JSON.stringify({
        'media_type': 1,
        'upload_id': uploadId,
        'upload_media_height': imgHeight,
        'upload_media_width': imgWidth,
      }),
      'X-Entity-Name': uploadName,
      'X-Entity-Length': imageBytes.length.toString(),
      'X-Entity-Type': 'image/jpeg',
      'Content-Type': 'application/octet-stream',
      'Offset': '0',
    };

    const uploadResponse = await fetch(`https://i.instagram.com/rupload_igphoto/${uploadName}`, {
      method: 'POST',
      headers: uploadHeaders,
      body: imageBytes.buffer as ArrayBuffer,
    });

    const uploadResult = await uploadResponse.json();
    console.log('Upload response:', JSON.stringify(uploadResult));

    if (!uploadResult.upload_id) {
      // Check for account issues
      if (uploadResult.message === 'challenge_required' || uploadResult.message === 'login_required') {
        await supabaseClient
          .from('instagram_accounts')
          .update({ status: uploadResult.message === 'challenge_required' ? 'suspended' : 'expired' })
          .eq('id', accountId);
          
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: uploadResult.message === 'challenge_required' ? 'Account is suspended' : 'Session expired',
            status: uploadResult.message === 'challenge_required' ? 'suspended' : 'expired'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload image: ' + (uploadResult.message || 'Unknown error') }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Configure/publish the photo with crop settings
    console.log('Step 2: Configuring/publishing photo...');

    const configureData = {
      'upload_id': uploadId,
      'source_type': '4',
      'caption': '',
      'device': {
        'manufacturer': 'samsung',
        'model': 'SM-G991B',
        'android_version': 33,
        'android_release': '13'
      },
      'edits': {
        'crop_original_size': [imgWidth, imgHeight],
        'crop_center': [0.0, 0.0],
        'crop_zoom': 1.0
      },
      'extra': {
        'source_width': imgWidth,
        'source_height': imgHeight
      }
    };

    console.log('Configure data:', JSON.stringify(configureData));

    const configureResponse = await fetch('https://i.instagram.com/api/v1/media/configure/', {
      method: 'POST',
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)',
        'X-IG-App-ID': '936619743392459',
        'X-CSRFToken': csrfToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `signed_body=SIGNATURE.${encodeURIComponent(JSON.stringify(configureData))}`,
    });

    const configureResult = await configureResponse.json();
    console.log('Configure response:', JSON.stringify(configureResult).substring(0, 500));

    if (configureResult.status === 'ok' && configureResult.media) {
      // Update posts count
      await supabaseClient
        .from('instagram_accounts')
        .update({ posts_count: (account.posts_count || 0) + 1 })
        .eq('id', accountId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          mediaId: configureResult.media.id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Check if account is suspended/expired
      if (configureResult.message === 'challenge_required') {
        await supabaseClient
          .from('instagram_accounts')
          .update({ status: 'suspended' })
          .eq('id', accountId);
          
        return new Response(
          JSON.stringify({ success: false, error: 'Account is suspended', status: 'suspended' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (configureResult.message === 'login_required') {
        await supabaseClient
          .from('instagram_accounts')
          .update({ status: 'expired' })
          .eq('id', accountId);
          
        return new Response(
          JSON.stringify({ success: false, error: 'Session expired', status: 'expired' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: configureResult.message || 'Failed to post photo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
