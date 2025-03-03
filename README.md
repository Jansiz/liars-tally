# Venue Tally System

A real-time venue occupancy tracking system built with Next.js, Supabase, and TypeScript.

## Features

- 👥 Track male and female entries/exits
- 📊 Real-time visitor counter
- 🔥 Heatmap of peak hours
- 📱 Mobile-friendly UI
- 🔒 Admin authentication
- 📈 Real-time analytics dashboard

## Tech Stack

- Frontend: Next.js (React + TypeScript)
- Styling: Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth)
- Charts: Recharts
- Authentication: Supabase Auth
- Hosting: Vercel
- Real-time updates: Supabase Realtime

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project

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
     gender text check (gender in ('male', 'female')),
     type text check (type in ('entry', 'exit')),
     timestamp timestamptz default now()
   );

   -- Create admins table
   create table admins (
     id uuid references auth.users primary key,
     email text unique not null,
     role text check (role = 'admin')
   );

   -- Enable Row Level Security (RLS)
   alter table entries enable row level security;
   alter table admins enable row level security;

   -- Create policies
   create policy "Anyone can insert entries" on entries
     for insert to anon
     with check (true);

   create policy "Anyone can view entries" on entries
     for select to anon
     using (true);

   create policy "Only admins can view admin data" on admins
     for select to authenticated
     using (auth.uid() = id);
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

6. Create an admin user:
   - Sign up a user through Supabase Authentication
   - Insert the user into the admins table with the admin role:
     ```sql
     insert into admins (id, email, role)
     values ('user_id_from_auth', 'admin@example.com', 'admin');
     ```

## Usage

1. **Entry/Exit Logging:**
   - Open the main page
   - Use the + and - buttons to log entries and exits
   - Counts update in real-time

2. **Admin Dashboard:**
   - Navigate to `/admin`
   - Log in with admin credentials
   - View real-time analytics and historical data

3. **Fake Total:**
   - Click the "Show Fake Count" button to display 570
   - Click again to show the real count

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
