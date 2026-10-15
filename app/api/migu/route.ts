import { NextResponse } from "next/server";

// 由原 api/migu.js 迁移（咪咕音乐搜索）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword");

  if (!keyword) {
    return NextResponse.json({ code: 400, msg: "Missing keyword" }, { status: 400 });
  }

  try {
    const searchUrl = `https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(
      keyword
    )}&type=2&pg=1`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
        Referer: "https://m.music.migu.cn/",
      },
    });

    const data: any = await response.json();

    if (data.musics && data.musics.length > 0) {
      const results = data.musics.map((item: any) => ({
        id: item.copyrightId || item.id,
        name: item.songName || item.title || "",
        artist: item.singerName || item.singer || "",
        album: item.albumName || item.album || "",
        cover: item.cover || item.albumPicUrl || "",
        duration: item.length || 0,
        url: "",
        source: "migu",
        songId: item.songId || item.id,
        copyrightId: item.copyrightId,
        lyricUrl: item.lyricUrl || "",
      }));
      return NextResponse.json({ code: 200, results });
    }

    return NextResponse.json({ code: 404, msg: "No results" });
  } catch (error: any) {
    return NextResponse.json({ code: 500, msg: error?.message ?? String(error) }, { status: 500 });
  }
}
