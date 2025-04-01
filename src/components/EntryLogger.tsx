'use client';

import { useState, useEffect } from 'react';
import { supabase, Gender, EntryType } from '@/lib/supabase';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Type definitions for state management
interface CountState {
  [key: string]: number;
  male: number;
  female: number;
}

// Type definition for entry records in the database
interface Entry {
  id: string;
  gender: Gender;
  type: EntryType;
  timestamp: string;
  date: string;
}

// Type definition for historical entry records
interface HistoricalEntry {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  total_entries: number;
  total_exits: number;
  male_entries: number;
  male_exits: number;
  female_entries: number;
  female_exits: number;
  final_count: number;
}

export default function EntryLogger() {
  // State management for component
  const [isLoading, setIsLoading] = useState(false);          // Loading state for API calls
  const [showFakeCount, setShowFakeCount] = useState(false);  // Debug feature for showing fake count
  const [currentCount, setCurrentCount] = useState<CountState>({ male: 0, female: 0 }); // Current count of people inside
  const [errorMessage, setErrorMessage] = useState<string | null>(null);  // Error message display
  const [isConnected, setIsConnected] = useState(true);                  // Database connection status

  // Get current date in Toronto timezone
  const getTodayInToronto = () => {
    const now = new Date();
    // Format the date directly to YYYY-MM-DD in Toronto timezone
    const torontoDate = now.toLocaleDateString('en-CA', { 
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    // Get hours in Toronto time for the 4 AM check
    const torontoHours = now.toLocaleString('en-US', { 
      timeZone: 'America/Toronto',
      hour: 'numeric',
      hour12: false 
    });
    
    // If it's between midnight and 3 AM Toronto time, show the previous day
    if (parseInt(torontoHours) < 4) {
      const prevDay = new Date(now);
      prevDay.setDate(prevDay.getDate() - 1);
      return prevDay.toLocaleDateString('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    }
    
    return torontoDate;
  };

  // Check database connection on component mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('entries').select('count').limit(1);
        setIsConnected(!error);
        if (error) {
          setErrorMessage('Unable to connect to the database. Please try again later.');
        }
      } catch (err) {
        setIsConnected(false);
        setErrorMessage('Unable to connect to the database. Please try again later.');
      }
    };

    checkConnection();
  }, []);

  // Set up real-time subscription and initial data fetch
  useEffect(() => {
    if (!isConnected) return;

    // Function to fetch and calculate current counts from entries
    const fetchCurrentCounts = async () => {
      try {
        const today = getTodayInToronto();
        
        // Get today's entries
        const { data: entries, error } = await supabase
          .from('entries')
          .select('*')
          .eq('date', today)
          .order('timestamp', { ascending: true });

        if (error) {
          console.error('Error fetching entries:', error);
          setErrorMessage(`Error fetching current count: ${error.message}`);
          return;
        }

        if (!entries) return;

        // Calculate current counts by processing all entries
        const counts = entries.reduce((acc: CountState, entry: Entry) => {
          if (entry.type === 'entry' || entry.type === 'exit') {
            const change = entry.type === 'entry' ? 1 : -1;
            if (entry.gender === 'male') {
              acc.male += change;
            } else if (entry.gender === 'female') {
              acc.female += change;
            }
          }
          return acc;
        }, { male: 0, female: 0 });

        setCurrentCount(counts);
      } catch (error: any) {
        console.error('Error initializing counts:', error);
        setErrorMessage(error?.message || 'Error initializing counts');
      }
    };

    // Initial fetch of current counts
    fetchCurrentCounts();

    // Set up real-time subscription to entry changes
    const subscription = supabase
      .channel('entries-changes')
      .on('postgres_changes' as const,
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `date=eq.${getTodayInToronto()}`
        },
        async () => {
          // Refetch counts whenever there's a change in entries
          await fetchCurrentCounts();
        }
      )
      .subscribe((status: 'SUBSCRIBED' | 'CHANNEL_ERROR') => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to entries changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Failed to subscribe to entries changes');
          setErrorMessage('Failed to connect to real-time updates. Please refresh the page.');
        }
      });

    // Check for date change every 30 seconds
    const dateCheckInterval = setInterval(() => {
      const currentDate = getTodayInToronto();
      if (currentDate !== getTodayInToronto()) {
        fetchCurrentCounts();
      }
    }, 30000); // Check every 30 seconds

    // Cleanup subscription on component unmount
    return () => {
      subscription.unsubscribe();
      clearInterval(dateCheckInterval);
    };
  }, [isConnected]);

  // Handle entry/exit button clicks
  const handleEntry = async (gender: Gender, type: EntryType) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const now = new Date();
      
      // Get the date and time in Toronto timezone
      const torontoDate = now.toLocaleDateString('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      const torontoHours = parseInt(now.toLocaleString('en-US', {
        timeZone: 'America/Toronto',
        hour: 'numeric',
        hour12: false
      }));

      // If it's between midnight and 3 AM, use previous day's date
      let entryDate = torontoDate;
      if (torontoHours < 4) {
        const prevDay = new Date(now);
        prevDay.setDate(prevDay.getDate() - 1);
        entryDate = prevDay.toLocaleDateString('en-CA', {
          timeZone: 'America/Toronto',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      }

      const { error } = await supabase
        .from('entries')
        .insert([
          {
            gender,
            type,
            timestamp: now.toISOString(), // Keep timestamp in UTC
            date: entryDate // Use the Toronto date
          }
        ]);

      if (error) throw error;

      // Update UI state
      setCurrentCount(prev => ({
        ...prev,
        [gender]: type === 'entry' ? prev[gender] + 1 : Math.max(0, prev[gender] - 1)
      }));

    } catch (error: any) {
      console.error('Error logging entry:', error);
      setErrorMessage(error?.message || 'Error logging entry');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate total count for display
  const totalCount = showFakeCount ? 570 : currentCount.male + currentCount.female;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center py-12">
        <div className="w-full max-w-4xl px-4">
          <div className="text-center relative mb-6">
            <h1 className="text-4xl font-bold mb-2 text-white/90">
              Current
            </h1>
            <div className="text-7xl font-bold mb-2 transition-all duration-300">
              {totalCount}
            </div>
            {errorMessage && (
              <div className="mt-2 p-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg backdrop-blur-sm">
                {errorMessage}
              </div>
            )}
            <button
              onClick={() => setShowFakeCount(!showFakeCount)}
              className="absolute top-0 right-0 w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 transition-all duration-200"
              aria-label="Toggle count mode"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Male Counter */}
            <CounterCard
              title="M"
              count={currentCount.male}
              color="blue"
              onIncrement={() => handleEntry('male', 'entry')}
              onDecrement={() => handleEntry('male', 'exit')}
              isLoading={isLoading}
              isDecrementDisabled={currentCount.male <= 0}
            />

            {/* Female Counter */}
            <CounterCard
              title="F"
              count={currentCount.female}
              color="pink"
              onIncrement={() => handleEntry('female', 'entry')}
              onDecrement={() => handleEntry('female', 'exit')}
              isLoading={isLoading}
              isDecrementDisabled={currentCount.female <= 0}
            />
          </div>
        </div>
      </div>

      {/* Admin button at the bottom */}
      <div className="w-full flex justify-end p-4">
        <a
          href="/admin"
          className="p-3 text-sm text-white/25 hover:text-white/50 transition-all duration-300 rounded-full hover:bg-white/5"
          aria-label="Admin Access"
        >
          ⚙️
        </a>
      </div>
    </div>
  );
}

interface CounterCardProps {
  title: string;
  count: number;
  color: 'blue' | 'pink';
  onIncrement: () => void;
  onDecrement: () => void;
  isLoading: boolean;
  isDecrementDisabled: boolean;
}

function CounterCard({
  title,
  count,
  color,
  onIncrement,
  onDecrement,
  isLoading,
  isDecrementDisabled
}: CounterCardProps) {
  const colorClasses = {
    blue: {
      text: 'text-blue-400',
      button: 'bg-blue-500/80 hover:bg-blue-400 hover:shadow-blue-500/25',
    },
    pink: {
      text: 'text-pink-400',
      button: 'bg-pink-500/80 hover:bg-pink-400 hover:shadow-pink-500/25',
    },
  };

  return (
    <div className="space-y-4 backdrop-blur-sm bg-white/5 p-6 rounded-2xl border border-white/10">
      <h2 className={cn('text-xl font-semibold text-center', colorClasses[color].text)}>
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onIncrement}
          disabled={isLoading}
          className={cn(
            'p-6 backdrop-blur-sm rounded-2xl flex items-center justify-center',
            colorClasses[color].button,
            'disabled:opacity-50 transition-all duration-300',
            'active:scale-95 shadow-lg',
            'disabled:cursor-not-allowed'
          )}
        >
          <PlusIcon className="h-10 w-10" />
        </button>
        <button
          onClick={onDecrement}
          disabled={isLoading || isDecrementDisabled}
          className={cn(
            'p-6 bg-red-500/80 backdrop-blur-sm rounded-2xl flex items-center justify-center',
            'hover:bg-red-400 disabled:opacity-50 transition-all duration-300',
            'active:scale-95 shadow-lg hover:shadow-red-500/25',
            'disabled:cursor-not-allowed'
          )}
        >
          <MinusIcon className="h-10 w-10" />
        </button>
      </div>
      <div className={cn('text-center text-3xl font-bold', colorClasses[color].text)}>
        {count}
      </div>
    </div>
  );
} 