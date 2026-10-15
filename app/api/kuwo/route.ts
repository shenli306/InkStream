import { NextResponse } from "next/server";

// 由原 api/kuwo.js 迁移（酷我音乐搜索）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword");

  if (!keyword) {
    return NextResponse.json({ code: 400, msg: "Missing keyword" }, { status: 400 });
  }

  try {
    const searchUrl = `http://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=${encodeURIComponent(
      keyword
    )}&pn=1&rn=30`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "http://www.kuwo.cn/",
        Cookie: "kw_token=1234567890",
      },
    });

    const data: any = await response.json();

    if (data.code === 200 && data.data?.list) {
      const results = data.data.list.map((item: any) => ({
        id: String(item.rid || item.id),
        name: item.name || item.songname || "",
        artist: item.artist || item.singer || "",
        album: item.album || "",
        cover: item.pic || item.albumpic || "",
        duration: item.duration || 0,
        url: "",
        source: "kuwo",
        rid: item.rid,
      }));
      return NextResponse.json({ code: 200, results });
    }

    return NextResponse.json({ code: 404, msg: "No results" });
  } catch (error: any) {
    return NextResponse.json({ code: 500, msg: error?.message ?? String(error) }, { status: 500 });
  }
}
