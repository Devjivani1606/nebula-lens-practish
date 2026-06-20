import { NextResponse } from 'next/server';

export async function GET() {
  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

  try {
    const res = await fetch(`${backendBaseUrl}/api/aws/accounts`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Backend responded with status: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy AWS Accounts List Error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
