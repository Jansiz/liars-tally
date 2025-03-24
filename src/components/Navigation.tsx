'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';

/**
 * Navigation component that handles:
 * - Navigation between counter and admin dashboard
 * - Admin authentication state
 * - Logout functionality
 * - Responsive navigation UI with active state indicators
 */
export default function Navigation() {
  // Get current path for active link highlighting
  const pathname = usePathname();
  // Track admin authentication state
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Check if user has admin role
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

  /**
   * Handle user logout:
   * - Sign out from Supabase
   * - Reset admin state
   * - Redirect to home page
   */
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    window.location.href = '/';
  };

  return (
    // Navigation bar with blur effect and border
    <nav className="bg-gray-900/50 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side navigation - Counter link */}
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
          {/* Right side navigation - Admin/Dashboard/Login */}
          <div className="flex items-center">
            {isAdmin ? (
              // Admin navigation items
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
              // Non-admin navigation item
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