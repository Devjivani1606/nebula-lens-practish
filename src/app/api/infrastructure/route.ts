import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Extract query parameters from request url to forward to the backend
  const { searchParams } = new URL(request.url);
  const account_id = searchParams.get('account_id');
  const only_new = searchParams.get('only_new');

  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  const backendUrl = new URL('/api/graph/latest', backendBaseUrl);
  if (account_id) {
    backendUrl.searchParams.set('account_id', account_id);
  }
  if (only_new) {
    backendUrl.searchParams.set('only_new', only_new);
  }

  try {
    const res = await fetch(backendUrl.toString(), {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      console.warn(`Backend responded with status: ${res.status}`);
      return NextResponse.json({
        nodes: [],
        edges: [],
        error: `Backend responded with status: ${res.status}`
      }, { status: res.status });
    }
  } catch (error) {
    console.error("Failed to fetch topology from backend:", error);
    return NextResponse.json({
      nodes: [],
      edges: [],
      error: "Could not establish connection to the backend service"
    }, { status: 502 });
  }
}