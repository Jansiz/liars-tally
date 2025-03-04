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
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface Snapshot {
  timestamp: string;
  male: number;
  female: number;
}

export default function OccupancyChart() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        const { data, error } = await supabase
          .from('snapshots')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(24);

        if (error) throw error;

        if (data) {
          setSnapshots(data.map((snapshot: Snapshot) => ({
            ...snapshot,
            timestamp: new Date(snapshot.timestamp).toLocaleTimeString(),
          })));
        }
      } catch (err) {
        console.error('Error fetching snapshots:', err);
        setError('Failed to load occupancy data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSnapshots();

    const channel = supabase
      .channel('snapshots')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'snapshots' 
      }, (payload: RealtimePostgresChangesPayload<Snapshot>) => {
        if (!payload.new) return;
        
        const snapshot = payload.new as Snapshot;
        setSnapshots(prev => [{
          ...snapshot,
          timestamp: new Date(snapshot.timestamp).toLocaleTimeString(),
        }, ...prev].slice(0, 24));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
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
          <Bar dataKey="male" name="Male" fill="#3B82F6" />
          <Bar dataKey="female" name="Female" fill="#EC4899" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
} 