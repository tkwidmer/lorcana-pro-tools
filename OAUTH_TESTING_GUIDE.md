# Google OAuth Testing Guide

Your Supabase project and Google OAuth are now configured. Follow these steps to test the complete login flow.

## Starting the App

```bash
npm run dev
```

The app will start on `http://localhost:5173` (or the next available port).

## Testing the Login Flow

### 1. **Home Page (Logged Out)**
- Navigate to `http://localhost:5173/`
- You should see:
  - ✅ "Lorcana Pro Tools" header
  - ✅ "Login" link in the top right corner
  - ✅ Settings gear icon next to Login link

### 2. **Click Login**
- Click the "Login" link in the top right
- You should be taken to `/login`

### 3. **Login Page**
- You should see:
  - ✅ Centered form with "Lorcana Pro Tools" title
  - ✅ "Sign in with Google" button with Google logo
  - ✅ "Terms of Service" notice at bottom

### 4. **Click "Sign in with Google"**
- Clicking the button redirects to Google's consent screen
- You should see:
  - ✅ Google account selection or login
  - ✅ Permission request for your Lorcana Pro Tools app
  - ✅ Approval button

### 5. **Grant Permission**
- Approve the OAuth request
- You'll be redirected to `/auth/callback`

### 6. **Auth Callback Page**
- You should see:
  - ✅ Loading spinner with "Authenticating..." text
  - ✅ After a moment, auto-redirect to home page (`/`)

### 7. **Home Page (Logged In)**
- You should see:
  - ✅ Your Google account username in top right (before the @)
  - ✅ "Logout" button next to your username
  - ✅ "Login" link is gone

### 8. **Test Session Persistence**
- Reload the page
- You should:
  - ✅ Stay logged in
  - ✅ Still see your username and Logout button
  - ✅ No need to log in again

### 9. **Test Logout**
- Click the "Logout" button
- You should:
  - ✅ Be logged out immediately
  - ✅ See "Login" link appear again
  - ✅ Be redirected to home page

### 10. **Test Login Again**
- Click "Login" again
- This time it should be faster since Google remembers your session
- You may not see the full consent screen again

## Troubleshooting

### Error: "Missing Supabase environment variables"
- Make sure `.env` file exists in project root with valid credentials
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set

### Google OAuth Redirect Loop
- Check that your Supabase project has Google OAuth configured
- Verify the redirect URL in Supabase matches: `http://localhost:5173/auth/callback`

### Session Not Persisting
- Check browser DevTools → Application → IndexedDB
- Supabase stores session in browser storage
- Make sure IndexedDB isn't blocked

### "Sign in with Google" Button Not Working
- Check browser console for errors
- Verify Google OAuth provider is enabled in Supabase
- Check that Client ID and Secret are correct in Supabase

## What to Look For

✅ **Success indicators:**
- Smooth redirect to Google login
- Quick redirect back from Google
- User email displays in navigation
- Session persists on page reload
- Logout works cleanly

⚠️ **Potential issues:**
- Blank auth callback page (likely a redirect issue)
- No user info in nav (session not established)
- Repeated redirects (auth loop)

## Testing Checklist

- [ ] Can reach login page from home
- [ ] Google sign-in button loads
- [ ] Google OAuth consent screen appears
- [ ] Redirects back after approval
- [ ] User email shows in nav
- [ ] Session persists on reload
- [ ] Logout works
- [ ] Can log back in
- [ ] No console errors in DevTools
