'use client';

import { useState, useEffect, useMemo } from 'react';
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
  LineChart,
  Line,
} from 'recharts';
import { supabase } from '@/lib/supabase';

type Gender = 'male' | 'female';


interface IntervalStats {
  interval: string;
  totalEntries: number;
  totalExits: number;
  maleEntries: number;
  maleExits: number;
  femaleEntries: number;
  femaleExits: number;
  runningTotal: number;
}

interface PeakStats {
  totalEntries: number;
  totalExits: number;
  maleEntries: number;
  femaleEntries: number;
  maleExits: number;
  femaleExits: number;
  peakEntryInterval: string;
  peakExitInterval: string;
  maxTraffic: number;
}

interface Entry {
  id: string;
  gender: Gender;
  type: 'entry' | 'exit';
  timestamp: string;
  date: string;
}

export default function AdminDashboard() {
  // Get current date in Toronto timezone
  const getTodayInToronto = () => {
    const now = new Date();
    const torontoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
    
    // If it's between midnight and 3 AM Toronto time, show the previous day
    if (torontoTime.getHours() < 3) {
      torontoTime.setDate(torontoTime.getDate() - 1);
    }
    
    return torontoTime.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getTodayInToronto());
  const [intervalStats, setIntervalStats] = useState<IntervalStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);

  const fetchIntervalStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get entries for the selected date
      const { data: entries, error } = await supabase
        .from('entries')
        .select('*')
        .eq('date', selectedDate)
        .or('type.eq.entry,type.eq.exit')
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Entries fetch error:', error);
        throw error;
      }

      if (!entries || entries.length === 0) {
        console.log('No entries found for date range');
        setIntervalStats([]);
        setEntries([]);
        return;
      }

      setEntries(entries);

      // Initialize intervals map for processing
      const intervals: { [interval: string]: IntervalStats } = {};
      
      // Initialize intervals from 4:00 to 23:59
      for (let hour = 4; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
          const hourStr = hour.toString().padStart(2, '0');
          const minuteStr = minute.toString().padStart(2, '0');
          const intervalStr = `${hourStr}:${minuteStr}`;
          intervals[intervalStr] = {
            interval: intervalStr,
            totalEntries: 0,
            totalExits: 0,
            maleEntries: 0,
            maleExits: 0,
            femaleEntries: 0,
            femaleExits: 0,
            runningTotal: 0
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
            totalEntries: 0,
            totalExits: 0,
            maleEntries: 0,
            maleExits: 0,
            femaleEntries: 0,
            femaleExits: 0,
            runningTotal: 0
          };
        }
      }

      // Process entries and aggregate into 15-minute intervals
      entries.forEach((entry: Entry) => {
        const entryDate = new Date(entry.timestamp);
        const torontoTime = new Date(entryDate.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
        const hour = torontoTime.getHours();
        const minute = Math.floor(torontoTime.getMinutes() / 15) * 15;
        const intervalStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        if (intervals[intervalStr]) {
          if (entry.type === 'entry') {
            intervals[intervalStr].totalEntries++;
            if (entry.gender === 'male') {
              intervals[intervalStr].maleEntries++;
            } else {
              intervals[intervalStr].femaleEntries++;
            }
          } else if (entry.type === 'exit') {
            intervals[intervalStr].totalExits++;
            if (entry.gender === 'male') {
              intervals[intervalStr].maleExits++;
            } else {
              intervals[intervalStr].femaleExits++;
            }
          }
        }
      });

      // Convert intervals object to sorted array and calculate running totals
      let runningTotal = 0;
      const statsArray = Object.entries(intervals)
        .sort(([a], [b]) => {
          const hourA = parseInt(a.split(':')[0]);
          const hourB = parseInt(b.split(':')[0]);
          const adjustedHourA = hourA < 4 ? hourA + 24 : hourA;
          const adjustedHourB = hourB < 4 ? hourB + 24 : hourB;
          return adjustedHourA - adjustedHourB;
        })
        .map(([_, interval]) => {
          runningTotal += interval.totalEntries - interval.totalExits;
          return {
            ...interval,
            runningTotal: Math.max(0, runningTotal)
          };
        });

      // Calculate peak statistics
      const peaks = statsArray.reduce((peaks, interval) => {
        if (interval.totalEntries > peaks.totalEntries) {
          peaks.totalEntries = interval.totalEntries;
        }
        if (interval.totalExits > peaks.totalExits) {
          peaks.totalExits = interval.totalExits;
        }
        if (interval.maleEntries > peaks.maleEntries) {
          peaks.maleEntries = interval.maleEntries;
        }
        if (interval.femaleEntries > peaks.femaleEntries) {
          peaks.femaleEntries = interval.femaleEntries;
        }
        if (interval.maleExits > peaks.maleExits) {
          peaks.maleExits = interval.maleExits;
        }
        if (interval.femaleExits > peaks.femaleExits) {
          peaks.femaleExits = interval.femaleExits;
        }
        return peaks;
      }, {
        totalEntries: 0,
        totalExits: 0,
        maleEntries: 0,
        femaleEntries: 0,
        maleExits: 0,
        femaleExits: 0,
        peakEntryInterval: '',
        peakExitInterval: '',
        maxTraffic: 0,
      });

      setIntervalStats(statsArray);

    } catch (err: any) {
      console.error('Error fetching stats:', err);
      setError(`Error fetching data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIntervalStats();
  }, [selectedDate]);

  // Helper functions for styling
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

  // Calculate peak traffic statistics
  const peakStats = useMemo(() => {
    if (!entries || entries.length === 0) return null;

    // Filter entries for the selected date only
    const dateFilteredEntries = entries.filter(entry => entry.date === selectedDate);
    if (dateFilteredEntries.length === 0) return null;

    // Calculate total entries and exits for the selected date
    const totalEntries = dateFilteredEntries.filter(e => e.type === 'entry').length;
    const totalExits = dateFilteredEntries.filter(e => e.type === 'exit').length;

    // Calculate gender-specific counts for the selected date
    const maleEntries = dateFilteredEntries.filter(e => e.type === 'entry' && e.gender === 'male').length;
    const femaleEntries = dateFilteredEntries.filter(e => e.type === 'entry' && e.gender === 'female').length;
    const maleExits = dateFilteredEntries.filter(e => e.type === 'exit' && e.gender === 'male').length;
    const femaleExits = dateFilteredEntries.filter(e => e.type === 'exit' && e.gender === 'female').length;

    // Find the interval with the highest traffic
    let maxTraffic = 0;
    let peakEntryInterval = '';
    let peakExitInterval = '';

    // Process each interval for the selected date
    intervalStats.forEach((stats) => {
      // Track peak entry times
      if (stats.totalEntries > maxTraffic) {
        maxTraffic = stats.totalEntries;
        peakEntryInterval = stats.interval;
      }
      
      // Track peak exit times
      if (stats.totalExits > maxTraffic) {
        maxTraffic = stats.totalExits;
        peakExitInterval = stats.interval;
      }
    });

    return {
      totalEntries,
      totalExits,
      maleEntries,
      femaleEntries,
      maleExits,
      femaleExits,
      peakEntryInterval,
      peakExitInterval,
      maxTraffic
    };
  }, [entries, intervalStats, selectedDate]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header Section with Date Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
          <div className="flex items-center gap-10 mb-2 sm:mb-0">
            <a
              href="/"
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-200 flex items-center gap-2 text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white/70"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-white/70">Back</span>
            </a>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
          </div>
          <div className="w-full sm:w-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm sm:text-base">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            {/* Current Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6">
              {/* Currently Inside Card */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h3 className="text-sm font-semibold mb-1 text-gray-400">Currently Inside</h3>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {entries.reduce((total, entry) => {
                    if (entry.type === 'entry') return total + 1;
                    return Math.max(0, total - 1);
                  }, 0)}
                </p>
              </div>
              {/* Total Entries Card */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h3 className="text-sm font-semibold mb-1 text-gray-400">Total Entries</h3>
                <p className="text-2xl sm:text-3xl font-bold text-green-400">
                  {entries.filter(entry => entry.type === 'entry').length}
                </p>
              </div>
              {/* Total Exits Card */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h3 className="text-sm font-semibold mb-1 text-gray-400">Total Exits</h3>
                <p className="text-2xl sm:text-3xl font-bold text-red-400">
                  {entries.filter(entry => entry.type === 'exit').length}
                </p>
              </div>
            </div>

            {/* Charts Section */}
            <div className="space-y-3 sm:space-y-4">
              {/* Total Traffic Chart */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-gray-200">
                  Total Traffic (15-Minute Intervals)
                </h2>
                {intervalStats.length > 0 ? (
                  <div className="h-[200px] sm:h-[250px] md:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={intervalStats} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="interval" 
                          interval={5}
                          angle={-45}
                          textAnchor="end"
                          height={40}
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
                        <Line 
                          type="monotone"
                          dataKey="totalEntries" 
                          name="Entries" 
                          stroke="#10B981" 
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line 
                          type="monotone"
                          dataKey="totalExits" 
                          name="Exits" 
                          stroke="#EF4444" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-4 text-white/50 text-sm">
                    No data available for this date
                  </div>
                )}
              </div>

              {/* Gender-specific Traffic Charts */}
              {/* Male Traffic Chart */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-gray-200">
                  Male Traffic (15-Minute Intervals)
                </h2>
                {intervalStats.length > 0 ? (
                  <div className="h-[200px] sm:h-[250px] md:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={intervalStats} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="interval" 
                          interval={5}
                          angle={-45}
                          textAnchor="end"
                          height={40}
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
                        <Line 
                          type="monotone"
                          dataKey="maleEntries" 
                          name="Male Entries" 
                          stroke="#3B82F6" 
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line 
                          type="monotone"
                          dataKey="maleExits" 
                          name="Male Exits" 
                          stroke="#EF4444" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-4 text-white/50 text-sm">
                    No data available for this date
                  </div>
                )}
              </div>

              {/* Female Traffic Chart */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-gray-200">
                  Female Traffic (15-Minute Intervals)
                </h2>
                {intervalStats.length > 0 ? (
                  <div className="h-[200px] sm:h-[250px] md:h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={intervalStats} margin={{ top: 5, right: 5, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="interval" 
                          interval={5}
                          angle={-45}
                          textAnchor="end"
                          height={40}
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
                        <Line 
                          type="monotone"
                          dataKey="femaleEntries" 
                          name="Female Entries" 
                          stroke="#EC4899" 
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line 
                          type="monotone"
                          dataKey="femaleExits" 
                          name="Female Exits" 
                          stroke="#EF4444" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-4 text-white/50 text-sm">
                    No data available for this date
                  </div>
                )}
              </div>

              {/* Peak Traffic Statistics Table */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3 text-gray-200">
                  Peak Traffic Statistics
                </h2>
                <div className="overflow-x-auto -mx-3 sm:-mx-4">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="text-xs uppercase text-gray-400">
                      <tr>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Peak Entries</th>
                        <th className="px-3 py-2">Peak Time</th>
                        <th className="px-3 py-2">Peak Exits</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {/* Total Traffic Row */}
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium">Total</td>
                        <td className="px-3 py-2 text-green-400">{peakStats?.totalEntries || 0}</td>
                        <td className="px-3 py-2">{peakStats?.peakEntryInterval || '-'}</td>
                        <td className="px-3 py-2 text-red-400">{peakStats?.totalExits || 0}</td>
                      </tr>
                      {/* Male Traffic Row */}
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium">Male</td>
                        <td className="px-3 py-2 text-blue-400">{peakStats?.maleEntries || 0}</td>
                        <td className="px-3 py-2">{peakStats?.peakEntryInterval || '-'}</td>
                        <td className="px-3 py-2 text-red-400">{peakStats?.maleExits || 0}</td>
                      </tr>
                      {/* Female Traffic Row */}
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium">Female</td>
                        <td className="px-3 py-2 text-pink-400">{peakStats?.femaleEntries || 0}</td>
                        <td className="px-3 py-2">{peakStats?.peakEntryInterval || '-'}</td>
                        <td className="px-3 py-2 text-red-400">{peakStats?.femaleExits || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 