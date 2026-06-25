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
  } else if (table === 'resources') {
    path = snapshot_id ? `/api/db/resources?snapshot_id=${snapshot_id}` : '/api/db/resources';
  } else if (table === 'relationships') {
    path = snapshot_id ? `/api/db/relationships?snapshot_id=${snapshot_id}` : '/api/db/relationships';
  } else if (table === 'jobs') {
    path = '/api/db/jobs';
  } else if (table === 'users') {
    path = '/api/db/users';
  } else if (table === 'service_scans') {
    path = '/api/db/service_scans';
  } else if (table === 'snapshot_diffs') {
    path = '/api/db/snapshot_diffs';
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

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');
  const id = searchParams.get('id');

  if (!table || !id) {
    return NextResponse.json({ error: "Table name and Row ID are required" }, { status: 400 });
  }

  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  const path = `/api/db/delete/${table}/${id}`;

  try {
    const res = await fetch(`${backendBaseUrl}${path}`, {
      method: 'DELETE',
      cache: 'no-store',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Backend responded with status: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Proxy DB DELETE Row Error:`, error);
    return NextResponse.json({ error: error.message || "Failed to delete database row" }, { status: 500 });
  }
}
