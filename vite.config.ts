import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { // <--- ADD THIS SERVER CONFIGURATION BLOCK
    hmr: {
      // If using a proxy like ngrok, you might need to configure the HMR client port
      // clientPort: 443, // Or whatever port ngrok is exposing for HTTPS, if HMR issues persist
    },
    host: true, // Optional: This makes the server listen on all network interfaces (0.0.0.0)
                // which is often needed for ngrok to connect properly from outside.
    allowedHosts: [
      "https://zw70f854-5173.asse.devtunnels.ms/", 
      // <<< ADD YOUR NGROK HOSTNAME HERE
      // You can add more if needed, or use a wildcard if you understand the security implications
      // '.ngrok-free.app' // More permissive, allows any subdomain of ngrok-free.app
    ],
  },
})
