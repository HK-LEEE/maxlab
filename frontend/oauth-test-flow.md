# OAuth Popup Communication Test Flow

## Test: "다른 사용자로 로그인" (Login as Different User)

### Expected Behavior

When user clicks "다른 사용자로 로그인" button, this should happen:

1. **Security Cleanup Phase**
   - ✅ Clear auth store
   - ✅ Revoke OAuth tokens (no redirect)
   - ✅ Clear browser storage and cookies
   - ✅ Show cleanup toast

2. **OAuth Popup Phase** 
   - ✅ Open OAuth popup with `prompt=login` parameter
   - ✅ User sees OAuth login form (force new login)
   - ✅ User enters different credentials

3. **Token Exchange Phase**
   - ✅ Popup receives authorization code
   - ✅ Popup exchanges code for tokens
   - ✅ Popup sends `OAUTH_SUCCESS` message to parent

4. **Acknowledgment Phase** (NEW - This fixes the stuck popup)
   - ✅ Parent receives `OAUTH_SUCCESS` message
   - ✅ Parent processes authentication 
   - ✅ Parent sends `OAUTH_ACK` back to popup
   - ✅ Popup waits for `OAUTH_ACK` before closing

5. **Popup Closing Phase** (ENHANCED)
   - ✅ Popup receives `OAUTH_ACK`
   - ✅ Popup shows "✅ 로그인 완료!" message
   - ✅ Popup closes automatically after 100ms
   - ✅ Parent continues with new user session

6. **Fallback Mechanism** (5-second timeout)
   - If no ACK received, show manual close button
   - User can manually close popup
   - Authentication still completes successfully

### Communication Methods (Triple Redundancy)

1. **PostMessage** (Primary)
   - Parent → Popup: `OAUTH_ACK`
   - Popup → Parent: `OAUTH_SUCCESS`

2. **BroadcastChannel** (Fallback)
   - Cross-tab communication
   - Works when postMessage fails

3. **SessionStorage** (Ultimate Fallback)
   - Parent sets `oauth_ack: 'true'`
   - Popup polls every 100ms

### Security Features

- ✅ Origin validation for all messages
- ✅ Proper cleanup of all event listeners
- ✅ No token logging in production
- ✅ Graceful error handling
- ✅ Manual close option as final fallback

## Previous Issue vs Solution

### Before (Broken)
```
1. Popup completes OAuth ✅
2. Popup sends OAUTH_SUCCESS ✅  
3. Parent receives message ✅
4. Popup immediately tries to close ❌
5. Browser security prevents closing ❌
6. Popup stays stuck ❌
```

### After (Fixed)
```
1. Popup completes OAuth ✅
2. Popup sends OAUTH_SUCCESS ✅
3. Parent receives message ✅
4. Parent sends OAUTH_ACK ✅
5. Popup waits for ACK ✅
6. Popup receives ACK ✅
7. Popup shows success message ✅
8. Popup closes gracefully ✅
```

## Test Commands

To test this functionality:

```bash
# Start the development server
npm run dev

# In browser:
# 1. Login with a user
# 2. Click logout
# 3. Click "다른 사용자로 로그인"
# 4. Verify popup opens with OAuth login form
# 5. Enter different credentials
# 6. Verify popup shows "로그인 완료!" and closes
# 7. Verify parent window shows new user
```

## Debug Console Messages

Look for these log messages in browser console:

```
🚪 Different user login button clicked!
🔄 Different user login requested, performing comprehensive security cleanup...
✅ OAuth provider session cleared for different user login
📊 Lookup method used: revocation
✅ Comprehensive security cleanup completed
🚀 About to call loginWithPopupOAuth with forceAccountSelection: true
✅ OAuth popup opened successfully
📤 Preparing to send OAUTH_SUCCESS message...
📤 Sending acknowledgment to popup... (from parent)
✅ Acknowledgment sent to popup (from parent)
📨 Popup received message: {type: 'OAUTH_ACK'} (in popup)
✅ Received acknowledgment from parent, closing popup now (in popup)
✅ 로그인 완료! (popup UI)
```

This comprehensive bidirectional communication ensures the popup closes reliably after successful authentication.