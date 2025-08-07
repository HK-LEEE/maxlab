// Production Runtime Configuration
// This file is loaded at runtime and can be modified without rebuilding
// Place this file at: /var/www/maxlab/frontend/dist/config.js

window.ENV_CONFIG = {
  // OAuth Configuration
  AUTH_SERVER_URL: 'https://max.dwchem.co.kr',
  CLIENT_ID: 'maxlab',
  REDIRECT_URI: 'https://maxlab.dwchem.co.kr/oauth/callback',
  
  // API Configuration
  API_BASE_URL: 'https://maxlab.dwchem.co.kr/api',
  AUTH_API_URL: 'https://maxlab.dwchem.co.kr',
  
  // Environment
  NODE_ENV: 'production',
  ENABLE_DEBUG_LOGS: false,
  
  // Feature Flags
  ENABLE_WEBSOCKET: true,
  
  // OAuth Server Endpoints (for different user login)
  OAUTH_AUTHORIZE_URL: 'https://max.dwchem.co.kr/api/oauth/authorize',
  OAUTH_TOKEN_URL: 'https://max.dwchem.co.kr/api/oauth/token',
  OAUTH_USERINFO_URL: 'https://max.dwchem.co.kr/api/oauth/userinfo',
  OAUTH_LOGOUT_URL: 'https://max.dwchem.co.kr/api/oauth/logout',
  
  // Frontend URLs (for OAuth server callbacks)
  FRONTEND_LOGIN_URL: 'https://maxlab.dwchem.co.kr/login',
  FRONTEND_CALLBACK_URL: 'https://maxlab.dwchem.co.kr/oauth/callback',
  
  // Deployment Info
  VERSION: '1.0.0',
  DEPLOYED_AT: new Date().toISOString()
};