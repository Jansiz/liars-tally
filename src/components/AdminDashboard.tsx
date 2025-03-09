'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase, Entry } from '@/lib/supabase';

interface IntervalStats {
  interval: string;
  male: number;
  female: number;
  total: number;
}

interface DailyTotal {
  date: string;
  total: number;
  male: number;
  female: number;
}

export default function AdminDashboard() {
  // Get current date in Toronto timezone
  const getTodayInToronto = () => {
    // Create a date object for the current time in UTC
    const now = new Date();
    
    // Convert to Toronto time
    const torontoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
    
    // If it's between midnight and 3 AM Toronto time, show the previous day
    if (torontoTime.getHours() < 3) {
      torontoTime.setDate(torontoTime.getDate() - 1);
    }
    
    // Format as YYYY-MM-DD
    return torontoTime.getFullYear() + '-' + 
           String(torontoTime.getMonth() + 1).padStart(2, '0') + '-' + 
           String(torontoTime.getDate()).padStart(2, '0');
  };

  // Initialize with Toronto date
  const [selectedDate, setSelectedDate] = useState(getTodayInToronto());
  const [intervalStats, setIntervalStats] = useState<IntervalStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchIntervalStats = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Add a small delay to prevent rapid consecutive updates
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create date objects for 4 PM on selected date to 3 AM next day in Toronto time
        const startDate = new Date(`${selectedDate}T16:00:00-04:00`); // Toronto timezone offset
        const endDate = new Date(`${selectedDate}T03:00:00-04:00`);
        endDate.setDate(endDate.getDate() + 1);

        console.log('Fetching interval stats for:', {
          date: selectedDate,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          startTimeLocal: startDate.toLocaleString('en-US', { timeZone: 'America/Toronto' }),
          endTimeLocal: endDate.toLocaleString('en-US', { timeZone: 'America/Toronto' })
        });

        // Use a single query to get the latest state
        const { data, error } = await supabase
          .from('entries')
          .select('*')
          .gte('timestamp', startDate.toISOString())
          .lt('timestamp', endDate.toISOString())
          .order('timestamp', { ascending: true })
          .limit(1000); // Add a reasonable limit to prevent overwhelming the client

        if (error) {
          console.error('Error fetching stats:', error);
          setError(`Error fetching data: ${error.message}`);
          return;
        }

        console.log('Fetched interval entries count:', data?.length);

        if (!data || data.length === 0) {
          setIntervalStats([]);
          return;
        }

        // Process data into 15-minute intervals
        const intervals: { [interval: string]: IntervalStats } = {};
        
        // Initialize intervals from 16:00 to 23:59
        for (let hour = 16; hour < 24; hour++) {
          for (let minute = 0; minute < 60; minute += 15) {
            const hourStr = hour.toString().padStart(2, '0');
            const minuteStr = minute.toString().padStart(2, '0');
            const intervalStr = `${hourStr}:${minuteStr}`;
            intervals[intervalStr] = {
              interval: intervalStr,
              male: 0,
              female: 0,
              total: 0,
            };
          }
        }

        // Initialize intervals from 00:00 to 03:00
        for (let hour = 0; hour <= 3; hour++) {
          for (let minute = 0; minute < 60; minute += 15) {
            const hourStr = hour.toString().padStart(2, '0');
            const minuteStr = minute.toString().padStart(2, '0');
            const intervalStr = `${hourStr}:${minuteStr}`;
            intervals[intervalStr] = {
              interval: intervalStr,
              male: 0,
              female: 0,
              total: 0,
            };
          }
        }

        // Process entries
        data.forEach((entry: Entry) => {
          const entryDate = new Date(entry.timestamp);
          const torontoDate = new Date(entryDate.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
          const hour = torontoDate.getHours();
          const minute = Math.floor(torontoDate.getMinutes() / 15) * 15;
          const intervalStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          
          const count = entry.type === 'entry' ? 1 : -1;

          if (intervals[intervalStr]) {
            intervals[intervalStr][entry.gender] += count;
            intervals[intervalStr].total += count;
          }
        });

        // Convert to array, sort by time (handling the day transition), and ensure non-negative counts
        const statsArray = Object.entries(intervals)
          .sort(([a], [b]) => {
            const hourA = parseInt(a.split(':')[0]);
            const hourB = parseInt(b.split(':')[0]);
            // Adjust hours after midnight to be 24+
            const adjustedHourA = hourA < 4 ? hourA + 24 : hourA;
            const adjustedHourB = hourB < 4 ? hourB + 24 : hourB;
            return adjustedHourA - adjustedHourB;
          })
          .map(([_, interval]) => ({
            ...interval,
            male: Math.max(0, interval.male),
            female: Math.max(0, interval.female),
            total: Math.max(0, interval.total)
          }));

        setIntervalStats(statsArray);
      } catch (err: any) {
        console.error('Error processing stats:', err);
        setError(err?.message || 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce the fetchIntervalStats function for the subscription
    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(fetchIntervalStats, 250);
    };

    // Initial fetch
    fetchIntervalStats();

    // Set up real-time subscription for the selected timeframe
    const startDate = new Date(`${selectedDate}T16:00:00-04:00`); // Toronto timezone offset
    const endDate = new Date(`${selectedDate}T03:00:00-04:00`);
    endDate.setDate(endDate.getDate() + 1);

    const subscription = supabase
      .channel('entries')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'entries',
          filter: `timestamp.gte.${startDate.toISOString()}.and.timestamp.lt.${endDate.toISOString()}`
        },
        debouncedFetch // Use the debounced version for real-time updates
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId); // Clean up the timeout
      subscription.unsubscribe();
    };
  }, [selectedDate]);

  const getHeatmapColor = (total: number) => {
    if (total === 0) return 'bg-white/5';
    if (total < 50) return 'bg-indigo-500/20';
    if (total < 100) return 'bg-indigo-500/40';
    if (total < 200) return 'bg-indigo-500/60';
    return 'bg-indigo-500/80';
  };

  const getTextColor = (total: number) => {
    if (total === 0) return 'text-gray-500';
    if (total < 50) return 'text-indigo-200';
    if (total < 100) return 'text-indigo-100';
    return 'text-white';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header Section with Logo */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center">
          <Image
            src="/logo-liars-transparent.png"
            alt="Liar's Tally Logo"
            width={80}
            height={80}
            className="object-contain"
            priority
          />
        </div>
        <div className="flex flex-col items-center sm:items-end gap-2">
          <input
            type="date"
            value={selectedDate}
            max={getTodayInToronto()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full max-w-[250px] sm:w-auto px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <span className="text-xs text-white/50">Shows data from 4 PM to 3 AM next day</span>
        </div>
      </div>

      {error && (
        <div className="p-3 sm:p-4 bg-red-500/20 border border-red-500/50 text-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-6 text-white/50 text-sm">Loading data...</div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
            <div className="backdrop-blur-sm bg-white/5 p-3 sm:p-4 rounded-xl border border-white/10">
              <h3 className="text-sm sm:text-base font-semibold mb-1 text-gray-400">Total Today</h3>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
                {intervalStats.reduce((acc, curr) => acc + curr.total, 0)}
              </p>
            </div>
            <div className="backdrop-blur-sm bg-white/5 p-3 sm:p-4 rounded-xl border border-white/10">
              <h3 className="text-sm sm:text-base font-semibold mb-1 text-gray-400">Male</h3>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-400">
                {intervalStats.reduce((acc, curr) => acc + curr.male, 0)}
              </p>
            </div>
            <div className="backdrop-blur-sm bg-white/5 p-3 sm:p-4 rounded-xl col-span-2 sm:col-span-1 mt-2 sm:mt-0">
              <h3 className="text-sm sm:text-base font-semibold mb-1 text-gray-400">Female</h3>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-pink-400">
                {intervalStats.reduce((acc, curr) => acc + curr.female, 0)}
              </p>
            </div>
          </div>

          {/* Chart Section */}
          <div className="backdrop-blur-sm bg-white/5 p-3 sm:p-4 rounded-xl border border-white/10">
            <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 text-gray-200">15-Minute Interval Traffic</h2>
            {intervalStats.length > 0 ? (
              <div className="h-[250px] sm:h-[300px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={intervalStats} margin={{ top: 5, right: 5, bottom: 25, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis 
                      dataKey="interval" 
                      interval={7}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                      tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                      scale="band"
                    />
                    <YAxis 
                      tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                      width={25}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(17,24,39,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        fontSize: '12px',
                        padding: '8px'
                      }}
                    />
                    <Legend 
                      wrapperStyle={{
                        fontSize: '12px',
                        marginTop: '8px'
                      }}
                    />
                    <Bar dataKey="male" name="Male" fill="#3B82F6" maxBarSize={50} />
                    <Bar dataKey="female" name="Female" fill="#EC4899" maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-6 text-white/50 text-sm">
                No data available for this date
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
} 