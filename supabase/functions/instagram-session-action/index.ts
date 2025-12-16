import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function createProxyClient(proxyUrl: string): Deno.HttpClient | null {
  try {
    // Deno fetch supports passing a custom client.
    // Using Deno.createHttpClient({ proxy }) avoids undici incompatibilities in Supabase Edge Runtime.
    return Deno.createHttpClient({
      proxy: { url: proxyUrl },
    });
  } catch (e) {
    console.error("Failed to create proxy HTTP client:", e);
    return null;
  }
}

async function fetchWithOptionalProxy(
  url: string,
  options: RequestInit,
  proxyClient: Deno.HttpClient | null,
): Promise<Response> {
  if (!proxyClient) return await fetch(url, options);
  return await fetch(url, { ...(options as any), client: proxyClient } as any);
}

async function fetchProxyIp(proxyClient: Deno.HttpClient): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      client: proxyClient,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    } as any);

    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.ip === "string" ? json.ip : null;
  } catch (e) {
    console.warn("Proxy IP check failed:", e);
    return null;
  }
}

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

    const { accountId, action, debugProxy } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ success: false, error: "Account ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!proxy711Password) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "PROXY_711_PASSWORD secret missing. Please set it in Supabase secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Sticky session per Instagram account (so same IG account keeps same proxy session)
    const sessionKey = String(accountId).replace(/-/g, "").slice(0, 12);
    const proxyUsername = `${proxyBaseUsername}-session-${sessionKey}`;

    const proxyUrl = `http://${encodeURIComponent(proxyUsername)}:${encodeURIComponent(proxy711Password)}@${proxyHost}:${proxyPort}`;

    proxyClient = createProxyClient(proxyUrl);
    if (!proxyClient) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Failed to initialize proxy client (Edge runtime). Please retry or contact support.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Using 711proxy:", proxyHost, "port:", proxyPort, "user:", proxyUsername);

    // Get account
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

    console.log(`Performing ${action} on account:`, account.username, "via 711proxy");

    // Parse cookies
    let cookieObj: Record<string, string> = {};
    const cookieString = account.cookies;

    if (cookieString.includes(";")) {
      cookieString.split(";").forEach((cookie: string) => {
        const [key, value] = cookie.trim().split("=");
        if (key && value) cookieObj[key.trim()] = value.trim();
      });
    }

    const csrfToken = cookieObj["csrftoken"] || "";
    const dsUserId = cookieObj["ds_user_id"] || "";

    const commonHeaders = {
      Cookie: cookieString,
      "User-Agent":
        "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229237)",
      "X-IG-App-ID": "936619743392459",
      "X-CSRFToken": csrfToken,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-IG-Device-ID": crypto.randomUUID(),
      "X-IG-Android-ID":
        "android-" + crypto.randomUUID().replace(/-/g, "").substring(0, 16),
    };

    const proxyIp = debugProxy ? await fetchProxyIp(proxyClient) : null;

    // Step 1: Validate session
    console.log("Calling Instagram API for session validation via 711proxy");
    const igResponse = await fetchWithOptionalProxy(
      "https://i.instagram.com/api/v1/accounts/current_user/?edit=true",
      {
        method: "GET",
        headers: commonHeaders,
      },
      proxyClient,
    );

    const igResponseText = await igResponse.text();
    let igResult: any;
    try {
      igResult = JSON.parse(igResponseText);
    } catch {
      console.error(
        "Failed to parse Instagram response:",
        igResponseText.substring(0, 500),
      );
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from Instagram" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Session validation response status:", igResponse.status);

    let newStatus: "active" | "expired" | "suspended" = "expired";
    let updateData: any = {
      last_checked: new Date().toISOString(),
    };

    const isSuspended =
      igResult?.message === "challenge_required" ||
      igResult?.message === "user_has_logged_out" ||
      (typeof igResult?.checkpoint_url === "string" &&
        igResult.checkpoint_url.includes("suspended"));

    const isValid = igResult?.user && igResponse.status === 200;

    if (isValid) {
      const igUser = igResult.user;
      const userId = igUser?.pk || dsUserId;

      newStatus = "active";
      updateData = {
        ...updateData,
        full_name: igUser?.full_name ?? "",
        profile_pic_url: igUser?.profile_pic_url ?? null,
        bio: igUser?.biography ?? "",
        status: "active",
      };

      // Step 2: stats
      if (userId) {
        console.log("Fetching user stats for user_id:", userId);
        try {
          const statsResponse = await fetchWithOptionalProxy(
            `https://i.instagram.com/api/v1/users/${userId}/info/`,
            {
              method: "GET",
              headers: commonHeaders,
            },
            proxyClient,
          );

          if (statsResponse.ok) {
            const statsText = await statsResponse.text();
            const statsResult = JSON.parse(statsText);

            if (statsResult?.user) {
              const statsUser = statsResult.user;
              updateData.posts_count = statsUser?.media_count ?? 0;
              updateData.followers_count = statsUser?.follower_count ?? 0;
              updateData.following_count = statsUser?.following_count ?? 0;
              console.log(
                `Stats: posts=${updateData.posts_count}, followers=${updateData.followers_count}, following=${updateData.following_count}`,
              );
            }
          } else {
            console.log("Stats fetch failed with status:", statsResponse.status);
          }
        } catch (statsError) {
          console.error("Error fetching stats:", statsError);
        }
      }

      console.log("Session is ACTIVE");
    } else if (isSuspended) {
      console.log("=== SUSPEND DETECTED ===");
      newStatus = "suspended";
      updateData.status = "suspended";
    } else {
      console.log("Session marked as EXPIRED");
      updateData.status = "expired";
    }

    const { error: updateError } = await supabaseClient
      .from("instagram_accounts")
      .update(updateData)
      .eq("id", accountId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update account" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: newStatus,
        data: updateData,
        instagram_response: igResult,
        proxy: {
          enabled: true,
          host: proxyHost,
          port: proxyPort,
          username: proxyUsername,
          ip: proxyIp,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
