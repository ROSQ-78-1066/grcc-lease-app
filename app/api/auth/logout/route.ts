import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const res = NextResponse.redirect(`${config.appUrl}/login`);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
