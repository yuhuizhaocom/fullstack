import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] 数据库连接失败:", error);
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        version: APP_VERSION,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
