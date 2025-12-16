import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function createProxyClient(proxyUrl: string): Deno.HttpClient | null {
  try {
    return Deno.createHttpClient({ proxy: { url: proxyUrl } });
  } catch (e) {
    console.error("Failed to create proxy HTTP client:", e);
    return null;
  }
}

async function proxiedFetch(
  url: string,
  options: RequestInit,
  proxyClient: Deno.HttpClient,
): Promise<Response> {
  return await fetch(url, { ...(options as any), client: proxyClient } as any);
}

// High Success Mode: Auto-retry configuration with more attempts
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 2000, 3000, 5000, 8000]; // Exponential backoff in ms

// Retry helper with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  retryOn: (error: any) => boolean,
  context: string,
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES && retryOn(error)) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(
          `[${context}] Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

// Check if error is retryable (network/timeout/connection issues)
function isRetryableError(error: any): boolean {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("socket") ||
    message.includes("fetch failed") ||
    message.includes("connection reset") ||
    message.includes("connection error") ||
    message.includes("sendrequest")
  );
}

const INSTAGRAM_MIN_RATIO = 4 / 5; // 0.8 (4:5)
const INSTAGRAM_MAX_RATIO = 1.91; // 1.91:1
const INSTAGRAM_MAX_DIMENSION = 1080; // standard feed max side
const INSTAGRAM_JPEG_QUALITY = 85;

// Guardrails to prevent Edge Function OOM (images can be small in bytes but huge in pixels)
const MAX_IMAGE_BYTES_FOR_DECODE = 900_000; // 900KB
const MAX_IMAGE_PIXELS_FOR_DECODE = 4_000_000; // 4MP

type ImageDims = { width: number; height: number };

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function getPngDimensions(bytes: Uint8Array): ImageDims | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  return width && height ? { width, height } : null;
}

function getJpegDimensions(bytes: Uint8Array): ImageDims | null {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // SOI

  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }

    // Skip fill bytes 0xFF
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) break;

    const marker = bytes[i];
    i++;

    // Standalone markers (no length)
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS

    if (i + 1 >= bytes.length) break;
    const blockLength = (bytes[i] << 8) + bytes[i + 1];
    if (blockLength < 2 || i + blockLength - 2 >= bytes.length) break;

    // SOF0/SOF2 contain dimensions
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3
    ) {
      // i: length MSB, i+1: length LSB
      // i+2: precision
      const height = (bytes[i + 3] << 8) + bytes[i + 4];
      const width = (bytes[i + 5] << 8) + bytes[i + 6];
      return width && height ? { width, height } : null;
    }

    i += blockLength;
  }

  return null;
}

function getImageDimensions(bytes: Uint8Array): ImageDims | null {
  return getPngDimensions(bytes) || getJpegDimensions(bytes);
}

function optimizeRemoteImageUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname;

    // Pexels supports query-based resizing/cropping (dramatically reduces memory usage)
    if (host.includes("images.pexels.com")) {
      u.searchParams.set("auto", "compress");
      u.searchParams.set("cs", "tinysrgb");
      u.searchParams.set("fit", "crop");
      u.searchParams.set("w", "1080");
      u.searchParams.set("h", "1350"); // 4:5 ratio
      u.searchParams.set("dpr", "1");
      return u.toString();
    }

    // Unsplash supports query-based resizing; force jpg
    if (host.includes("images.unsplash.com")) {
      u.searchParams.set("fm", "jpg");
      u.searchParams.set("q", "80");
      u.searchParams.set("w", "1080");
      u.searchParams.set("fit", "max");
      return u.toString();
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

async function normalizeImageForInstagram(
  originalBytes: Uint8Array,
): Promise<{ bytes: Uint8Array; width: number; height: number; processed: boolean }> {
  const dims = getImageDimensions(originalBytes);
  const pixels = dims ? dims.width * dims.height : null;

  const canDecode =
    originalBytes.length <= MAX_IMAGE_BYTES_FOR_DECODE &&
    (pixels == null || pixels <= MAX_IMAGE_PIXELS_FOR_DECODE);

  // Skip heavy image processing when risky; still return real width/height if we can detect it.
  if (!canDecode) {
    console.log(
      "Skipping image processing (OOM guard). bytes=",
      originalBytes.length,
      "dims=",
      dims ? `${dims.width}x${dims.height}` : "unknown",
    );
    return {
      bytes: originalBytes,
      width: dims?.width ?? 1080,
      height: dims?.height ?? 1080,
      processed: false,
    };
  }

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
  return { bytes, width: out.width, height: out.height, processed: true };
}

// Safety limits configuration
const DAILY_POST_LIMIT = 3;
const COOLDOWN_MINUTES = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let proxyClient: Deno.HttpClient | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const proxy711Password = Deno.env.get("PROXY_711_PASSWORD") ?? "";

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });

    // Service client to read admin config
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accountId, imageData, imageUrl, skipLimits } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: "Account ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!imageData && !imageUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Image data or URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get 711proxy config from admin settings
    const { data: adminConfig } = await supabaseAdmin
      .from("telegram_admin_config")
      .select("proxy_711_host, proxy_711_port, proxy_711_username")
      .limit(1)
      .single();

    const proxyHost = adminConfig?.proxy_711_host as string | null | undefined;
    const proxyPort = (adminConfig?.proxy_711_port as number | null | undefined) ?? 10000;
    const proxyBaseUsername = adminConfig?.proxy_711_username as string | null | undefined;

    if (!proxyHost || !proxyBaseUsername) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "711proxy not configured. Set proxy host/port/username in Admin Telegram Config.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!proxy711Password) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "PROXY_711_PASSWORD secret missing. Please set it in Supabase secrets.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sticky session per IG account
    const sessionKey = String(accountId).replace(/-/g, "").slice(0, 12);
    const proxyUsername = `${proxyBaseUsername}-session-${sessionKey}`;
    const proxyUrl = `http://${encodeURIComponent(proxyUsername)}:${encodeURIComponent(proxy711Password)}@${proxyHost}:${proxyPort}`;

    proxyClient = createProxyClient(proxyUrl);
    if (!proxyClient) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to initialize proxy client (Edge runtime).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Using 711proxy:", proxyHost, "port:", proxyPort, "user:", proxyUsername);

    // Get account with safety tracking fields
    const { data: account, error: accountError } = await supabaseClient
      .from("instagram_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ success: false, error: "Account not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (account.status !== "active") {
      return new Response(
        JSON.stringify({ success: false, error: "Account session is expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      "Posting to account:",
      account.username,
      "via 711proxy:",
      adminConfig?.proxy_711_host,
    );

    // Safety checks (unless skipped for admin/testing)
    if (!skipLimits) {
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // Check cooldown (30 minutes)
      if (account.last_posted_at) {
        const lastPosted = new Date(account.last_posted_at);
        const minutesSinceLastPost =
          (now.getTime() - lastPosted.getTime()) / (1000 * 60);

        if (minutesSinceLastPost < COOLDOWN_MINUTES) {
          const remainingMinutes = Math.ceil(
            COOLDOWN_MINUTES - minutesSinceLastPost,
          );
          return new Response(
            JSON.stringify({
              success: false,
              error: `Cooldown active. Wait ${remainingMinutes} minutes.`,
              reason: "cooldown",
              cooldown_remaining: remainingMinutes,
            }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Check daily limit
      let postsToday = account.posts_today || 0;
      const postsTodayDate = account.posts_today_date;

      // Reset counter if it's a new day
      if (postsTodayDate !== today) {
        postsToday = 0;
      }

      if (postsToday >= DAILY_POST_LIMIT) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Daily limit reached (${DAILY_POST_LIMIT}/day). Try again tomorrow.`,
            reason: "daily_limit",
            posts_today: postsToday,
            daily_limit: DAILY_POST_LIMIT,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log("Posting photo to account:", account.username);

    // Parse cookies
    let cookieObj: Record<string, string> = {};
    const cookieString = account.cookies;

    if (cookieString.includes(";")) {
      cookieString.split(";").forEach((cookie: string) => {
        const [key, value] = cookie.trim().split("=");
        if (key && value) {
          cookieObj[key.trim()] = value.trim();
        }
      });
    }

    const csrfToken = cookieObj["csrftoken"] || "";

    // Get image bytes
    let imageBytes: Uint8Array;

    if (imageUrl) {
      // HIGH SUCCESS MODE: Auto-resize images from known providers to reduce memory usage
      const finalUrl = optimizeRemoteImageUrl(imageUrl);
      console.log("Downloading image from optimized URL:", finalUrl);
      
      // Download with browser-like headers requesting JPEG specifically (using regular fetch)
      const imageResponse = await fetch(finalUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/jpeg,image/png,image/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: imageUrl,
        },
      });

      if (!imageResponse.ok) {
        console.error(
          "Image download failed:",
          imageResponse.status,
          imageResponse.statusText,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to download image: ${imageResponse.status}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
      console.log("Downloaded image bytes:", imageBytes.length);

      if (imageBytes.length < 100) {
        console.error("Downloaded image too small, likely blocked");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Image download failed - received empty or too small file",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (imageData) {
      // imageData is base64 encoded
      const base64Data = imageData.includes(",") ? imageData.split(",")[1] : imageData;
      imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    } else {
      return new Response(JSON.stringify({ success: false, error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Image size:", imageBytes.length, "bytes");

    // IMPORTANT: Instagram checks the REAL uploaded image aspect ratio.
    // So we must actually crop/resize the image bytes (not only send crop params).
    let imgWidth = 1080;
    let imgHeight = 1080;

    try {
      const normalized = await normalizeImageForInstagram(imageBytes);
      imageBytes = normalized.bytes;
      imgWidth = normalized.width;
      imgHeight = normalized.height;
      console.log(
        "Final image for Instagram:",
        imgWidth,
        "x",
        imgHeight,
        "bytes:",
        imageBytes.length,
      );
    } catch (e) {
      console.error("Image decode/normalize failed:", e);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unsupported/corrupt image. Please try a direct JPG/PNG image link.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate upload ID
    const uploadId = Date.now().toString();

    // HIGH SUCCESS MODE: Upload with proxy session fallback
    // Each retry uses a different proxy session key for fresh IP
    console.log("Step 1: Uploading image to Instagram via 711proxy with session fallback...");

    let uploadResult: any = null;
    let lastUploadError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Generate new upload name for each attempt
        const uploadName = `${uploadId}_0_${Math.floor(Math.random() * 9000000000) + 1000000000}`;
        
        // Rotate proxy session on retry (fresh IP from pool)
        const retrySessionKey = attempt === 0 
          ? sessionKey 
          : `${sessionKey}${String(attempt).padStart(2, '0')}`;
        const retryProxyUsername = `${proxyBaseUsername}-session-${retrySessionKey}`;
        const retryProxyUrl = `http://${encodeURIComponent(retryProxyUsername)}:${encodeURIComponent(proxy711Password)}@${proxyHost}:${proxyPort}`;
        
        // Create new proxy client for this attempt
        const retryProxyClient = createProxyClient(retryProxyUrl);
        if (!retryProxyClient) {
          throw new Error("Failed to create proxy client for retry");
        }

        if (attempt > 0) {
          console.log(`[Upload] Retry ${attempt}/${MAX_RETRIES} with new session: ${retryProxyUsername}`);
        }

        const uploadHeaders = {
          Cookie: cookieString,
          "User-Agent":
            "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)",
          "X-IG-App-ID": "936619743392459",
          "X-CSRFToken": csrfToken,
          "X-Instagram-Rupload-Params": JSON.stringify({
            media_type: 1,
            upload_id: uploadId,
            upload_media_height: imgHeight,
            upload_media_width: imgWidth,
          }),
          "X-Entity-Name": uploadName,
          "X-Entity-Length": imageBytes.length.toString(),
          "X-Entity-Type": "image/jpeg",
          "Content-Type": "application/octet-stream",
          Offset: "0",
        };

        const uploadResponse = await proxiedFetch(
          `https://i.instagram.com/rupload_igphoto/${uploadName}`,
          {
            method: "POST",
            headers: uploadHeaders,
            body: new Blob([imageBytes as any], { type: "image/jpeg" }),
          },
          retryProxyClient,
        );

        const responseText = await uploadResponse.text();
        try {
          uploadResult = JSON.parse(responseText);
          console.log("Upload response:", JSON.stringify(uploadResult));
          break; // Success, exit loop
        } catch {
          console.error("Failed to parse upload response:", responseText.substring(0, 500));
          throw new Error("Invalid response from Instagram: " + responseText.substring(0, 200));
        }
      } catch (error) {
        lastUploadError = error;
        console.error(`[Upload] Attempt ${attempt + 1} failed:`, error);
        
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          console.log(`[Upload] Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (attempt >= MAX_RETRIES) {
          throw error;
        }
      }
    }

    if (!uploadResult) {
      throw lastUploadError || new Error("Upload failed after all retries");
    }

    if (!uploadResult.upload_id) {
      // Check for account issues
      if (
        uploadResult.message === "challenge_required" ||
        uploadResult.message === "login_required"
      ) {
        await supabaseClient
          .from("instagram_accounts")
          .update({
            status:
              uploadResult.message === "challenge_required" ? "suspended" : "expired",
          })
          .eq("id", accountId);

        return new Response(
          JSON.stringify({
            success: false,
            error:
              uploadResult.message === "challenge_required"
                ? "Account is suspended"
                : "Session expired",
            status:
              uploadResult.message === "challenge_required" ? "suspended" : "expired",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Failed to upload image: " +
            (uploadResult.message || "Unknown error"),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Configure/publish the photo with crop settings using 711proxy (with session fallback)
    console.log("Step 2: Configuring/publishing photo via 711proxy with session fallback...");

    const configureData = {
      upload_id: uploadId,
      source_type: "4",
      caption: "",
      device: {
        manufacturer: "samsung",
        model: "SM-G991B",
        android_version: 33,
        android_release: "13",
      },
      edits: {
        crop_original_size: [imgWidth, imgHeight],
        crop_center: [0.0, 0.0],
        crop_zoom: 1.0,
      },
      extra: {
        source_width: imgWidth,
        source_height: imgHeight,
      },
    };

    console.log("Configure data:", JSON.stringify(configureData));

    let configureResult: any = null;
    let lastConfigureError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Rotate proxy session on retry
        const retrySessionKey = attempt === 0 
          ? sessionKey 
          : `${sessionKey}c${String(attempt).padStart(2, '0')}`;
        const retryProxyUsername = `${proxyBaseUsername}-session-${retrySessionKey}`;
        const retryProxyUrl = `http://${encodeURIComponent(retryProxyUsername)}:${encodeURIComponent(proxy711Password)}@${proxyHost}:${proxyPort}`;
        
        const retryProxyClient = createProxyClient(retryProxyUrl);
        if (!retryProxyClient) {
          throw new Error("Failed to create proxy client for configure retry");
        }

        if (attempt > 0) {
          console.log(`[Configure] Retry ${attempt}/${MAX_RETRIES} with new session: ${retryProxyUsername}`);
        }

        const configureResponse = await proxiedFetch(
          "https://i.instagram.com/api/v1/media/configure/",
          {
            method: "POST",
            headers: {
              Cookie: cookieString,
              "User-Agent":
                "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)",
              "X-IG-App-ID": "936619743392459",
              "X-CSRFToken": csrfToken,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `signed_body=SIGNATURE.${encodeURIComponent(JSON.stringify(configureData))}`,
          },
          retryProxyClient,
        );

        const responseText = await configureResponse.text();
        try {
          configureResult = JSON.parse(responseText);
          console.log("Configure response:", JSON.stringify(configureResult).substring(0, 500));
          break; // Success
        } catch {
          console.error("Failed to parse configure response:", responseText.substring(0, 500));
          throw new Error("Invalid response from Instagram: " + responseText.substring(0, 200));
        }
      } catch (error) {
        lastConfigureError = error;
        console.error(`[Configure] Attempt ${attempt + 1} failed:`, error);
        
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          console.log(`[Configure] Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (attempt >= MAX_RETRIES) {
          throw error;
        }
      }
    }

    if (!configureResult) {
      throw lastConfigureError || new Error("Configure failed after all retries");
    }

    if (configureResult.status === "ok" && configureResult.media) {
      // Update posts count and safety tracking
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // Calculate new posts_today
      let newPostsToday = 1;
      if (account.posts_today_date === today) {
        newPostsToday = (account.posts_today || 0) + 1;
      }

      await supabaseClient
        .from("instagram_accounts")
        .update({
          posts_count: (account.posts_count || 0) + 1,
          last_posted_at: now.toISOString(),
          posts_today: newPostsToday,
          posts_today_date: today,
        })
        .eq("id", accountId);

      return new Response(
        JSON.stringify({
          success: true,
          mediaId: configureResult.media.id,
          posts_today: newPostsToday,
          daily_limit: DAILY_POST_LIMIT,
          proxy: {
            enabled: true,
            host: proxyHost,
            port: proxyPort,
            username: proxyUsername,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      // Check if account is suspended/expired
      if (configureResult.message === "challenge_required") {
        await supabaseClient
          .from("instagram_accounts")
          .update({ status: "suspended" })
          .eq("id", accountId);

        return new Response(
          JSON.stringify({ success: false, error: "Account is suspended", status: "suspended" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } else if (configureResult.message === "login_required") {
        await supabaseClient
          .from("instagram_accounts")
          .update({ status: "expired" })
          .eq("id", accountId);

        return new Response(
          JSON.stringify({ success: false, error: "Session expired", status: "expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: configureResult.message || "Failed to post photo",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    try {
      proxyClient?.close();
    } catch {
      // ignore
    }
  }
});
