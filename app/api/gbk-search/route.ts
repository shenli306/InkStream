import { NextResponse } from "next/server";
import iconv from "iconv-lite";

// 由原 api/gbk-search.js 迁移（fetch-based，GBK 关键词编码后转发）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchWithTimeout(url: string, options: RequestInit, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const target = searchParams.get("target");
    const keyword = searchParams.get("keyword");
    const method = (searchParams.get("method") || "GET").toUpperCase();

    if (!target || !keyword) {
      return new NextResponse("Missing parameters", { status: 400 });
    }

    const gbkBuffer = iconv.encode(String(keyword), "gbk");
    let encodedKeyword = "";
    for (let i = 0; i < gbkBuffer.length; i++) {
      encodedKeyword += "%" + gbkBuffer[i].toString(16).toUpperCase().padStart(2, "0");
    }

    const finalUrl = String(target).replace("{keyword}", encodedKeyword);

    const mobileUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const desktopUA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    const isWanbenge = finalUrl.includes("jizai22.com");
    const ua = isWanbenge ? mobileUA : desktopUA;

    const headers: Record<string, string> = {
      "User-Agent": ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: "https://www.jizai22.com/",
      Connection: "keep-alive",
      "Cache-Control": "max-age=0",
    };

    let lastError: any = null;
    let finalBuffer: Buffer | null = null;
    let finalStatus = 200;

    try {
      let response: Response;
      if (method === "POST") {
        const postBody = `searchkey=${encodedKeyword}&action=search`;
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        response = await fetchWithTimeout(finalUrl, {
          method: "POST",
          headers,
          body: postBody,
          redirect: "follow",
        });
      } else {
        response = await fetchWithTimeout(finalUrl, {
          method: "GET",
          headers,
          redirect: "follow",
        });
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 100) throw new Error("Response too small");

      const sample = buffer.toString("utf-8", 0, 1500).toLowerCase();
      if (
        sample.includes("just a moment") ||
        sample.includes("attention required") ||
        sample.includes("cloudflare") ||
        sample.includes("verification") ||
        sample.includes("error 403") ||
        sample.includes("forbidden")
      ) {
        throw new Error("Anti-bot page");
      }

      finalBuffer = buffer;
      finalStatus = response.status;
      lastError = null;
    } catch (e: any) {
      lastError = e;
    }

    if (lastError || !finalBuffer) {
      return new NextResponse(`GBK search failed: ${lastError?.message ?? "unknown"}`, {
        status: 502,
      });
    }

    return new NextResponse(new Uint8Array(finalBuffer), {
      status: finalStatus,
      headers: {
        "Content-Type": "text/html; charset=gbk",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message || "Internal error", { status: 500 });
  }
}
