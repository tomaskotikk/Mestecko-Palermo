import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { socket_id, channel_name } = await request.json();
    
    // For private channels, authenticate the user
    if (channel_name.startsWith('private-')) {
      const auth = pusherServer.authorizeChannel(socket_id, channel_name);
      return NextResponse.json(auth);
    }
    
    // For public channels, just authorize
    const auth = pusherServer.authorizeChannel(socket_id, channel_name);
    return NextResponse.json(auth);
  } catch (error) {
    console.error('Pusher auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 403 }
    );
  }
}

