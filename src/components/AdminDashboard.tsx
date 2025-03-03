'use client';

import { useState, useEffect } from 'react';
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
  const [intervalStats, setIntervalStats] = useState<IntervalStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<DailyTotal[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch monthly data for calendar
  useEffect(() => {
    const fetchMonthlyStats = async () => {
      try {
        const [year, month] = selectedMonth.split('-');
        const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
        // Get last day of month by going to first day of next month and subtracting one day
        const endOfMonth = new Date(parseInt(year), parseInt(month), 0);
        
        const { data, error } = await supabase
          .from('entries')
          .select('*')
          .gte('timestamp', startOfMonth.toISOString())
          .lt('timestamp', endOfMonth.toISOString());

        if (error) {
          console.error('Error fetching monthly stats:', error);
          return;
        }

        const dailyTotals: { [key: string]: DailyTotal } = {};
        
        // Initialize all days of the month using the correct last day
        const daysInMonth = endOfMonth.getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(parseInt(year), parseInt(month) - 1, d);
          const dateStr = date.toISOString().split('T')[0];
          dailyTotals[dateStr] = {
            date: dateStr,
            total: 0,
            male: 0,
            female: 0
          };
        }

        // Process entries
        data?.forEach((entry: Entry) => {
          const entryDate = new Date(entry.timestamp);
          const dateStr = entryDate.toISOString().split('T')[0];
          
          if (dailyTotals[dateStr]) {
            const count = entry.type === 'entry' ? 1 : -1;
            dailyTotals[dateStr][entry.gender] += count;
            dailyTotals[dateStr].total += count;
          }
        });

        setMonthlyStats(Object.values(dailyTotals));
      } catch (err) {
        console.error('Error processing monthly stats:', err);
      }
    };

    fetchMonthlyStats();
  }, [selectedMonth]);

  useEffect(() => {
    const fetchIntervalStats = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Create date objects for 4 PM on selected date to 3 AM next day
        const startTime = new Date(selectedDate);
        startTime.setHours(16, 0, 0, 0); // 4 PM on selected date
        
        const endTime = new Date(selectedDate);
        endTime.setDate(endTime.getDate() + 1); // Next day
        endTime.setHours(3, 0, 0, 0); // 3 AM

        const { data, error } = await supabase
          .from('entries')
          .select('*')
          .gte('timestamp', startTime.toISOString())
          .lt('timestamp', endTime.toISOString())
          .order('timestamp', { ascending: true });

        if (error) {
          console.error('Error fetching stats:', error);
          setError(`Error fetching data: ${error.message}`);
          return;
        }

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
          const hour = entryDate.getHours();
          const minute = Math.floor(entryDate.getMinutes() / 15) * 15;
          const intervalStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          
          const count = entry.type === 'entry' ? 1 : -1;

          if (intervals[intervalStr] && (entry.gender === 'male' || entry.gender === 'female')) {
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

    fetchIntervalStats();

    // Set up real-time subscription for the selected timeframe
    const startTime = new Date(selectedDate);
    startTime.setHours(16, 0, 0, 0);
    
    const endTime = new Date(selectedDate);
    endTime.setDate(endTime.getDate() + 1);
    endTime.setHours(3, 0, 0, 0);

    const subscription = supabase
      .channel('entries')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'entries',
          filter: `timestamp.gte.${startTime.toISOString()}.and.timestamp.lt.${endTime.toISOString()}`
        },
        fetchIntervalStats
      )
      .subscribe();

    return () => {
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
      {/* Header Section */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-pink-400 text-center sm:text-left">
          Analytics Dashboard
        </h1>
        <div className="flex flex-col items-center sm:items-end gap-2">
          <input
            type="date"
            value={selectedDate}
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

          {/* Monthly Calendar View */}
          <div className="backdrop-blur-sm bg-white/5 p-3 sm:p-4 rounded-xl border border-white/10">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-200">Monthly Overview</h2>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full max-w-[250px] sm:w-auto px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {[
                { id: 'sun', label: 'S' },
                { id: 'mon', label: 'M' },
                { id: 'tue', label: 'T' },
                { id: 'wed', label: 'W' },
                { id: 'thu', label: 'T' },
                { id: 'fri', label: 'F' },
                { id: 'sat', label: 'S' }
              ].map(day => (
                <div key={day.id} className="text-center text-xs text-gray-400 py-1">
                  {day.label}
                </div>
              ))}
              
              {monthlyStats.map((day, index) => {
                const date = new Date(day.date);
                const firstDayOffset = new Date(day.date.slice(0, 7) + '-01').getDay();
                
                if (index === 0) {
                  const emptyCells = Array(firstDayOffset).fill(null);
                  return [
                    ...emptyCells.map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square rounded-lg bg-white/5" />
                    )),
                    <div
                      key={day.date}
                      className={`aspect-square rounded-lg ${getHeatmapColor(day.total)} p-1 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all duration-200`}
                      onClick={() => setSelectedDate(day.date)}
                    >
                      <div className="text-[10px] text-gray-400">{date.getDate()}</div>
                      <div className={`text-xs font-bold ${getTextColor(day.total)}`}>
                        {day.total}
                      </div>
                    </div>
                  ];
                }
                
                return (
                  <div
                    key={day.date}
                    className={`aspect-square rounded-lg ${getHeatmapColor(day.total)} p-1 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all duration-200`}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <div className="text-[10px] text-gray-400">{date.getDate()}</div>
                    <div className={`text-xs font-bold ${getTextColor(day.total)}`}>
                      {day.total}
                    </div>
                  </div>
                );
              })}
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