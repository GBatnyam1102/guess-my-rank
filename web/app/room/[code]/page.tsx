'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

// Client-only: the game reads the session from localStorage and talks over a socket.
const RoomClient = dynamic(() => import('@/components/RoomClient'), { ssr: false });

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  return <RoomClient code={String(params.code).toUpperCase()} />;
}
