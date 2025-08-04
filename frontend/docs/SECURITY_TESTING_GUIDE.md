# Security Testing Guide

## Quick Start

To test the security features implementation, follow these steps:

### 1. Import Test Suite in Browser Console

Open your browser's developer console (F12) and run:

```javascript
// Import the test suite (if not already loaded)
import('/src/utils/testSecurityFeatures.ts');
```

### 2. Run Individual Tests

```javascript
// Test browser cleanup functionality
await testSecurityFeatures.testBrowserCleanup();

// Test user-isolated token storage
await testSecurityFeatures.testUserIsolatedStorage();

// Test security headers
testSecurityFeatures.testSecurityHeaders();

// Test login flow security
await testSecurityFeatures.testLoginFlowSecurity();
```

### 3. Run All Tests

```javascript
// Run complete test suite
await testSecurityFeatures.runAllTests();
```

## Manual Testing Scenarios

### Scenario 1: User Switching Security

1. **Login as User A**:
   - Click "MAX Platform으로 로그인"
   - Complete OAuth login
   - Note the current user displayed

2. **Switch to User B**:
   - Click "다른 사용자로 로그인" button
   - Watch for "보안 정리 중..." message
   - Complete OAuth login with different account
   - Verify User A's data is completely cleared

3. **Verify Cleanup**:
   ```javascript
   // Check storage after user switch
   await browserSecurityCleanup.getStorageReport();
   
   // Check user isolation
   userIsolatedTokenStorage.getStoredUsers();
   ```

### Scenario 2: Logout Security

1. **Before Logout**:
   ```javascript
   // Check current storage
   await browserSecurityCleanup.getStorageReport();
   ```

2. **Perform Logout**:
   - Click logout button
   - Wait for completion

3. **After Logout**:
   ```javascript
   // Verify complete cleanup
   await browserSecurityCleanup.getStorageReport();
   
   // Should show minimal storage usage
   ```

### Scenario 3: Security Headers Verification

1. **Open Network Tab** in Developer Tools

2. **Make API Request**:
   - Navigate to any page that calls the API
   - Or trigger an action that makes an API call

3. **Check Request Headers**:
   Look for these security headers:
   - `X-User-Context`
   - `X-Client-Version`
   - `X-Security-Token`
   - `X-Request-Id`
   - `X-Request-Timestamp`
   - `X-Device-Fingerprint`
   - `X-Frame-Options`
   - `X-Content-Type-Options`
   - `X-XSS-Protection`

## Expected Results

### ✅ Browser Cleanup Test
- All storage types should be cleared
- Preserved keys (theme, language) should remain
- Cleanup should complete in < 500ms

### ✅ User Isolation Test
- Each user's tokens stored separately
- No cross-user token leakage
- Security audit shows correct user count

### ✅ Security Headers Test
- All required headers present
- User context correctly set when authenticated
- Device fingerprint generated

### ✅ Login Flow Test
- Authentication state correctly reported
- Multiple user detection working
- Storage report accurate

## Troubleshooting

### Issue: Tests fail to import
**Solution**: Ensure you're running the tests from the development server with proper module support.

### Issue: Cleanup takes too long
**Solution**: Check for large IndexedDB databases or excessive cache storage. The cleanup is comprehensive but should still complete quickly.

### Issue: User tokens not isolated
**Solution**: Verify that user IDs are being correctly passed during login. Check the authentication flow.

### Issue: Security headers missing
**Solution**: Check that the API client interceptors are properly configured. Verify the import paths are correct.

## Debug Commands

```javascript
// Check current authentication state
authService.getAuthDebugInfo();

// Check user-isolated storage status
await userIsolatedTokenStorage.performSecurityAudit();

// Check security headers configuration
securityHeaders.getConfig();

// Get device fingerprint info
securityHeaders.getDebugInfo();

// Check browser storage usage
await browserSecurityCleanup.getStorageReport();
```

## Performance Benchmarks

Expected performance for security operations:

- **Browser Cleanup**: < 500ms for typical usage
- **User Token Save**: < 50ms
- **Security Headers Generation**: < 10ms
- **User Switch (complete flow)**: < 2 seconds

## Security Verification Checklist

- [ ] Browser state completely cleared on logout
- [ ] User switching clears previous user data
- [ ] Tokens isolated per user
- [ ] Security headers present on all API requests
- [ ] Device fingerprint generated and consistent
- [ ] No sensitive data in localStorage after logout
- [ ] Cookie cleanup working across domains
- [ ] IndexedDB cleared on user switch
- [ ] Session storage cleared appropriately
- [ ] User preferences preserved during cleanup