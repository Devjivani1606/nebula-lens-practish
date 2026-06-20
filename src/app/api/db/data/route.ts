import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const snapshot_id = searchParams.get('snapshot_id');

  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  let path = '';
  
  if (table === 'accounts') {
    path = '/api/db/accounts';
  } else if (table === 'snapshots') {
    path = '/api/db/snapshots';
  } else if (table === 'nodes') {
    path = snapshot_id ? `/api/db/nodes?snapshot_id=${snapshot_id}` : '/api/db/nodes';
  } else if (table === 'edges') {
    path = snapshot_id ? `/api/db/edges?snapshot_id=${snapshot_id}` : '/api/db/edges';
  } else {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }

  try {
    const res = await fetch(`${backendBaseUrl}${path}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Backend responded with status: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Proxy DB Table ${table} Error:`, error);
    return NextResponse.json({ error: `Failed to fetch data for ${table}` }, { status: 500 });
  }
}
