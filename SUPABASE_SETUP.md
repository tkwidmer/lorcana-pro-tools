# Supabase Setup Instructions

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Copy your **Project URL** and **Anon Key** from Settings → API Keys
4. Fill in the `.env` file with these values:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

## 2. Configure Google OAuth

1. In Supabase Dashboard, go to Authentication → Providers
2. Find **Google** and click to configure
3. Paste your Google OAuth credentials:
   - Client ID: `xxx.apps.googleusercontent.com`
   - Client Secret: (from Google Cloud Console)
4. Click **Save**

## 3. Create Database Schema

Run the following SQL in Supabase's SQL Editor (Authentication → SQL Editor):

```sql
-- Create profiles table to extend auth.users
create table public.profiles (
  id uuid references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamp default now(),
  primary key (id)
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Users can only read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Automatically create a profile when a user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 4. Configure Vercel Environment Variables

Add these to your Vercel project:
- `VITE_SUPABASE_URL`: (publicly visible)
- `VITE_SUPABASE_ANON_KEY`: (publicly visible)

The GitHub integration will automatically pull these from your Vercel project settings when you push.

## 5. Local Development

For local development, create `.env.local` (ignored by git):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 6. Test the Integration

1. Run `npm run dev`
2. Click "Login" in the top right
3. Click "Sign in with Google"
4. You should be redirected to Google's consent screen
5. After authorizing, you should be redirected back and logged in

If you get errors, check:
- Supabase API credentials in `.env`
- Google OAuth credentials configured in Supabase
- Browser console for detailed error messages
