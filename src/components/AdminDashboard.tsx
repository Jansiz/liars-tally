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
  LineChart,
  Line,
} from 'recharts';
import { supabase, Entry } from '@/lib/supabase';

interface SessionMarker {
  id: string;
  timestamp: string;
  type: 'session_start' | 'session_end';
  session_id: string;
  count_before_reset: number;
}

interface IntervalStats {
  interval: string;
  totalEntries: number;
  totalExits: number;
  maleEntries: number;
  maleExits: number;
  femaleEntries: number;
  femaleExits: number;
  runningTotal: number;
  sessionId: string;
}

interface PeakStats {
  totalPeakEntries: { count: number; time: string };
  totalPeakExits: { count: number; time: string };
  malePeakEntries: { count: number; time: string };
  malePeakExits: { count: number; time: string };
  femalePeakEntries: { count: number; time: string };
  femalePeakExits: { count: number; time: string };
  sessionId: string;
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
  const [peakStats, setPeakStats] = useState<PeakStats>({
    totalPeakEntries: { count: 0, time: '-' },
    totalPeakExits: { count: 0, time: '-' },
    malePeakEntries: { count: 0, time: '-' },
    malePeakExits: { count: 0, time: '-' },
    femalePeakEntries: { count: 0, time: '-' },
    femalePeakExits: { count: 0, time: '-' },
    sessionId: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [sessionStartTime, setSessionStartTime] = useState<string>('');
  const [totalInside, setTotalInside] = useState(0);

  // Fetch and process interval statistics for the selected date
  const fetchIntervalStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Create date objects for 4 PM on selected date to 3 AM next day in Toronto time
      const startDate = new Date(`${selectedDate}T16:00:00-04:00`); // Toronto timezone offset
      const endDate = new Date(`${selectedDate}T03:00:00-04:00`);
      endDate.setDate(endDate.getDate() + 1);

      // Log date range for debugging
      console.log('Fetching interval stats for:', {
        date: selectedDate,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        startTimeLocal: startDate.toLocaleString('en-US', { timeZone: 'America/Toronto' }),
        endTimeLocal: endDate.toLocaleString('en-US', { timeZone: 'America/Toronto' })
      });

      // Get or create session for the selected date
      const { data: sessionData, error: sessionError } = await supabase
        .from('entries')
        .select('*')
        .eq('type', 'session_start')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: false })
        .limit(1);

      if (sessionError) throw sessionError;

      let activeSessionId: string;
      
      // Create new session if none exists for the date
      if (!sessionData || sessionData.length === 0) {
        const newSessionId = `${selectedDate}-${Date.now()}`;
        const { data: newSession, error: createError } = await supabase
          .from('entries')
          .insert({
            timestamp: new Date().toISOString(),
            type: 'session_start',
            gender: 'system',
            session_id: newSessionId,
            count_before_reset: 0
          })
          .select()
          .single();

        if (createError) throw createError;
        
        activeSessionId = newSessionId;
        setSessionStartTime(new Date().toISOString());
      } else {
        activeSessionId = sessionData[0].session_id;
        setSessionStartTime(sessionData[0].timestamp);
      }

      setCurrentSessionId(activeSessionId);

      // Fetch regular entries for the current session
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('session_id', activeSessionId)
        .or('type.eq.entry,type.eq.exit')
        .order('timestamp', { ascending: true });

      if (error) throw error;

      console.log('Fetched interval entries:', data);

      if (!data || data.length === 0) {
        setIntervalStats([]);
        setTotalInside(0);
        return;
      }

      // Calculate total people currently inside for this session
      const totalInside = data.reduce((total: number, entry: Entry) => {
        if (entry.type === 'entry') {
          return total + 1;
        } else {
          return Math.max(0, total - 1);
        }
      }, 0);

      setTotalInside(totalInside);

      // Initialize intervals map for processing
      const intervals: { [interval: string]: IntervalStats } = {};
      
      // Initialize intervals from 16:00 to 23:59
      for (let hour = 16; hour < 24; hour++) {
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
            runningTotal: 0,
            sessionId: activeSessionId
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
            runningTotal: 0,
            sessionId: activeSessionId
          };
        }
      }

      // Process entries and aggregate into 15-minute intervals
      data.forEach((entry: Entry) => {
        const entryDate = new Date(entry.timestamp);
        const torontoDate = new Date(entryDate.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
        const hour = torontoDate.getHours();
        const minute = Math.floor(torontoDate.getMinutes() / 15) * 15;
        const intervalStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        if (intervals[intervalStr]) {
          if (entry.type === 'entry') {
            intervals[intervalStr].totalEntries++;
            if (entry.gender === 'male') {
              intervals[intervalStr].maleEntries++;
            } else {
              intervals[intervalStr].femaleEntries++;
            }
          } else {
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
      const statsArray = Object.entries(intervals)
        .sort(([a], [b]) => {
          const hourA = parseInt(a.split(':')[0]);
          const hourB = parseInt(b.split(':')[0]);
          // Adjust hours after midnight to be > 24 for proper sorting
          const adjustedHourA = hourA < 4 ? hourA + 24 : hourA;
          const adjustedHourB = hourB < 4 ? hourB + 24 : hourB;
          return adjustedHourA - adjustedHourB;
        })
        .map(([_, interval]) => ({
          ...interval,
          runningTotal: totalInside
        }));

      // Calculate peak statistics for each metric
      const peaks = statsArray.reduce((peaks, interval) => {
        // Update total peaks
        if (interval.totalEntries > peaks.totalPeakEntries.count) {
          peaks.totalPeakEntries = { count: interval.totalEntries, time: interval.interval };
        }
        if (interval.totalExits > peaks.totalPeakExits.count) {
          peaks.totalPeakExits = { count: interval.totalExits, time: interval.interval };
        }
        // Update male peaks
        if (interval.maleEntries > peaks.malePeakEntries.count) {
          peaks.malePeakEntries = { count: interval.maleEntries, time: interval.interval };
        }
        if (interval.maleExits > peaks.malePeakExits.count) {
          peaks.malePeakExits = { count: interval.maleExits, time: interval.interval };
        }
        // Update female peaks
        if (interval.femaleEntries > peaks.femalePeakEntries.count) {
          peaks.femalePeakEntries = { count: interval.femaleEntries, time: interval.interval };
        }
        if (interval.femaleExits > peaks.femalePeakExits.count) {
          peaks.femalePeakExits = { count: interval.femaleExits, time: interval.interval };
        }
        return peaks;
      }, {
        totalPeakEntries: { count: 0, time: '-' },
        totalPeakExits: { count: 0, time: '-' },
        malePeakEntries: { count: 0, time: '-' },
        malePeakExits: { count: 0, time: '-' },
        femalePeakEntries: { count: 0, time: '-' },
        femalePeakExits: { count: 0, time: '-' },
        sessionId: activeSessionId
      });

      // Update state with processed data
      setPeakStats(peaks);
      setIntervalStats(statsArray);

    } catch (err: any) {
      console.error('Error fetching stats:', err);
      setError(`Error fetching data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch interval stats whenever selected date changes
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header Section with Date Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 sm:mb-0">Admin Dashboard</h1>
          <div className="w-full sm:w-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
            />
          </div>
        </div>

        {/* Session Information Display */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-800 rounded-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-2 text-sm sm:text-base">
            <div>
              <span className="text-gray-400">Session Started: </span>
              <span className="font-medium">
                {sessionStartTime 
                  ? new Date(sessionStartTime).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Toronto'
                    })
                  : '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">ID: </span>
              <span className="font-mono text-xs sm:text-sm">{currentSessionId || '-'}</span>
            </div>
          </div>
        </div>

        {/* Error Message Display */}
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm sm:text-base">
            {error}
          </div>
        )}

        {/* Loading State or Main Content */}
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
                  {intervalStats.length > 0 ? intervalStats[intervalStats.length - 1].runningTotal : 0}
                </p>
              </div>
              {/* Total Entries Card */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h3 className="text-sm font-semibold mb-1 text-gray-400">Total Entries</h3>
                <p className="text-2xl sm:text-3xl font-bold text-green-400">
                  {intervalStats.reduce((acc, curr) => acc + curr.totalEntries, 0)}
                </p>
              </div>
              {/* Total Exits Card */}
              <div className="backdrop-blur-sm bg-white/5 p-3 rounded-xl border border-white/10">
                <h3 className="text-sm font-semibold mb-1 text-gray-400">Total Exits</h3>
                <p className="text-2xl sm:text-3xl font-bold text-red-400">
                  {intervalStats.reduce((acc, curr) => acc + curr.totalExits, 0)}
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
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Peak Exits</th>
                        <th className="px-3 py-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      {/* Total Traffic Row */}
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium">Total</td>
                        <td className="px-3 py-2 text-green-400">{peakStats.totalPeakEntries.count}</td>
                        <td className="px-3 py-2">{peakStats.totalPeakEntries.time}</td>
                        <td className="px-3 py-2 text-red-400">{peakStats.totalPeakExits.count}</td>
                        <td className="px-3 py-2">{peakStats.totalPeakExits.time}</td>
                      </tr>
                      {/* Male Traffic Row */}
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium">Male</td>
                        <td className="px-3 py-2 text-blue-400">{peakStats.malePeakEntries.count}</td>
                        <td className="px-3 py-2">{peakStats.malePeakEntries.time}</td>
                        <td className="px-3 py-2 text-red-400">{peakStats.malePeakExits.count}</td>
                        <td className="px-3 py-2">{peakStats.malePeakExits.time}</td>
                      </tr>
                      {/* Female Traffic Row */}
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium">Female</td>
                        <td className="px-3 py-2 text-pink-400">{peakStats.femalePeakEntries.count}</td>
                        <td className="px-3 py-2">{peakStats.femalePeakEntries.time}</td>
                        <td className="px-3 py-2 text-red-400">{peakStats.femalePeakExits.count}</td>
                        <td className="px-3 py-2">{peakStats.femalePeakExits.time}</td>
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