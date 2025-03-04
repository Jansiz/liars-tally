'use client';

import { useState, useEffect } from 'react';
import { supabase, Gender, EntryType } from '@/lib/supabase';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface CountState {
  male: number;
  female: number;
}

interface Entry {
  gender: Gender;
  type: EntryType;
}

export default function EntryLogger() {
  const [isLoading, setIsLoading] = useState(false);
  const [showFakeCount, setShowFakeCount] = useState(false);
  const [currentCount, setCurrentCount] = useState<CountState>({ male: 0, female: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

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

  useEffect(() => {
    if (!isConnected) return;

    const fetchCurrentCounts = async () => {
      try {
        // Get all entries since we don't have reset markers yet
        const { data: entries, error } = await supabase
          .from('entries')
          .select('gender, type');

        if (error) {
          console.error('Error fetching entries:', error);
          setErrorMessage(`Error fetching current count: ${error.message}`);
          return;
        }

        if (!entries) return;

        const counts = entries.reduce((acc: CountState, entry: Entry) => {
          const change = entry.type === 'entry' ? 1 : -1;
          acc[entry.gender] += change;
          return acc;
        }, { male: 0, female: 0 });

        setCurrentCount(counts);
      } catch (error: any) {
        console.error('Error initializing counts:', error);
        setErrorMessage(error?.message || 'Error initializing counts');
      }
    };

    fetchCurrentCounts();

    const subscription = supabase
      .channel('entries-changes')
      .on('postgres_changes' as const,
        {
          event: '*',
          schema: 'public',
          table: 'entries',
        },
        (payload: RealtimePostgresChangesPayload<Entry>) => {
          if (!payload.new) return;
          
          const entry = payload.new as Entry;
          if (!entry?.gender || !entry?.type) return;
          
          if (entry.gender === 'male' || entry.gender === 'female') {
            setCurrentCount(prev => ({
              ...prev,
              [entry.gender]: Math.max(0, prev[entry.gender] + (entry.type === 'entry' ? 1 : -1))
            }));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [isConnected]);

  const handleEntry = async (gender: Gender, type: EntryType) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const { error } = await supabase
        .from('entries')
        .insert([{ gender, type, timestamp: new Date().toISOString() }])
        .select();

      if (error) {
        console.error('Error logging entry:', error);
        setErrorMessage(`Error: ${error.message}`);
        return;
      }

      setCurrentCount(prev => ({
        ...prev,
        [gender]: Math.max(0, prev[gender] + (type === 'entry' ? 1 : -1))
      }));

    } catch (error: any) {
      console.error('Error logging entry:', error);
      setErrorMessage(error?.message || 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      // Insert a new entry for both genders to set the count to 0
      const currentMaleCount = currentCount.male;
      const currentFemaleCount = currentCount.female;
      
      if (currentMaleCount > 0) {
        const { error: maleError } = await supabase
          .from('entries')
          .insert([{ gender: 'male', type: 'exit', timestamp: new Date().toISOString() }])
          .select();

        if (maleError) throw maleError;
      }

      if (currentFemaleCount > 0) {
        const { error: femaleError } = await supabase
          .from('entries')
          .insert([{ gender: 'female', type: 'exit', timestamp: new Date().toISOString() }])
          .select();

        if (femaleError) throw femaleError;
      }

      setShowResetConfirm(false);
      setCurrentCount({ male: 0, female: 0 });
    } catch (error: any) {
      console.error('Error resetting counts:', error);
      setErrorMessage(error?.message || 'Error resetting counts');
    } finally {
      setIsLoading(false);
    }
  };

  const totalCount = showFakeCount ? 570 : currentCount.male + currentCount.female;

  return (
    <div className="fixed inset-0 min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex items-center justify-center pb-safe">
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

      {/* Admin button in bottom right */}
      <a
        href="/admin"
        className="fixed bottom-6 right-6 p-3 text-sm text-white/25 hover:text-white/50 transition-all duration-300 rounded-full hover:bg-white/5"
        aria-label="Admin Access"
      >
        ⚙️
      </a>

      <div className="w-full max-w-4xl px-6 py-12">
        <div className="text-center relative mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
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

        <div className="mt-8 mb-12">
          <button
            onClick={() => setShowResetConfirm(true)}
            className="w-full p-4 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all duration-300 font-semibold backdrop-blur-sm border border-red-500/20"
          >
            Reset Counter
          </button>
        </div>
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