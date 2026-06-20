import { NextResponse } from 'next/server';

export async function GET() {
  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

  try {
    const res = await fetch(`${backendBaseUrl}/api/db/stats`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Backend responded with status: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy DB Stats Error:", error);
    return NextResponse.json({ error: "Failed to fetch database stats" }, { status: 500 });
  }
}
