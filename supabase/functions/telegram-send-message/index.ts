import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionString, destinationType, destination, message } = await req.json();

    console.log("Telegram send message request:", { destinationType, destination, messageLength: message?.length });

    if (!sessionString || !destination || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse session string (Telethon/Pyrogram format)
    // Session format: dc_id:auth_key:user_id (base64 encoded or raw)
    let sessionData;
    try {
      // Try to decode if base64
      const decoded = atob(sessionString.trim());
      sessionData = decoded;
    } catch {
      sessionData = sessionString.trim();
    }

    console.log("Session parsed, attempting to send message...");

    // For now, we'll use Telegram Bot API as a fallback since MTProto requires complex setup
    // In production, you would need a proper MTProto client or external service
    
    // Check if user provided a bot token format (for testing)
    if (sessionString.includes(":AA")) {
      // This looks like a bot token, use Bot API
      const botToken = sessionString.trim();
      
      // Resolve chat ID
      let chatId = destination;
      if (destination.startsWith("@")) {
        chatId = destination;
      } else if (destination.startsWith("+")) {
        // Phone number - Bot API can't send to phone numbers directly
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Bot token দিয়ে phone number এ message পাঠানো যায় না। Username ব্যবহার করুন অথবা user session string দিন।" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
          }),
        }
      );

      const result = await telegramResponse.json();
      console.log("Telegram API response:", result);

      if (result.ok) {
        return new Response(
          JSON.stringify({ success: true, messageId: result.result.message_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: result.description || "Failed to send message" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For Telethon/Pyrogram session strings, we need an external service
    // Since GramJS requires Node.js runtime features not available in Deno
    // We'll return an informative message
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "MTProto session support coming soon। এখন Bot Token ব্যবহার করুন (BotFather থেকে পাওয়া token)।" 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in telegram-send-message:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
