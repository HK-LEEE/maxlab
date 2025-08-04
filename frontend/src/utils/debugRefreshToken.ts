/**
 * Refresh Token Debug Utility
 */

import { refreshTokenService } from '../services/refreshTokenService';
import { secureTokenStorage } from '../services/secureTokenStorage';

export async function debugRefreshToken() {
  console.log('=== 🔍 REFRESH TOKEN DEBUG ===');
  
  // 1. Get stored refresh token
  const refreshToken = await refreshTokenService.getStoredRefreshToken();
  console.log('\n🎟️ Stored Refresh Token:');
  console.log('- Token exists:', !!refreshToken);
  if (refreshToken) {
    console.log('- Token length:', refreshToken.length);
    console.log('- Token preview:', refreshToken.substring(0, 20) + '...');
  }
  
  // 2. Check localStorage directly
  console.log('\n📦 LocalStorage Check:');
  const keys = Object.keys(localStorage).filter(k => 
    k.includes('refresh') || k.includes('token') || k.includes('maxlab')
  );
  keys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value && value.length > 50) {
      console.log(`- ${key}: ${value.substring(0, 30)}...`);
    } else {
      console.log(`- ${key}: ${value}`);
    }
  });
  
  // 3. Check secure storage
  console.log('\n🔐 Secure Storage Status:');
  const storageStatus = await secureTokenStorage.getStorageStatus();
  console.log('- Has encrypted token:', storageStatus.hasEncryptedToken);
  console.log('- Has plaintext token:', storageStatus.hasPlaintextToken);
  
  // 4. Try to decode token structure (without verification)
  if (refreshToken) {
    try {
      // Check if it's a JWT
      const parts = refreshToken.split('.');
      if (parts.length === 3) {
        console.log('\n📋 Token Structure:');
        console.log('- Format: JWT');
        console.log('- Parts: header.payload.signature');
        
        // Decode header
        const header = JSON.parse(atob(parts[0]));
        console.log('- Header:', header);
        
        // Decode payload (safe, no signature verification)
        const payload = JSON.parse(atob(parts[1]));
        console.log('- Payload:', {
          ...payload,
          // Hide sensitive data
          sub: payload.sub ? '***' : undefined,
          user_id: payload.user_id ? '***' : undefined
        });
        console.log('- Issued at:', payload.iat ? new Date(payload.iat * 1000).toISOString() : 'N/A');
        console.log('- Expires at:', payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A');
      } else {
        console.log('\n📋 Token Structure:');
        console.log('- Format: Opaque token (not JWT)');
      }
    } catch (e) {
      console.log('\n📋 Token Structure:');
      console.log('- Format: Unknown or invalid');
    }
  }
  
  // 5. Test token exchange parameters
  console.log('\n🔧 Token Exchange Config:');
  console.log('- Auth URL:', import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:8000');
  console.log('- Client ID:', import.meta.env.VITE_CLIENT_ID || 'maxlab');
  console.log('- Client Secret:', import.meta.env.VITE_CLIENT_SECRET ? '***' : 'Not configured');
  
  console.log('\n=== 🔍 END DEBUG ===');
  
  return {
    hasToken: !!refreshToken,
    tokenLength: refreshToken?.length,
    storageStatus
  };
}

// Export to window
if (typeof window !== 'undefined') {
  (window as any).debugRefreshToken = debugRefreshToken;
  // Debug utility console log removed
}