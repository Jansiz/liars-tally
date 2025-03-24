# Venue Tally System

A real-time venue occupancy tracking system built with Next.js, Supabase, and TypeScript.

## Features

- 👥 Track male and female entries/exits
- 📊 Real-time visitor counter
- 🔥 Heatmap of peak hours
- 📱 Mobile-friendly UI
- 🔒 Admin authentication
- 📈 Real-time analytics dashboard
- 📅 Historical data analysis
- 🔄 Session-based tracking
- 📊 Gender-specific analytics

## Tech Stack

- Frontend: Next.js (React + TypeScript)
- Styling: Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth)
- Charts: Recharts
- Authentication: Supabase Auth
- Hosting: Vercel
- Real-time updates: Supabase Realtime

## Architecture Overview

### Database Schema

The application uses three main tables:

1. **entries**
   - Primary table for real-time entry/exit tracking
   - Stores individual entry/exit records with gender and timestamp
   - Supports session markers (session_start, session_end)
   - Includes count_before_reset for session statistics

2. **historical_entries**
   - Archives completed sessions
   - Stores aggregated statistics for each session
   - Maintains historical records for long-term analysis

3. **historical_intervals**
   - Stores 15-minute interval data
   - Enables detailed analysis of peak hours
   - Maintains gender-specific statistics per interval

### Components

#### EntryLogger Component
- Primary interface for real-time entry/exit tracking
- Features:
  - Real-time counter display
  - Gender-specific entry/exit buttons
  - Session management
  - Reset functionality with data archiving
  - Connection status monitoring
  - Error handling and recovery

#### AdminDashboard Component
- Comprehensive analytics interface
- Features:
  - Date-based historical data viewing
  - Real-time statistics
  - Interactive charts:
    - Total traffic visualization
    - Gender-specific traffic patterns
  - Peak traffic analysis
  - Session management
  - Mobile-responsive design

### Data Flow

1. **Entry/Exit Recording:**
   - User clicks entry/exit buttons
   - Data is sent to Supabase
   - Real-time updates via Supabase Realtime
   - Counter updates immediately

2. **Session Management:**
   - Sessions are created for each day
   - Reset functionality archives current data
   - Historical data is processed into intervals
   - Statistics are aggregated for analysis

3. **Analytics Processing:**
   - 15-minute interval calculations
   - Peak hour identification
   - Gender-specific statistics
   - Historical trend analysis

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/venue-tally.git
   cd venue-tally
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a Supabase project and set up the following tables:

   ```sql
   -- Create entries table
   create table entries (
     id uuid default uuid_generate_v4() primary key,
     gender text check (gender in ('male', 'female', 'system')),
     type text check (type in ('entry', 'exit', 'session_start', 'session_end')),
     timestamp timestamptz default now(),
     session_id varchar,
     count_before_reset integer default 0
   );

   -- Create historical_entries table
   create table historical_entries (
     id uuid default uuid_generate_v4() primary key,
     session_id varchar,
     date date,
     total_entries integer,
     total_exits integer,
     peak_entries integer,
     peak_exits integer,
     peak_time_entries time,
     peak_time_exits time,
     male_entries integer,
     female_entries integer,
     male_exits integer,
     female_exits integer,
     created_at timestamptz default now()
   );

   -- Create historical_intervals table
   create table historical_intervals (
     id uuid default uuid_generate_v4() primary key,
     session_id varchar,
     interval_start timestamptz,
     interval_end timestamptz,
     total_entries integer,
     total_exits integer,
     male_entries integer,
     female_entries integer,
     male_exits integer,
     female_exits integer,
     created_at timestamptz default now()
   );

   -- Enable Row Level Security (RLS)
   alter table entries enable row level security;
   alter table historical_entries enable row level security;
   alter table historical_intervals enable row level security;

   -- Create policies
   create policy "Anyone can insert entries" on entries
     for insert to anon
     with check (true);

   create policy "Anyone can view entries" on entries
     for select to anon
     using (true);

   create policy "Authenticated users can view historical data" on historical_entries
     for select to authenticated
     using (true);

   create policy "Authenticated users can view interval data" on historical_intervals
     for select to authenticated
     using (true);
   ```

4. Create a `.env.local` file with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

## Usage

### Entry Logger Page
1. Open the main page
2. Use the + and - buttons to log entries and exits
3. Select gender for each entry/exit
4. Monitor real-time counts
5. Use reset button to archive current session

### Admin Dashboard
1. Navigate to `/admin`
2. Log in with admin credentials
3. Features available:
   - Date selection for historical data
   - Real-time statistics cards
   - Interactive traffic charts
   - Peak hour analysis
   - Gender-specific analytics
   - Session information display

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel
4. Deploy!

## License

MIT
