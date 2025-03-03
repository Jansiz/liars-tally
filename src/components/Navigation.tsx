'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';

export default function Navigation() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('admins')
          .select('role')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(!!data);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    window.location.href = '/';
  };

  return (
    <nav className="bg-gray-900/50 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link
              href="/"
              className={`inline-flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                pathname === '/'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              Counter
            </Link>
          </div>
          <div className="flex items-center">
            {isAdmin ? (
              <>
                <Link
                  href="/admin"
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                    pathname === '/admin'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="ml-4 px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className={`inline-flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                  pathname === '/login'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                Admin Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
} 