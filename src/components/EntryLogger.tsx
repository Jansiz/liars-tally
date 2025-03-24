'use client';

import { useState, useEffect } from 'react';
import { supabase, Gender, EntryType } from '@/lib/supabase';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Type definitions for state management
interface CountState {
  male: number;
  female: number;
}

// Type definition for entry records in the database
interface Entry {
  gender: Gender;
  type: EntryType;
  timestamp: string;
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);       // Reset confirmation modal
  const [isConnected, setIsConnected] = useState(true);                  // Database connection status

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
        // Get all current entries from database
        const { data: entries, error } = await supabase
          .from('entries')
          .select('gender, type');

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

    // Cleanup subscription on component unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [isConnected]);

  // Handle entry/exit button clicks
  const handleEntry = async (gender: 'male' | 'female', type: EntryType) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Insert new entry record
      const { error } = await supabase
        .from('entries')
        .insert([{ 
          gender, 
          type, 
          timestamp: new Date().toISOString()
        }])
        .select();

      if (error) {
        console.error('Error logging entry:', error);
        setErrorMessage(`Error: ${error.message}`);
        return;
      }

      // Update local count state
      setCurrentCount(prev => {
        const newCount = { ...prev };
        if (gender === 'male') {
          newCount.male = Math.max(0, prev.male + (type === 'entry' ? 1 : -1));
        } else if (gender === 'female') {
          newCount.female = Math.max(0, prev.female + (type === 'entry' ? 1 : -1));
        }
        return newCount;
      });

    } catch (error: any) {
      console.error('Error logging entry:', error);
      setErrorMessage(error?.message || 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle reset button click (archives current data and resets counter)
  const handleReset = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      // Get current time in Toronto timezone
      const now = new Date();
      const torontoDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
      
      // Fetch all current entries for archiving
      const { data: currentEntries, error: fetchError } = await supabase
        .from('entries')
        .select('*')
        .order('timestamp', { ascending: true });

      if (fetchError) throw fetchError;

      if (currentEntries && currentEntries.length > 0) {
        // Calculate summary statistics for the historical entry
        const stats = currentEntries.reduce((acc: {
          total_entries: number;
          total_exits: number;
          male_entries: number;
          male_exits: number;
          female_entries: number;
          female_exits: number;
        }, entry: Entry) => {
          if (entry.type === 'entry') {
            acc.total_entries++;
            if (entry.gender === 'male') acc.male_entries++;
            else if (entry.gender === 'female') acc.female_entries++;
          } else if (entry.type === 'exit') {
            acc.total_exits++;
            if (entry.gender === 'male') acc.male_exits++;
            else if (entry.gender === 'female') acc.female_exits++;
          }
          return acc;
        }, {
          total_entries: 0,
          total_exits: 0,
          male_entries: 0,
          male_exits: 0,
          female_entries: 0,
          female_exits: 0
        });

        // Create a new historical entry record with summary data
        const { data: historicalEntry, error: archiveError } = await supabase
          .from('historical_entries')
          .insert({
            date: torontoDate.toISOString().split('T')[0],
            start_time: currentEntries[0].timestamp,
            end_time: torontoDate.toISOString(),
            ...stats,
            final_count: currentCount.male + currentCount.female
          })
          .select()
          .single();

        if (archiveError) throw archiveError;

        // Process entries into 15-minute intervals for detailed historical data
        const intervals = new Map<string, {
          start: Date;
          end: Date;
          total_entries: number;
          total_exits: number;
          male_entries: number;
          male_exits: number;
          female_entries: number;
          female_exits: number;
          running_total: number;
        }>();

        // Calculate statistics for each 15-minute interval
        let runningTotal = 0;
        currentEntries.forEach((entry: Entry) => {
          // Calculate interval start/end times
          const entryDate = new Date(entry.timestamp);
          const minutes = entryDate.getMinutes();
          const intervalMinutes = Math.floor(minutes / 15) * 15;
          const intervalStart = new Date(entryDate);
          intervalStart.setMinutes(intervalMinutes, 0, 0);
          const intervalEnd = new Date(intervalStart);
          intervalEnd.setMinutes(intervalMinutes + 14, 59, 999);
          
          const intervalKey = intervalStart.toISOString();
          
          // Initialize interval if it doesn't exist
          if (!intervals.has(intervalKey)) {
            intervals.set(intervalKey, {
              start: intervalStart,
              end: intervalEnd,
              total_entries: 0,
              total_exits: 0,
              male_entries: 0,
              male_exits: 0,
              female_entries: 0,
              female_exits: 0,
              running_total: 0
            });
          }

          const interval = intervals.get(intervalKey)!;
          
          // Update interval statistics based on entry type and gender
          if (entry.type === 'entry') {
            interval.total_entries++;
            runningTotal++;
            if (entry.gender === 'male') {
              interval.male_entries++;
            } else if (entry.gender === 'female') {
              interval.female_entries++;
            }
          } else if (entry.type === 'exit') {
            interval.total_exits++;
            runningTotal = Math.max(0, runningTotal - 1);
            if (entry.gender === 'male') {
              interval.male_exits++;
            } else if (entry.gender === 'female') {
              interval.female_exits++;
            }
          }
          
          interval.running_total = runningTotal;
        });

        // Prepare interval data for database insertion
        const intervalData = Array.from(intervals.values()).map(interval => ({
          historical_entry_id: historicalEntry.id,
          interval_start: interval.start.toISOString(),
          interval_end: interval.end.toISOString(),
          total_entries: interval.total_entries,
          total_exits: interval.total_exits,
          male_entries: interval.male_entries,
          male_exits: interval.male_exits,
          female_entries: interval.female_entries,
          female_exits: interval.female_exits,
          running_total: interval.running_total
        }));

        // Save interval data to historical_intervals table
        const { error: intervalError } = await supabase
          .from('historical_intervals')
          .insert(intervalData);

        if (intervalError) throw intervalError;

        // Clear all current entries after archiving
        const { error: clearError } = await supabase
          .from('entries')
          .delete()
          .gte('timestamp', '1970-01-01'); // Delete all entries

        if (clearError) throw clearError;
      }

      // Reset UI state
      setShowResetConfirm(false);
      setCurrentCount({ male: 0, female: 0 });
    } catch (error: any) {
      console.error('Error resetting counts:', error);
      setErrorMessage(error?.message || 'Error resetting counts');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate total count for display
  const totalCount = showFakeCount ? 570 : currentCount.male + currentCount.female;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col">
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800/90 p-6 rounded-2xl border border-white/10 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4 text-center">Reset Counter?</h3>
            <p className="text-white/70 mb-6 text-center">
              Are you sure you want to reset all counters to zero? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="flex-1 p-3 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all duration-300 font-semibold"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

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

          <div className="mt-4 mb-4">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full p-4 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all duration-300 font-semibold backdrop-blur-sm border border-red-500/20"
            >
              Reset Counter
            </button>
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