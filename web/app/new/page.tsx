'use client';

import dynamic from 'next/dynamic';

// Client-only so the remembered nickname can seed the form without a hydration mismatch.
export default dynamic(() => import('@/components/NewGame'), { ssr: false });
