import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const account_id = searchParams.get('account_id');
  const snapshot_id = searchParams.get('snapshot_id');
  const getDiff = searchParams.get('diff') === 'true';

  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  let targetPath = '/api/history';

  if (snapshot_id) {
    if (getDiff) {
      targetPath = `/api/history/snapshot/${snapshot_id}/diff`;
    } else {
      targetPath = `/api/history/snapshot/${snapshot_id}`;
    }
  } else if (account_id) {
    targetPath = `/api/history?account_id=${account_id}`;
  }

  const backendUrl = new URL(targetPath, backendBaseUrl);

  try {
    const res = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      console.warn(`Backend history proxy responded with status: ${res.status}`);
      return NextResponse.json({
        error: `Backend responded with status: ${res.status}`
      }, { status: res.status });
    }
  } catch (error) {
    console.error("Failed to proxy history request to backend:", error);
    return NextResponse.json({
      error: "Could not establish connection to the backend service"
    }, { status: 502 });
  }
}
