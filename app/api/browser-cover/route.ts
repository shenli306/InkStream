import { NextResponse } from "next/server";

// 由原 api/browser-cover.js 迁移：封面查询是 best-effort，直接返回未找到。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: false, coverUrl: null });
}
