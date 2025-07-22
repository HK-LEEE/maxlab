import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  // Get configuration from environment variables with fallbacks
  const devServerHost = env.VITE_DEV_SERVER_HOST || 'localhost'
  const devServerPort = parseInt(env.VITE_DEV_SERVER_PORT || '3010')
  const apiBaseUrl = env.VITE_API_BASE_URL || 'http://localhost:8010'
  
  return {
    plugins: [react()],
    server: {
      port: devServerPort,
      host: devServerHost === 'localhost' ? true : devServerHost,
      proxy: {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
          secure: apiBaseUrl.startsWith('https://'),
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Environment variables starting with VITE_ are automatically exposed
    define: {
      // Additional environment variables can be defined here if needed
    }
  }
})
