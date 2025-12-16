import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to get JPEG dimensions from image bytes
function getJpegDimensions(imageBytes: Uint8Array): { width: number; height: number } | null {
  try {
    // Look for SOF0 (Start of Frame) marker in JPEG
    // JPEG markers start with 0xFF
    for (let i = 0; i < imageBytes.length - 10; i++) {
      // Look for SOF markers (0xFFC0-0xFFC3 are common frame markers)
      if (imageBytes[i] === 0xFF && 
          (imageBytes[i + 1] === 0xC0 || imageBytes[i + 1] === 0xC1 || 
           imageBytes[i + 1] === 0xC2 || imageBytes[i + 1] === 0xC3)) {
        // SOF marker found, dimensions are at offset +5 (height) and +7 (width)
        const height = (imageBytes[i + 5] << 8) | imageBytes[i + 6];
        const width = (imageBytes[i + 7] << 8) | imageBytes[i + 8];
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Function to crop image dimensions to Instagram-allowed aspect ratio (center crop calculation)
function getCroppedDimensions(width: number, height: number): { 
  cropWidth: number; 
  cropHeight: number;
  offsetX: number;
  offsetY: number;
} {
  const aspectRatio = width / height;
  
  // Instagram allows aspect ratios between 0.8 (4:5 portrait) and 1.91 (landscape)
  const MIN_RATIO = 0.8;  // 4:5 portrait
  const MAX_RATIO = 1.91; // 1.91:1 landscape
  
  let cropWidth = width;
  let cropHeight = height;
  let offsetX = 0;
  let offsetY = 0;
  
  if (aspectRatio < MIN_RATIO) {
    // Too tall, crop top and bottom to get 4:5
    cropHeight = Math.floor(width / MIN_RATIO);
    offsetY = Math.floor((height - cropHeight) / 2);
  } else if (aspectRatio > MAX_RATIO) {
    // Too wide, crop left and right to get 1.91:1
    cropWidth = Math.floor(height * MAX_RATIO);
    offsetX = Math.floor((width - cropWidth) / 2);
  }
  
  return { cropWidth, cropHeight, offsetX, offsetY };
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
      console.log('Downloading image from URL:', imageUrl);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to download image from URL' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
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

    // Get actual image dimensions
    const dimensions = getJpegDimensions(imageBytes);
    let imgWidth = 1080;
    let imgHeight = 1080;
    
    if (dimensions) {
      imgWidth = dimensions.width;
      imgHeight = dimensions.height;
      console.log('Detected image dimensions:', imgWidth, 'x', imgHeight);
    } else {
      console.log('Could not detect dimensions, using default 1080x1080');
    }

    // Calculate crop for Instagram-allowed aspect ratio
    const { cropWidth, cropHeight, offsetX, offsetY } = getCroppedDimensions(imgWidth, imgHeight);
    console.log('Crop dimensions:', cropWidth, 'x', cropHeight, 'offset:', offsetX, offsetY);

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

    // Calculate crop center as percentage offset from center (0 = center)
    const cropCenterX = imgWidth > 0 ? (offsetX + cropWidth / 2 - imgWidth / 2) / imgWidth : 0;
    const cropCenterY = imgHeight > 0 ? (offsetY + cropHeight / 2 - imgHeight / 2) / imgHeight : 0;
    const cropZoom = imgWidth > 0 ? imgWidth / cropWidth : 1;

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
        'crop_center': [cropCenterX, cropCenterY],
        'crop_zoom': cropZoom
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
