import { getChatGPTUser } from "../../chatgpt-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getChatGPTUser();
  return Response.json({ user }, {
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
