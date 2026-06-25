import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const account_id = searchParams.get('account_id');

  if (!account_id) {
    return NextResponse.json({ error: "Missing account_id parameter" }, { status: 400 });
  }

  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  const backendUrl = new URL(`/api/scan/trigger/${account_id}`, backendBaseUrl);

  try {
    const res = await fetch(backendUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      console.warn(`Backend trigger scan responded with status: ${res.status}`);
      return NextResponse.json({
        error: `Backend responded with status: ${res.status}`
      }, { status: res.status });
    }
  } catch (error) {
    console.error("Failed to proxy trigger scan request to backend:", error);
    return NextResponse.json({
      error: "Could not establish connection to the backend service"
    }, { status: 502 });
  }
}
