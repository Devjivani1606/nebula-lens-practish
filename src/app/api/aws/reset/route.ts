import { NextResponse } from 'next/server';

export async function POST() {
  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

  try {
    const res = await fetch(`${backendBaseUrl}/api/aws/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Backend responded with status: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy AWS Reset Error:", error);
    return NextResponse.json({ success: false, error: "Failed to reset database" }, { status: 500 });
  }
}
