'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminDashboard from '@/components/AdminDashboard';

export default function AdminPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/login');
          return;
        }

        const { data: adminData, error } = await supabase
          .from('admins')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (error || !adminData || adminData.role !== 'admin') {
          router.replace('/');
          return;
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error checking auth:', error);
        router.replace('/login');
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 px-2 py-4 sm:p-6 md:p-8 overflow-x-hidden">
      <AdminDashboard />
    </div>
  );
} 