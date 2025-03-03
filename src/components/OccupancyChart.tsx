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
import { supabase } from '@/lib/supabase';

interface OccupancySnapshot {
  timestamp: string;
  male_count: number;
  female_count: number;
  total_count: number;
}

export default function OccupancyChart() {
  const [snapshots, setSnapshots] = useState<OccupancySnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSnapshots = async () => {
      // Get snapshots for the last 24 hours
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const { data, error } = await supabase
        .from('occupancy_snapshots')
        .select('*')
        .gte('timestamp', twentyFourHoursAgo.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Error fetching snapshots:', error);
        setError(error.message);
        return;
      }

      setSnapshots(data.map(snapshot => ({
        ...snapshot,
        timestamp: new Date(snapshot.timestamp).toLocaleTimeString(),
      })));
    };

    // Fetch initial data
    fetchSnapshots();

    // Set up real-time subscription for new snapshots
    const subscription = supabase
      .channel('occupancy-snapshots')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'occupancy_snapshots' },
        (payload: { new: OccupancySnapshot }) => {
          console.log('New snapshot:', payload);
          setSnapshots(prev => [...prev.slice(-95), {
            ...payload.new,
            timestamp: new Date(payload.new.timestamp).toLocaleTimeString(),
          }]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (error) {
    return <div className="text-red-500">Error loading chart: {error}</div>;
  }

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer>
        <BarChart data={snapshots}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            interval={4}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="male_count" name="Male" fill="#3B82F6" />
          <Bar dataKey="female_count" name="Female" fill="#EC4899" />
          <Bar dataKey="total_count" name="Total" fill="#10B981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
} 