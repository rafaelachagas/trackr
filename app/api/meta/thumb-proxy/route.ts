import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return new NextResponse('Not found', { status: 404 })

    const blob = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
