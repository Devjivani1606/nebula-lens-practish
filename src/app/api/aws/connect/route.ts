import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const backendBaseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  
  try {
    const body = await request.json();
    const res = await fetch(`${backendBaseUrl}/api/aws/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Proxy AWS Connect Error:", error);
    return NextResponse.json(
      { success: false, detail: "Failed to connect to backend service" },
      { status: 500 }
    );
  }
}
