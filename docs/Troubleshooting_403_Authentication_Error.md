# Troubleshooting 403 Authentication Error

## Problem
Getting "403 Forbidden" error when trying to save a Process Flow, with the message "User not authenticated, stopping auto refresh" in the console.

## Root Cause
The user is not authenticated. The Process Flow API endpoints require authentication via JWT token, but the request is being made without a valid authentication token.

## Solution

### 1. Ensure User is Logged In
1. Navigate to the login page
2. Enter valid credentials
3. Ensure login is successful
4. Check that `localStorage.getItem('accessToken')` returns a valid token in browser console

### 2. Check Token in Browser
Open browser developer console and run:
```javascript
// Check if token exists
console.log('Access Token:', localStorage.getItem('accessToken'));

// Check if token is being sent
// Look at Network tab for the failed request
// Check the Authorization header
```

### 3. Verify API Client Configuration
The API client should automatically add the Authorization header:
```javascript
// In frontend/src/api/client.ts
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // ... rest of the interceptor
});
```

### 4. Backend Authentication Check
The backend expects authentication for all Process Flow endpoints:
```python
# In backend/app/routers/personal_test_process_flow.py
current_user: Dict[str, Any] = Depends(get_current_active_user)
```

## Quick Fix Steps

1. **Logout and Login Again**
   - Click logout button or clear localStorage
   - Login with valid credentials
   - Try saving the flow again

2. **Clear Browser Storage** (if login doesn't work)
   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   // Then refresh and login again
   ```

3. **Check Backend is Running**
   - Ensure backend server is running on port 8010
   - Check `http://localhost:8010/health`

4. **Verify Auth Server**
   - The auth requests go through the Max Lab backend proxy
   - Ensure the auth server is accessible

## Testing After Fix

1. Login successfully
2. Open Process Flow Editor
3. Create a new flow
4. Save - the scope selection dialog should appear
5. Select scope (User or Workspace)
6. Flow should save successfully

## Common Issues

### Token Expired
- Tokens expire after a certain time
- Solution: Re-login to get a fresh token

### CORS Issues
- Check browser console for CORS errors
- Ensure backend CORS settings allow frontend origin

### Backend Not Running
- Check if backend is running: `curl http://localhost:8010/health`
- Start backend if needed: `cd backend && uvicorn app.main:app --reload --port 8010`

## Note on RBAC Implementation
The RBAC scope implementation is working correctly. The 403 error is specifically due to missing authentication, not permission issues with the scope system. Once authenticated, the scope selection and permissions will work as designed.